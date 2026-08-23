import type { FeatureFlags } from './feature-flags';

export const AI_ADVANCED_CAPABILITIES = [
  'VECTOR_SEARCH',
  'EXACT_CACHE',
  'SEMANTIC_CACHE',
  'MCP_READ',
  'MCP_PROPOSALS',
  'AGENT_LOOP',
  'FINE_TUNED_MODEL',
] as const;

export type AiAdvancedCapability = (typeof AI_ADVANCED_CAPABILITIES)[number];

export const AI_READINESS_REQUIREMENTS = [
  'IMPLEMENTATION_READY',
  'PROVIDER_APPROVED',
  'PRIVACY_APPROVED',
  'INVALIDATION_READY',
  'SAFETY_EVALUATED',
] as const;

export type AiReadinessRequirement = (typeof AI_READINESS_REQUIREMENTS)[number];

export type AiCapabilityReadinessEvidence = Record<AiReadinessRequirement, boolean>;

export type AiCapabilityGate = {
  capability: AiAdvancedCapability;
  requested: boolean;
  mode: 'DISABLED' | 'BLOCKED' | 'SHADOW' | 'ENABLED';
  missingRequirements: string[];
};

const CAPABILITY_REQUIREMENTS: Record<AiAdvancedCapability, AiReadinessRequirement[]> = {
  VECTOR_SEARCH: [
    'IMPLEMENTATION_READY',
    'PROVIDER_APPROVED',
    'PRIVACY_APPROVED',
    'INVALIDATION_READY',
    'SAFETY_EVALUATED',
  ],
  EXACT_CACHE: [
    'IMPLEMENTATION_READY',
    'PRIVACY_APPROVED',
    'INVALIDATION_READY',
    'SAFETY_EVALUATED',
  ],
  SEMANTIC_CACHE: [
    'IMPLEMENTATION_READY',
    'PROVIDER_APPROVED',
    'PRIVACY_APPROVED',
    'INVALIDATION_READY',
    'SAFETY_EVALUATED',
  ],
  MCP_READ: ['IMPLEMENTATION_READY', 'PROVIDER_APPROVED', 'PRIVACY_APPROVED', 'SAFETY_EVALUATED'],
  MCP_PROPOSALS: [
    'IMPLEMENTATION_READY',
    'PROVIDER_APPROVED',
    'PRIVACY_APPROVED',
    'INVALIDATION_READY',
    'SAFETY_EVALUATED',
  ],
  AGENT_LOOP: ['IMPLEMENTATION_READY', 'PROVIDER_APPROVED', 'PRIVACY_APPROVED', 'SAFETY_EVALUATED'],
  FINE_TUNED_MODEL: [
    'IMPLEMENTATION_READY',
    'PROVIDER_APPROVED',
    'PRIVACY_APPROVED',
    'SAFETY_EVALUATED',
  ],
};

function isRequested(capability: AiAdvancedCapability, flags: FeatureFlags): boolean {
  switch (capability) {
    case 'VECTOR_SEARCH':
      return flags.AI_VECTOR_SEARCH_ENABLED || flags.AI_VECTOR_SHADOW_ENABLED;
    case 'SEMANTIC_CACHE':
      return flags.AI_SEMANTIC_CACHE_ENABLED;
    case 'EXACT_CACHE':
      return flags.AI_EXACT_CACHE_ENABLED;
    case 'MCP_READ':
      return flags.AI_MCP_READ_ENABLED;
    case 'MCP_PROPOSALS':
      return flags.AI_MCP_PROPOSALS_ENABLED;
    case 'AGENT_LOOP':
      return flags.AI_AGENT_LOOP_ENABLED;
    case 'FINE_TUNED_MODEL':
      return flags.AI_FINE_TUNED_MODEL_ENABLED;
  }
}

/**
 * Environment flags express rollout intent, never readiness. A capability is
 * enabled only when code-owned evidence confirms every applicable gate.
 */
export function resolveAiCapabilityGate(
  capability: AiAdvancedCapability,
  flags: FeatureFlags,
  evidence: AiCapabilityReadinessEvidence,
): AiCapabilityGate {
  const requested = isRequested(capability, flags);
  if (!requested) return { capability, requested, mode: 'DISABLED', missingRequirements: [] };

  const missingRequirements: string[] = CAPABILITY_REQUIREMENTS[capability].filter(
    (requirement) => !evidence[requirement],
  );
  if (!flags.AI_ENABLED) missingRequirements.unshift('BASE_AI_ENABLED');
  if (capability === 'MCP_PROPOSALS' && !flags.AI_MCP_READ_ENABLED) {
    missingRequirements.push('MCP_READ_ENABLED');
  }

  if (missingRequirements.length > 0) {
    return {
      capability,
      requested,
      mode: 'BLOCKED',
      missingRequirements: [...new Set(missingRequirements)],
    };
  }

  const mode =
    capability === 'VECTOR_SEARCH' && !flags.AI_VECTOR_SEARCH_ENABLED ? 'SHADOW' : 'ENABLED';
  return { capability, requested, mode, missingRequirements: [] };
}
