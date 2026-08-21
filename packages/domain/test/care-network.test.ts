import { describe, expect, it } from 'vitest';
import { canDelegateAtDepth, computeDelegationDepth, isCareNetworkMemberCurrentlyEligible } from '../src/entities/care-network';

describe('canDelegateAtDepth (adendo §11-12)', () => {
  it('legal guardian (can_delegate=true) may create the first delegation hop', () => {
    expect(canDelegateAtDepth({ canDelegate: true, canRedelegate: true, maxDelegationDepth: 3 }, 0)).toBe(true);
  });

  it('babá (can_delegate=false) cannot delegate at all, even at depth 0', () => {
    expect(canDelegateAtDepth({ canDelegate: false, canRedelegate: false, maxDelegationDepth: 3 }, 0)).toBe(false);
  });

  it('Carlos (can_redelegate=true) may pass along a responsibility he already received (depth >= 1)', () => {
    expect(canDelegateAtDepth({ canDelegate: false, canRedelegate: true, maxDelegationDepth: 3 }, 1)).toBe(true);
  });

  it('someone with can_delegate=true but can_redelegate=false cannot redelegate something already delegated to them', () => {
    expect(canDelegateAtDepth({ canDelegate: true, canRedelegate: false, maxDelegationDepth: 3 }, 1)).toBe(false);
  });

  it('never exceeds max_delegation_depth regardless of flags', () => {
    expect(canDelegateAtDepth({ canDelegate: true, canRedelegate: true, maxDelegationDepth: 1 }, 1)).toBe(false);
  });
});

describe('computeDelegationDepth', () => {
  const chain: Record<string, { sourceType: string; sourceId: string | null }> = {
    'ana-original': { sourceType: 'MANUAL', sourceId: null },
    'carlos-hop': { sourceType: 'RESPONSIBILITY_ASSIGNMENT', sourceId: 'ana-original' },
    'maria-hop': { sourceType: 'RESPONSIBILITY_ASSIGNMENT', sourceId: 'carlos-hop' },
  };
  const lookup = (id: string) => chain[id];

  it('an original (non-delegated) assignment has depth 0', () => {
    expect(computeDelegationDepth('ana-original', lookup)).toBe(0);
  });

  it('a first-hop delegation has depth 1', () => {
    expect(computeDelegationDepth('carlos-hop', lookup)).toBe(1);
  });

  it('a redelegation (second hop) has depth 2', () => {
    expect(computeDelegationDepth('maria-hop', lookup)).toBe(2);
  });

  it('is defensive against cycles (never loops forever)', () => {
    const cyclic: Record<string, { sourceType: string; sourceId: string | null }> = {
      a: { sourceType: 'RESPONSIBILITY_ASSIGNMENT', sourceId: 'b' },
      b: { sourceType: 'RESPONSIBILITY_ASSIGNMENT', sourceId: 'a' },
    };
    expect(computeDelegationDepth('a', (id) => cyclic[id], 20)).toBeLessThanOrEqual(20);
  });
});

describe('isCareNetworkMemberCurrentlyEligible', () => {
  it('is false for a PENDING member even within a valid window', () => {
    expect(isCareNetworkMemberCurrentlyEligible({ status: 'PENDING', validFrom: null, validUntil: null })).toBe(false);
  });

  it('is true for an ACTIVE member with no window restriction', () => {
    expect(isCareNetworkMemberCurrentlyEligible({ status: 'ACTIVE', validFrom: null, validUntil: null })).toBe(true);
  });

  it('is false once validUntil has passed', () => {
    const past = new Date(Date.now() - 1000 * 60 * 60).toISOString();
    expect(isCareNetworkMemberCurrentlyEligible({ status: 'ACTIVE', validFrom: null, validUntil: past })).toBe(false);
  });
});
