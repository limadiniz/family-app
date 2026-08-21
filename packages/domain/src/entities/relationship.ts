import { z } from 'zod';
import { auditableFieldsSchema, uuidSchema } from '../common';

/**
 * Relationship models the real-world kinship/care relationship between
 * two Persons, independent of FamilyUnit membership and independent of
 * platform authorization. It is descriptive (§138: "não conceder
 * direitos baseados apenas em parentesco") — an AuthorityGrant or Role
 * is what actually grants access, never the Relationship row itself.
 */
export const relationshipTypeSchema = z.enum([
  'PARENT',
  'STEPPARENT',
  'GUARDIAN',
  'GRANDPARENT',
  'SIBLING',
  'HALF_SIBLING',
  'CAREGIVER',
  'SPOUSE_PARTNER',
  // Extended Care Network additions (adendo §1): tio/tia, padrinho/madrinha,
  // pessoa de confiança, profissional, motorista autorizado. Kinship is
  // still purely descriptive here — it never grants access by itself
  // (§2: "parentesco não concede responsabilidade automaticamente");
  // only a ResponsibilityAssignment/AuthorityGrant does.
  'AUNT_UNCLE',
  'GODPARENT',
  'TRUSTED_PERSON',
  'PROFESSIONAL',
  'AUTHORIZED_DRIVER',
  'OTHER',
]);
export type RelationshipType = z.infer<typeof relationshipTypeSchema>;

export const relationshipSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    fromPersonId: uuidSchema,
    toPersonId: uuidSchema,
    relationshipType: relationshipTypeSchema,
    /** e.g. custody arrangement notes — informational, never authoritative. */
    notes: z.string().max(2000).nullable().optional(),
  })
  .merge(auditableFieldsSchema)
  .refine((r) => r.fromPersonId !== r.toPersonId, {
    message: 'A relationship cannot link a person to themselves',
  });
export type Relationship = z.infer<typeof relationshipSchema>;

export const createRelationshipInputSchema = z.object({
  tenantId: uuidSchema,
  fromPersonId: uuidSchema,
  toPersonId: uuidSchema,
  relationshipType: relationshipTypeSchema,
  notes: z.string().max(2000).nullable().optional(),
});
export type CreateRelationshipInput = z.infer<typeof createRelationshipInputSchema>;
