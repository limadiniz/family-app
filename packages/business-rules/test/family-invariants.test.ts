import { describe, expect, it } from 'vitest';
import {
  BusinessRuleViolation,
  assertNoDuplicateActiveRole,
  assertSingleFamilyOwnerInvariant,
} from '../src/family-invariants';

const baseInput = { tenantId: 't1', familyUnitId: 'fu1', personId: 'p1', role: 'FAMILY_OWNER' as const };

describe('assertSingleFamilyOwnerInvariant', () => {
  it('throws when a FAMILY_OWNER already exists', () => {
    expect(() =>
      assertSingleFamilyOwnerInvariant([{ role: 'FAMILY_OWNER', isActive: true }], baseInput),
    ).toThrow(BusinessRuleViolation);
  });

  it('allows a second owner if the first is inactive', () => {
    expect(() =>
      assertSingleFamilyOwnerInvariant([{ role: 'FAMILY_OWNER', isActive: false }], baseInput),
    ).not.toThrow();
  });

  it('does not apply to non-owner roles', () => {
    expect(() =>
      assertSingleFamilyOwnerInvariant([{ role: 'FAMILY_OWNER', isActive: true }], { ...baseInput, role: 'CAREGIVER' }),
    ).not.toThrow();
  });
});

describe('assertNoDuplicateActiveRole', () => {
  it('throws when the same person already holds a different active role', () => {
    expect(() =>
      assertNoDuplicateActiveRole(
        [{ personId: 'p1', role: 'GUARDIAN', isActive: true }],
        { ...baseInput, role: 'CAREGIVER' },
      ),
    ).toThrow(BusinessRuleViolation);
  });
});
