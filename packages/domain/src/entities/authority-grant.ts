import { z } from 'zod';
import { auditableFieldsSchema, uuidSchema } from '../common';
import { permissionActionSchema, permissionDomainSchema } from './role-permission';

/**
 * AuthorityGrant is the explicit, auditable unit of authorization that
 * the Family Policy Engine consults. It answers: "actor X may perform
 * action A in domain D on subject (Person) S, optionally scoped to a
 * CareWindow / Residence / time range."
 *
 * This is what actually grants access — NOT kinship, NOT FamilyMembership
 * role alone (§138). Role provides sensible DEFAULT grants at
 * invitation-time (see permission-preset.ts in packages/policy-engine),
 * but everything effective is materialized here so it can be listed,
 * audited, and revoked independently of the relationship that inspired it.
 */
export const authorityGrantSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    /** The Person being granted authority (e.g. the babysitter). */
    granteePersonId: uuidSchema,
    /** The Person the authority is exercised over (e.g. the child). */
    subjectPersonId: uuidSchema,
    domain: permissionDomainSchema,
    action: permissionActionSchema,
    /** Optional scoping. All null = unconditional grant within domain/action. */
    careWindowId: uuidSchema.nullable().optional(),
    residenceId: uuidSchema.nullable().optional(),
    validFrom: z.string().datetime({ offset: true }).nullable().optional(),
    validUntil: z.string().datetime({ offset: true }).nullable().optional(),
    grantedByPersonId: uuidSchema,
    revokedAt: z.string().datetime({ offset: true }).nullable().optional(),
    revokedByPersonId: uuidSchema.nullable().optional(),
  })
  .merge(auditableFieldsSchema);
export type AuthorityGrant = z.infer<typeof authorityGrantSchema>;

export const createAuthorityGrantInputSchema = authorityGrantSchema.pick({
  tenantId: true,
  granteePersonId: true,
  subjectPersonId: true,
  domain: true,
  action: true,
  careWindowId: true,
  residenceId: true,
  validFrom: true,
  validUntil: true,
  grantedByPersonId: true,
});
export type CreateAuthorityGrantInput = z.infer<typeof createAuthorityGrantInputSchema>;

export function isGrantCurrentlyActive(
  grant: Pick<AuthorityGrant, 'validFrom' | 'validUntil' | 'revokedAt'>,
  at: Date = new Date(),
): boolean {
  if (grant.revokedAt) return false;
  if (grant.validFrom && at < new Date(grant.validFrom)) return false;
  if (grant.validUntil && at > new Date(grant.validUntil)) return false;
  return true;
}
