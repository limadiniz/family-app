import type { CreateFamilyMembershipInput, Role } from '@family-app/domain';

/**
 * Business rules that sit between the API Controller and the Policy
 * Engine (§8's layering: Controller -> Application Service -> Business
 * Rules -> Policy Engine -> Repository). These are STRUCTURAL invariants
 * about the family graph itself, independent of who is asking — the
 * Policy Engine separately decides whether the current actor is allowed
 * to perform the operation at all.
 */

export class BusinessRuleViolation extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'BusinessRuleViolation';
  }
}

/** At most one FAMILY_OWNER per FamilyUnit (ownership can be transferred, not duplicated). */
export function assertSingleFamilyOwnerInvariant(
  existingMemberships: Array<{ role: Role; isActive: boolean }>,
  incoming: CreateFamilyMembershipInput,
): void {
  if (incoming.role !== 'FAMILY_OWNER') return;
  const hasOwner = existingMemberships.some((m) => m.role === 'FAMILY_OWNER' && m.isActive);
  if (hasOwner) {
    throw new BusinessRuleViolation(
      'Esta unidade familiar já possui um responsável principal (FAMILY_OWNER).',
      'FAMILY_UNIT_ALREADY_HAS_OWNER',
    );
  }
}

/** A Person cannot hold two different active roles in the SAME FamilyUnit at once — pick one, edit later. */
export function assertNoDuplicateActiveRole(
  existingMemberships: Array<{ personId: string; role: Role; isActive: boolean }>,
  incoming: CreateFamilyMembershipInput,
): void {
  const conflict = existingMemberships.some(
    (m) => m.personId === incoming.personId && m.isActive && m.role !== incoming.role,
  );
  if (conflict) {
    throw new BusinessRuleViolation(
      'Esta pessoa já possui um papel ativo diferente nesta unidade familiar.',
      'DUPLICATE_ACTIVE_ROLE',
    );
  }
}

/** A Relationship must connect two Persons in the same tenant (defense in depth, mirrors RLS). */
export function assertSameTenant(a: { tenantId: string }, b: { tenantId: string }): void {
  if (a.tenantId !== b.tenantId) {
    throw new BusinessRuleViolation('Não é possível relacionar pessoas de tenants diferentes.', 'CROSS_TENANT_RELATIONSHIP');
  }
}
