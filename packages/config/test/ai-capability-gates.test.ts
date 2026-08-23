import { describe, expect, it } from 'vitest';
import {
  resolveAiCapabilityGate,
  type AiCapabilityReadinessEvidence,
} from '../src/ai-capability-gates';
import { loadFeatureFlags } from '../src/feature-flags';

const ready: AiCapabilityReadinessEvidence = {
  IMPLEMENTATION_READY: true,
  PROVIDER_APPROVED: true,
  PRIVACY_APPROVED: true,
  INVALIDATION_READY: true,
  SAFETY_EVALUATED: true,
};

describe('resolveAiCapabilityGate', () => {
  it('keeps an unrequested capability disabled', () => {
    expect(resolveAiCapabilityGate('VECTOR_SEARCH', loadFeatureFlags({}), ready)).toEqual({
      capability: 'VECTOR_SEARCH',
      requested: false,
      mode: 'DISABLED',
      missingRequirements: [],
    });
  });

  it('does not let an environment flag bypass readiness evidence', () => {
    const gate = resolveAiCapabilityGate(
      'VECTOR_SEARCH',
      loadFeatureFlags({ FF_AI_ENABLED: 'true', FF_AI_VECTOR_SEARCH: 'true' }),
      { ...ready, PRIVACY_APPROVED: false, INVALIDATION_READY: false },
    );
    expect(gate.mode).toBe('BLOCKED');
    expect(gate.missingRequirements).toEqual(['PRIVACY_APPROVED', 'INVALIDATION_READY']);
  });

  it('supports vector shadow mode without enabling production retrieval', () => {
    const gate = resolveAiCapabilityGate(
      'VECTOR_SEARCH',
      loadFeatureFlags({ FF_AI_ENABLED: 'true', FF_AI_VECTOR_SHADOW: 'true' }),
      ready,
    );
    expect(gate.mode).toBe('SHADOW');
  });

  it('requires base AI and MCP read before MCP proposals', () => {
    const gate = resolveAiCapabilityGate(
      'MCP_PROPOSALS',
      loadFeatureFlags({ FF_AI_MCP_PROPOSALS: 'true' }),
      ready,
    );
    expect(gate.mode).toBe('BLOCKED');
    expect(gate.missingRequirements).toEqual(
      expect.arrayContaining(['BASE_AI_ENABLED', 'MCP_READ_ENABLED']),
    );
  });
});
