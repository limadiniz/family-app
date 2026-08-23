import type { PermissionDomain } from '@family-app/domain';
import { PROPOSED_ACTION_TYPES, type ProposedActionType } from './types';

export const DEFAULT_AGENT_BUDGET = {
  maxSteps: 4,
  maxToolCalls: 5,
  maxReflections: 1,
} as const;

export type AgentPlanStep =
  | {
      type: 'READ_TOOL';
      toolName: string;
      arguments: Record<string, unknown>;
      subjectPersonIds: string[];
      domains: PermissionDomain[];
    }
  | { type: 'REFLECT'; critique: string }
  | {
      type: 'PROPOSE_ACTION';
      actionType: ProposedActionType;
      payload: Record<string, unknown>;
      subjectPersonIds: string[];
      domains: PermissionDomain[];
    }
  | { type: 'FINAL'; answer: string };

export type AgentPlanner = (state: {
  objective: string;
  stepNumber: number;
  toolResults: Array<{ toolName: string; result: unknown }>;
  reflectionCount: number;
}) => Promise<AgentPlanStep>;

export type SupervisedAgentResult =
  | { status: 'COMPLETED'; answer: string; steps: number; toolCalls: number; reflections: number }
  | {
      status: 'WAITING_FOR_CONFIRMATION';
      proposal: { actionType: ProposedActionType; payload: Record<string, unknown> };
      steps: number;
      toolCalls: number;
      reflections: number;
    }
  | { status: 'STOPPED'; reason: string; steps: number; toolCalls: number; reflections: number };

function isSubset<T>(requested: T[], allowed: ReadonlySet<T>): boolean {
  return requested.every((item) => allowed.has(item));
}

export async function runSupervisedAgent(input: {
  objective: string;
  allowedTools: ReadonlySet<string>;
  allowedSubjectPersonIds: ReadonlySet<string>;
  allowedDomains: ReadonlySet<PermissionDomain>;
  planner: AgentPlanner;
  executeReadTool: (step: Extract<AgentPlanStep, { type: 'READ_TOOL' }>) => Promise<unknown>;
  budget?: { maxSteps: number; maxToolCalls: number; maxReflections: number };
}): Promise<SupervisedAgentResult> {
  const budget = input.budget ?? DEFAULT_AGENT_BUDGET;
  const toolResults: Array<{ toolName: string; result: unknown }> = [];
  let toolCalls = 0;
  let reflections = 0;

  for (let steps = 1; steps <= budget.maxSteps; steps += 1) {
    const plan = await input.planner({
      objective: input.objective,
      stepNumber: steps,
      toolResults: [...toolResults],
      reflectionCount: reflections,
    });
    if (plan.type === 'FINAL') {
      return { status: 'COMPLETED', answer: plan.answer, steps, toolCalls, reflections };
    }
    if (plan.type === 'REFLECT') {
      if (reflections >= budget.maxReflections) {
        return {
          status: 'STOPPED',
          reason: 'REFLECTION_BUDGET_EXCEEDED',
          steps,
          toolCalls,
          reflections,
        };
      }
      reflections += 1;
      continue;
    }
    if (plan.type === 'PROPOSE_ACTION') {
      if (!PROPOSED_ACTION_TYPES.includes(plan.actionType)) {
        return {
          status: 'STOPPED',
          reason: 'ACTION_NOT_ALLOWLISTED',
          steps,
          toolCalls,
          reflections,
        };
      }
      if (
        !isSubset(plan.subjectPersonIds, input.allowedSubjectPersonIds) ||
        !isSubset(plan.domains, input.allowedDomains)
      ) {
        return {
          status: 'STOPPED',
          reason: 'PROPOSAL_SCOPE_EXPANSION_DENIED',
          steps,
          toolCalls,
          reflections,
        };
      }
      return {
        status: 'WAITING_FOR_CONFIRMATION',
        proposal: { actionType: plan.actionType, payload: plan.payload },
        steps,
        toolCalls,
        reflections,
      };
    }

    if (
      !input.allowedTools.has(plan.toolName) ||
      !isSubset(plan.subjectPersonIds, input.allowedSubjectPersonIds) ||
      !isSubset(plan.domains, input.allowedDomains) ||
      typeof plan.arguments.subjectPersonId !== 'string' ||
      !plan.subjectPersonIds.includes(plan.arguments.subjectPersonId)
    ) {
      return {
        status: 'STOPPED',
        reason: 'TOOL_SCOPE_EXPANSION_DENIED',
        steps,
        toolCalls,
        reflections,
      };
    }
    if (toolCalls >= budget.maxToolCalls) {
      return { status: 'STOPPED', reason: 'TOOL_BUDGET_EXCEEDED', steps, toolCalls, reflections };
    }
    toolCalls += 1;
    toolResults.push({ toolName: plan.toolName, result: await input.executeReadTool(plan) });
  }

  return {
    status: 'STOPPED',
    reason: 'STEP_BUDGET_EXCEEDED',
    steps: budget.maxSteps,
    toolCalls,
    reflections,
  };
}
