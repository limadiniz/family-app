import { describe, expect, it } from 'vitest';
import { AI_ACTION_TOOL_REGISTRY, PROPOSED_ACTION_TYPES } from '../src';

describe('AI action tool registry', () => {
  it('governs every supported action as proposal-only with explicit confirmation', () => {
    expect(Object.keys(AI_ACTION_TOOL_REGISTRY).sort()).toEqual([...PROPOSED_ACTION_TYPES].sort());
    for (const type of PROPOSED_ACTION_TYPES) {
      const tool = AI_ACTION_TOOL_REGISTRY[type];
      expect(tool.executionMode).toBe('PROPOSAL_ONLY');
      expect(tool.requiresExplicitConfirmation).toBe(true);
      expect(tool.requiredAuthorization.length).toBeGreaterThan(0);
    }
  });

  it('marks responsibility, handoff and care brief operations as sensitive', () => {
    expect(AI_ACTION_TOOL_REGISTRY.PROPOSE_RESPONSIBILITY_ASSIGNMENT.risk).toBe('SENSITIVE_WRITE');
    expect(AI_ACTION_TOOL_REGISTRY.PROPOSE_HANDOFF.risk).toBe('SENSITIVE_WRITE');
    expect(AI_ACTION_TOOL_REGISTRY.PROPOSE_CARE_BRIEF.risk).toBe('SENSITIVE_WRITE');
  });
});
