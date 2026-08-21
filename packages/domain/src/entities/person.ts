import { z } from 'zod';
import { auditableFieldsSchema, uuidSchema } from '../common';

/**
 * Person is the central entity of the Family Care Graph (master prompt
 * §2-3). A Person MAY exist without ever having an authenticated User —
 * e.g. a 4-year-old child. When that child turns 13 and gets their own
 * login, a new User is linked to the SAME Person; history is never
 * recreated (§13, §62).
 *
 * Person deliberately does NOT require CPF (§123) and does NOT belong to
 * exactly one family (see FamilyMembership, packages/domain/src/entities/family-unit.ts).
 */
export const personTypeSchema = z.enum([
  'ADULT',
  'MINOR',
  'INFANT',
]);

export const personSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    displayName: z.string().min(1).max(150),
    legalName: z.string().min(1).max(200).nullable().optional(),
    birthDate: z.string().date().nullable().optional(),
    personType: personTypeSchema,
    avatarUrl: z.string().url().nullable().optional(),
    /**
     * Denormalized flag maintained by a DB trigger/service whenever a
     * birthDate crosses an autonomy threshold. Never used for
     * authorization decisions by itself — see AutonomyProfile and the
     * Policy Engine, which combine this with explicit grants.
     */
    isMinor: z.boolean(),
    /** Soft, non-authoritative — real authorization always goes through the Policy Engine. */
    primaryLanguage: z.string().max(10).default('pt-BR'),
  })
  .merge(auditableFieldsSchema);

export type Person = z.infer<typeof personSchema>;

export const createPersonInputSchema = personSchema.pick({
  tenantId: true,
  displayName: true,
  legalName: true,
  birthDate: true,
  personType: true,
  avatarUrl: true,
});
export type CreatePersonInput = z.infer<typeof createPersonInputSchema>;

/**
 * Derives personType/isMinor consistently instead of trusting client
 * input — business rule lives once, here, not scattered across API
 * handlers (master prompt §71: backend is the source of truth).
 */
export function derivePersonAgeFacts(birthDate: string | null | undefined, asOf: Date = new Date()) {
  if (!birthDate) {
    return { personType: 'ADULT' as const, isMinor: false };
  }
  const dob = new Date(birthDate);
  const ageMs = asOf.getTime() - dob.getTime();
  const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365.25);
  if (ageYears < 2) return { personType: 'INFANT' as const, isMinor: true };
  if (ageYears < 18) return { personType: 'MINOR' as const, isMinor: true };
  return { personType: 'ADULT' as const, isMinor: false };
}
