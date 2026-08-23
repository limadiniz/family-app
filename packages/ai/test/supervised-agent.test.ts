import { describe, expect, it, vi } from 'vitest';
import { runSupervisedAgent, type AgentPlanStep } from '../src/supervised-agent';

const scope = {
  allowedTools: new Set(['READ_SCHOOL_NOTICES']),
  allowedSubjectPersonIds: new Set(['child-1']),
  allowedDomains: new Set(['SCHOOL' as const]),
};

describe('supervised agent state machine', () => {
  it('uses read tools and returns a proposal without executing a write', async () => {
    const plans: AgentPlanStep[] = [
      {
        type: 'READ_TOOL',
        toolName: 'READ_SCHOOL_NOTICES',
        arguments: { subjectPersonId: 'child-1' },
        subjectPersonIds: ['child-1'],
        domains: ['SCHOOL'],
      },
      {
        type: 'PROPOSE_ACTION',
        actionType: 'PROPOSE_TASK',
        payload: { title: 'Entregar autorização' },
        subjectPersonIds: ['child-1'],
        domains: ['SCHOOL'],
      },
    ];
    const executeReadTool = vi.fn().mockResolvedValue({ notices: [] });
    const result = await runSupervisedAgent({
      objective: 'Organizar o comunicado',
      ...scope,
      planner: async () => plans.shift()!,
      executeReadTool,
    });
    expect(executeReadTool).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        status: 'WAITING_FOR_CONFIRMATION',
        proposal: { actionType: 'PROPOSE_TASK', payload: { title: 'Entregar autorização' } },
      }),
    );
  });

  it('stops when a plan expands person or domain scope', async () => {
    const executeReadTool = vi.fn();
    const result = await runSupervisedAgent({
      objective: 'Consultar dados',
      ...scope,
      planner: async () => ({
        type: 'READ_TOOL',
        toolName: 'READ_SCHOOL_NOTICES',
        arguments: { subjectPersonId: 'other-child' },
        subjectPersonIds: ['other-child'],
        domains: ['HEALTH'],
      }),
      executeReadTool,
    });
    expect(result).toEqual(
      expect.objectContaining({ status: 'STOPPED', reason: 'TOOL_SCOPE_EXPANSION_DENIED' }),
    );
    expect(executeReadTool).not.toHaveBeenCalled();
  });

  it('stops a proposal that expands its declared scope', async () => {
    const result = await runSupervisedAgent({
      objective: 'Criar tarefa',
      ...scope,
      planner: async () => ({
        type: 'PROPOSE_ACTION',
        actionType: 'PROPOSE_TASK',
        payload: { title: 'Tarefa' },
        subjectPersonIds: ['other-child'],
        domains: ['SCHOOL'],
      }),
      executeReadTool: vi.fn(),
    });
    expect(result).toEqual(
      expect.objectContaining({ status: 'STOPPED', reason: 'PROPOSAL_SCOPE_EXPANSION_DENIED' }),
    );
  });

  it('enforces reflection and step budgets', async () => {
    const reflection = await runSupervisedAgent({
      objective: 'Refletir',
      ...scope,
      planner: async () => ({ type: 'REFLECT', critique: 'Tentar novamente' }),
      executeReadTool: vi.fn(),
    });
    expect(reflection).toEqual(
      expect.objectContaining({ status: 'STOPPED', reason: 'REFLECTION_BUDGET_EXCEEDED' }),
    );

    const steps = await runSupervisedAgent({
      objective: 'Consultar',
      ...scope,
      budget: { maxSteps: 2, maxToolCalls: 5, maxReflections: 1 },
      planner: async () => ({
        type: 'READ_TOOL',
        toolName: 'READ_SCHOOL_NOTICES',
        arguments: { subjectPersonId: 'child-1' },
        subjectPersonIds: ['child-1'],
        domains: ['SCHOOL'],
      }),
      executeReadTool: vi.fn().mockResolvedValue({}),
    });
    expect(steps).toEqual(
      expect.objectContaining({ status: 'STOPPED', reason: 'STEP_BUDGET_EXCEEDED' }),
    );
  });
});
