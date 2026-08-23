import type { AiAdvancedCapability, AiCapabilityReadinessEvidence } from '@family-app/config';

/**
 * Auditable, code-owned readiness evidence. Feature flags cannot change these
 * values. Each capability phase must update its own evidence only after its
 * implementation, privacy review, invalidation and safety gates are complete.
 */
export const AI_CAPABILITY_READINESS: Record<AiAdvancedCapability, AiCapabilityReadinessEvidence> =
  {
    VECTOR_SEARCH: {
      IMPLEMENTATION_READY: true,
      PROVIDER_APPROVED: false,
      PRIVACY_APPROVED: false,
      INVALIDATION_READY: true,
      SAFETY_EVALUATED: false,
    },
    EXACT_CACHE: {
      IMPLEMENTATION_READY: true,
      PROVIDER_APPROVED: false,
      PRIVACY_APPROVED: false,
      INVALIDATION_READY: true,
      SAFETY_EVALUATED: false,
    },
    SEMANTIC_CACHE: {
      IMPLEMENTATION_READY: true,
      PROVIDER_APPROVED: false,
      PRIVACY_APPROVED: false,
      INVALIDATION_READY: true,
      SAFETY_EVALUATED: false,
    },
    MCP_READ: {
      IMPLEMENTATION_READY: true,
      PROVIDER_APPROVED: false,
      PRIVACY_APPROVED: false,
      INVALIDATION_READY: false,
      SAFETY_EVALUATED: false,
    },
    MCP_PROPOSALS: {
      IMPLEMENTATION_READY: false,
      PROVIDER_APPROVED: false,
      PRIVACY_APPROVED: false,
      INVALIDATION_READY: false,
      SAFETY_EVALUATED: false,
    },
    AGENT_LOOP: {
      IMPLEMENTATION_READY: true,
      PROVIDER_APPROVED: false,
      PRIVACY_APPROVED: false,
      INVALIDATION_READY: false,
      SAFETY_EVALUATED: false,
    },
    FINE_TUNED_MODEL: {
      IMPLEMENTATION_READY: false,
      PROVIDER_APPROVED: false,
      PRIVACY_APPROVED: false,
      INVALIDATION_READY: false,
      SAFETY_EVALUATED: false,
    },
  };
