import { Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import {
  MCP_READ_TOOL_REGISTRY,
  executeGovernedMcpRead,
  type McpConnectorExecutor,
  type McpReadToolName,
} from '@family-app/ai';
import { loadFeatureFlags, resolveAiCapabilityGate } from '@family-app/config';
import type { RequestActor } from '../../common/auth.guard';
import { PolicyService } from '../../common/policy.service';
import { SupabaseService } from '../../common/supabase.service';
import { AI_CAPABILITY_READINESS } from './ai-capability-readiness';

export const MCP_CONNECTOR_EXECUTOR = Symbol('MCP_CONNECTOR_EXECUTOR');

/** Server-side MCP boundary. The model chooses an allowlisted logical tool;
 * connector identity and remote method always come from the local registry. */
@Injectable()
export class McpProxyService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly policy: PolicyService,
    @Optional() @Inject(MCP_CONNECTOR_EXECUTOR) private readonly executor?: McpConnectorExecutor,
  ) {}

  async callRead(
    actor: RequestActor,
    input: {
      toolName: McpReadToolName;
      arguments: Record<string, unknown>;
      requestId: string;
    },
  ) {
    const startedAt = Date.now();
    const gate = resolveAiCapabilityGate(
      'MCP_READ',
      loadFeatureFlags(),
      AI_CAPABILITY_READINESS.MCP_READ,
    );
    if (gate.mode !== 'ENABLED' || !this.executor) {
      throw new ServiceUnavailableException({
        code: 'MCP_NOT_AVAILABLE',
        missingRequirements:
          gate.mode === 'ENABLED'
            ? ['CONNECTOR_EXECUTOR_NOT_CONFIGURED']
            : gate.missingRequirements,
      });
    }

    const subjectPersonId = input.arguments.subjectPersonId;
    if (typeof subjectPersonId !== 'string') {
      await this.record(actor, input, 'DENIED', Date.now() - startedAt, 'SUBJECT_REQUIRED');
      throw new ServiceUnavailableException({ code: 'MCP_SUBJECT_REQUIRED' });
    }

    try {
      const result = await executeGovernedMcpRead({
        ...input,
        executor: this.executor,
        authorize: async (requirement) =>
          this.policy.authorizeOrThrow(
            actor,
            requirement.action,
            requirement.domain,
            subjectPersonId,
            { purpose: 'governed_mcp_read' },
          ),
      });
      await this.record(actor, input, 'SUCCESS', Date.now() - startedAt);
      return result;
    } catch (error) {
      await this.record(
        actor,
        input,
        'ERROR',
        Date.now() - startedAt,
        error instanceof Error ? error.message.slice(0, 100) : 'MCP_UNKNOWN_ERROR',
      );
      throw error;
    }
  }

  private async record(
    actor: RequestActor,
    input: { toolName: McpReadToolName; arguments: Record<string, unknown>; requestId: string },
    outcome: 'SUCCESS' | 'DENIED' | 'BLOCKED' | 'ERROR',
    latencyMs: number,
    errorCode?: string,
  ): Promise<void> {
    if (!actor.tenantId || !actor.personId) return;
    const definition = MCP_READ_TOOL_REGISTRY[input.toolName];
    const { error } = await this.supabase
      .forUser(actor.bearerToken)
      .from('ai_tool_runs')
      .insert({
        tenant_id: actor.tenantId,
        actor_person_id: actor.personId,
        request_id: input.requestId.slice(0, 200),
        tool_name: input.toolName,
        connector_id: definition?.connectorId ?? null,
        risk: 'READ_ONLY',
        execution_mode: 'READ',
        subject_count: typeof input.arguments.subjectPersonId === 'string' ? 1 : 0,
        domains: definition?.requiredAuthorization.map((requirement) => requirement.domain) ?? [],
        outcome,
        latency_ms: Math.max(0, latencyMs),
        error_code: errorCode ?? null,
      });
    if (error) return;
  }
}
