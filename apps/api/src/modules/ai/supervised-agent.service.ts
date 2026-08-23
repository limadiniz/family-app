import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DEFAULT_AGENT_BUDGET,
  MCP_READ_TOOLS,
  MCP_READ_TOOL_REGISTRY,
  runSupervisedAgent,
  type AgentPlanner,
  type McpReadToolName,
} from '@family-app/ai';
import { loadFeatureFlags, resolveAiCapabilityGate } from '@family-app/config';
import type { PermissionDomain } from '@family-app/domain';
import type { RequestActor } from '../../common/auth.guard';
import { PolicyService } from '../../common/policy.service';
import { SupabaseService } from '../../common/supabase.service';
import { AI_CAPABILITY_READINESS } from './ai-capability-readiness';
import { McpProxyService } from './mcp-proxy.service';

export const AI_AGENT_PLANNER = Symbol('AI_AGENT_PLANNER');

@Injectable()
export class SupervisedAgentService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly policy: PolicyService,
    private readonly mcp: McpProxyService,
    @Optional() @Inject(AI_AGENT_PLANNER) private readonly planner?: AgentPlanner,
  ) {}

  async run(actor: RequestActor, objective: string) {
    const normalizedObjective = typeof objective === 'string' ? objective.trim() : '';
    if (normalizedObjective.length < 2 || normalizedObjective.length > 1000) {
      throw new BadRequestException('Descreva o objetivo em até 1.000 caracteres.');
    }
    const gate = resolveAiCapabilityGate(
      'AGENT_LOOP',
      loadFeatureFlags(),
      AI_CAPABILITY_READINESS.AGENT_LOOP,
    );
    if (gate.mode !== 'ENABLED' || !this.planner) {
      throw new ServiceUnavailableException({
        code: 'SUPERVISED_AGENT_NOT_AVAILABLE',
        missingRequirements:
          gate.mode === 'ENABLED' ? ['AGENT_PLANNER_NOT_CONFIGURED'] : gate.missingRequirements,
      });
    }
    if (!actor.tenantId || !actor.personId) {
      throw new ServiceUnavailableException({ code: 'ONBOARDING_REQUIRED' });
    }

    const startedAt = Date.now();
    const subjectPersonIds = await this.resolveVisibleSubjects(actor);
    const allowedDomains = new Set<PermissionDomain>(
      MCP_READ_TOOLS.flatMap((toolName) =>
        MCP_READ_TOOL_REGISTRY[toolName].requiredAuthorization.map(
          (requirement) => requirement.domain,
        ),
      ),
    );

    try {
      const result = await runSupervisedAgent({
        objective: normalizedObjective,
        allowedTools: new Set(MCP_READ_TOOLS),
        allowedSubjectPersonIds: new Set(subjectPersonIds),
        allowedDomains,
        planner: this.planner,
        executeReadTool: (step) =>
          this.mcp.callRead(actor, {
            toolName: step.toolName as McpReadToolName,
            arguments: step.arguments,
            requestId: `agent:${actor.personId}:${Date.now()}`,
          }),
      });
      await this.record(
        actor,
        result,
        subjectPersonIds.length,
        [...allowedDomains],
        Date.now() - startedAt,
      );
      return result;
    } catch (error) {
      await this.record(
        actor,
        {
          status: 'STOPPED',
          reason: 'AGENT_EXECUTION_ERROR',
          steps: 0,
          toolCalls: 0,
          reflections: 0,
        },
        subjectPersonIds.length,
        [...allowedDomains],
        Date.now() - startedAt,
      );
      throw error;
    }
  }

  private async resolveVisibleSubjects(actor: RequestActor): Promise<string[]> {
    const { data, error } = await this.supabase
      .forUser(actor.bearerToken)
      .from('persons')
      .select('id')
      .limit(100);
    if (error) throw new ServiceUnavailableException({ code: 'FAMILY_SCOPE_UNAVAILABLE' });

    const visible: string[] = [];
    for (const row of data ?? []) {
      const personId = row.id as string;
      const allowed = await this.policy
        .authorizeOrThrow(actor, 'VIEW', 'PROFILE', personId, {
          purpose: 'supervised_agent_family_scope',
        })
        .then(() => true)
        .catch(() => false);
      if (allowed) visible.push(personId);
    }
    return visible;
  }

  private async record(
    actor: RequestActor,
    result: {
      status: 'COMPLETED' | 'WAITING_FOR_CONFIRMATION' | 'STOPPED';
      steps: number;
      toolCalls: number;
      reflections: number;
      reason?: string;
    },
    subjectCount: number,
    domains: PermissionDomain[],
    latencyMs: number,
  ): Promise<void> {
    const { error } = await this.supabase
      .forUser(actor.bearerToken)
      .from('ai_agent_runs')
      .insert({
        tenant_id: actor.tenantId,
        actor_person_id: actor.personId,
        state: result.status,
        stop_reason: result.reason ?? null,
        step_count: result.steps,
        tool_call_count: result.toolCalls,
        reflection_count: result.reflections,
        max_steps: DEFAULT_AGENT_BUDGET.maxSteps,
        max_tool_calls: DEFAULT_AGENT_BUDGET.maxToolCalls,
        max_reflections: DEFAULT_AGENT_BUDGET.maxReflections,
        subject_count: subjectCount,
        domains,
        latency_ms: Math.max(0, latencyMs),
      });
    if (error) return;
  }
}
