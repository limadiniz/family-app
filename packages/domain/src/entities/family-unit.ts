import { z } from 'zod';
import { auditableFieldsSchema, uuidSchema } from '../common';
import { roleSchema } from './role-permission';

/**
 * FamilyUnit + FamilyMembership implement a many-to-many relationship
 * between Person and "family". A Person can belong to more than one
 * FamilyUnit at once (recomposed families, shared custody). This is
 * the join-table pattern mandated by §15-16: never `person.family_id`.
 */
export const familyUnitSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    name: z.string().min(1).max(150),
    /** Free-form, informational only — never used by the Policy Engine. */
    kind: z.enum(['NUCLEAR', 'SHARED_CUSTODY', 'BLENDED', 'EXTENDED', 'OTHER']).default('OTHER'),
  })
  .merge(auditableFieldsSchema);
export type FamilyUnit = z.infer<typeof familyUnitSchema>;

export const familyMembershipSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    familyUnitId: uuidSchema,
    personId: uuidSchema,
    /** Role WITHIN this specific family unit — a Person can hold different roles in different units. */
    role: roleSchema,
    isActive: z.boolean().default(true),
  })
  .merge(auditableFieldsSchema);
export type FamilyMembership = z.infer<typeof familyMembershipSchema>;

export const createFamilyUnitInputSchema = familyUnitSchema.pick({
  tenantId: true,
  name: true,
  kind: true,
});
export type CreateFamilyUnitInput = z.infer<typeof createFamilyUnitInputSchema>;

export const createFamilyMembershipInputSchema = familyMembershipSchema.pick({
  tenantId: true,
  familyUnitId: true,
  personId: true,
  role: true,
});
export type CreateFamilyMembershipInput = z.infer<typeof createFamilyMembershipInputSchema>;
