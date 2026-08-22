import type { PermissionAction, PermissionDomain } from '@family-app/domain';
import { PROPOSED_ACTION_TYPES } from './types';
import type { ProposedActionType } from './types';

export type AiToolRisk = 'REVERSIBLE_WRITE' | 'SENSITIVE_WRITE';

export interface AiActionToolDefinition {
  name: ProposedActionType;
  description: string;
  executionMode: 'PROPOSAL_ONLY';
  risk: AiToolRisk;
  requiredAuthorization: Array<{ domain: PermissionDomain; action: PermissionAction }>;
  requiresExplicitConfirmation: true;
}

/**
 * Canonical application-layer registry for every action the assistant may
 * prepare. No model-provided tool name or permission is trusted at runtime.
 * All writes remain proposal-only and pass through confirmation plus a fresh
 * Policy Engine check before the domain service is called.
 */
export const AI_ACTION_TOOL_REGISTRY: Record<ProposedActionType, AiActionToolDefinition> = {
  PROPOSE_TASK: {
    name: 'PROPOSE_TASK',
    description: 'Preparar uma tarefa familiar para revisão.',
    executionMode: 'PROPOSAL_ONLY',
    risk: 'REVERSIBLE_WRITE',
    requiredAuthorization: [{ domain: 'SCHEDULE', action: 'CREATE' }],
    requiresExplicitConfirmation: true,
  },
  PROPOSE_CALENDAR_EVENT: {
    name: 'PROPOSE_CALENDAR_EVENT',
    description: 'Preparar um compromisso da agenda para revisão.',
    executionMode: 'PROPOSAL_ONLY',
    risk: 'REVERSIBLE_WRITE',
    requiredAuthorization: [{ domain: 'SCHEDULE', action: 'CREATE' }],
    requiresExplicitConfirmation: true,
  },
  PROPOSE_REQUEST: {
    name: 'PROPOSE_REQUEST',
    description: 'Preparar um pedido de ajuda sem enviá-lo.',
    executionMode: 'PROPOSAL_ONLY',
    risk: 'SENSITIVE_WRITE',
    requiredAuthorization: [{ domain: 'TRANSPORTATION', action: 'CREATE' }],
    requiresExplicitConfirmation: true,
  },
  PROPOSE_RESPONSIBILITY_ASSIGNMENT: {
    name: 'PROPOSE_RESPONSIBILITY_ASSIGNMENT',
    description: 'Preparar uma atribuição de responsabilidade familiar.',
    executionMode: 'PROPOSAL_ONLY',
    risk: 'SENSITIVE_WRITE',
    requiredAuthorization: [{ domain: 'SCHEDULE', action: 'MANAGE' }],
    requiresExplicitConfirmation: true,
  },
  PROPOSE_REMINDER: {
    name: 'PROPOSE_REMINDER',
    description: 'Preparar um lembrete para revisão.',
    executionMode: 'PROPOSAL_ONLY',
    risk: 'REVERSIBLE_WRITE',
    requiredAuthorization: [{ domain: 'SCHEDULE', action: 'CREATE' }],
    requiresExplicitConfirmation: true,
  },
  PROPOSE_PREPARATION_CHECKLIST: {
    name: 'PROPOSE_PREPARATION_CHECKLIST',
    description: 'Preparar uma lista de itens para um compromisso.',
    executionMode: 'PROPOSAL_ONLY',
    risk: 'REVERSIBLE_WRITE',
    requiredAuthorization: [{ domain: 'SCHEDULE', action: 'CREATE' }],
    requiresExplicitConfirmation: true,
  },
  PROPOSE_CARE_BRIEF: {
    name: 'PROPOSE_CARE_BRIEF',
    description: 'Preparar um resumo de cuidado com dados sensíveis.',
    executionMode: 'PROPOSAL_ONLY',
    risk: 'SENSITIVE_WRITE',
    requiredAuthorization: [{ domain: 'HEALTH', action: 'CREATE' }],
    requiresExplicitConfirmation: true,
  },
  PROPOSE_HANDOFF: {
    name: 'PROPOSE_HANDOFF',
    description: 'Preparar uma passagem de cuidado entre responsáveis.',
    executionMode: 'PROPOSAL_ONLY',
    risk: 'SENSITIVE_WRITE',
    requiredAuthorization: [{ domain: 'SCHEDULE', action: 'MANAGE' }],
    requiresExplicitConfirmation: true,
  },
  PROPOSE_SCHEDULE_ADJUSTMENT: {
    name: 'PROPOSE_SCHEDULE_ADJUSTMENT',
    description: 'Preparar uma alteração de agenda para revisão.',
    executionMode: 'PROPOSAL_ONLY',
    risk: 'SENSITIVE_WRITE',
    requiredAuthorization: [{ domain: 'SCHEDULE', action: 'EDIT' }],
    requiresExplicitConfirmation: true,
  },
};

export function getAiActionTool(type: ProposedActionType): AiActionToolDefinition {
  return AI_ACTION_TOOL_REGISTRY[type];
}

// Compile-time/runtime guard against adding a new action without governance.
if (Object.keys(AI_ACTION_TOOL_REGISTRY).length !== PROPOSED_ACTION_TYPES.length) {
  throw new Error('O registro de ferramentas da IA está incompleto.');
}
