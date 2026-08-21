import { z } from 'zod';
import { auditableFieldsSchema, uuidSchema } from '../common';
import { permissionPresetSchema, roleSchema } from './role-permission';
import { relationshipTypeSchema } from './relationship';

/**
 * Invitation drives the "convite de responsável" flow (§86-87). Accepting
 * an invitation creates/links a User to a Person and materializes
 * AuthorityGrants from the chosen preset — it never grants access by
 * itself before acceptance + Policy Engine activation.
 */
export const invitationStatusSchema = z.enum([
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'REVOKED',
]);
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

export const invitationSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    familyUnitId: uuidSchema,
    invitedByPersonId: uuidSchema,
    inviteeEmail: z.string().email(),
    proposedRelationship: relationshipTypeSchema,
    proposedRole: roleSchema,
    permissionPreset: permissionPresetSchema,
    /** Which existing Person(s) this invitee will care for, e.g. the children. */
    subjectPersonIds: z.array(uuidSchema).min(1),
    status: invitationStatusSchema.default('PENDING'),
    token: z.string().min(20), // opaque, single-use
    expiresAt: z.string().datetime({ offset: true }),
    acceptedByUserId: uuidSchema.nullable().optional(),
  })
  .merge(auditableFieldsSchema);
export type Invitation = z.infer<typeof invitationSchema>;

export const createInvitationInputSchema = invitationSchema.pick({
  tenantId: true,
  familyUnitId: true,
  invitedByPersonId: true,
  inviteeEmail: true,
  proposedRelationship: true,
  proposedRole: true,
  permissionPreset: true,
  subjectPersonIds: true,
});
export type CreateInvitationInput = z.infer<typeof createInvitationInputSchema>;
