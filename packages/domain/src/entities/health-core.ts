import { z } from 'zod';
import { auditableFieldsSchema, provenanceMetaSchema, uuidSchema } from '../common';
import { medicationAdministrationStatusSchema } from './product-stubs';

/**
 * Health Core (Prompt Mestre V2 §55-58, P0). The AI (Family Copilot, when
 * wired in a later phase) may organize/locate/summarize this data but
 * must never: modify a prescription, invent a diagnosis, change a dose,
 * order a medication stopped, or suggest compensating a missed dose
 * (§58) — this is a product/prompt-layer guardrail enforced wherever the
 * AI Gateway touches HEALTH/MEDICATION domains, not something encodable
 * purely in this schema, but the schema itself never allows an
 * AI_INFERRED provenance record to *be* the active Prescription: a
 * Prescription is always USER_DECLARED or PROFESSIONAL_CONFIRMED.
 */
export const prescriptionSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    subjectPersonId: uuidSchema,
    prescribedByName: z.string().max(200).nullable().optional(),
    prescribedAt: z.string().date().nullable().optional(),
    sourceDocumentId: uuidSchema.nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .merge(auditableFieldsSchema)
  .merge(provenanceMetaSchema.pick({ provenance: true }));
export type Prescription = z.infer<typeof prescriptionSchema>;

export const medicationSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    subjectPersonId: uuidSchema,
    prescriptionId: uuidSchema.nullable().optional(),
    name: z.string().min(1).max(200),
    dosageText: z.string().max(300).nullable().optional(),
    active: z.boolean().default(true),
  })
  .merge(auditableFieldsSchema)
  .merge(provenanceMetaSchema.pick({ provenance: true, confidence: true }));
export type Medication = z.infer<typeof medicationSchema>;

export const medicationScheduleSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    medicationId: uuidSchema,
    /** RFC 5545 RRULE describing dose times, e.g. "FREQ=DAILY;BYHOUR=8,20". */
    rrule: z.string().min(1),
    startDate: z.string().date(),
    endDate: z.string().date().nullable().optional(),
  })
  .merge(auditableFieldsSchema);
export type MedicationSchedule = z.infer<typeof medicationScheduleSchema>;

export const medicationAdministrationSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    medicationId: uuidSchema,
    medicationScheduleId: uuidSchema.nullable().optional(),
    scheduledAt: z.string().datetime({ offset: true }),
    administeredAt: z.string().datetime({ offset: true }).nullable().optional(),
    administeredByPersonId: uuidSchema.nullable().optional(),
    status: medicationAdministrationStatusSchema.default('SCHEDULED'),
    notes: z.string().max(500).nullable().optional(),
  })
  .merge(auditableFieldsSchema);
export type MedicationAdministration = z.infer<typeof medicationAdministrationSchema>;

/**
 * EmergencyProfile (§41-44): the minimal, explicitly-authorized subset of
 * a person's health/contact data that should be findable in seconds by
 * anyone with EMERGENCY:VIEW authorization. Every read of this record
 * MUST be audited (enforced in EmergencyController, not optional) — this
 * is the one domain where the platform trades a little more logging
 * overhead for the certainty that emergency access is always traceable.
 */
export const emergencyProfileSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    subjectPersonId: uuidSchema,
    bloodType: z.string().max(5).nullable().optional(),
    allergies: z.array(z.string()).default([]),
    conditions: z.array(z.string()).default([]),
    criticalMedications: z.array(z.string()).default([]),
    healthPlanName: z.string().max(150).nullable().optional(),
    healthPlanCardNumber: z.string().max(60).nullable().optional(),
    pediatricianName: z.string().max(200).nullable().optional(),
    preferredHospital: z.string().max(200).nullable().optional(),
    emergencyContacts: z
      .array(
        z.object({
          name: z.string().max(150),
          relationship: z.string().max(80).nullable().optional(),
          phone: z.string().max(30),
        }),
      )
      .default([]),
  })
  .merge(auditableFieldsSchema);
export type EmergencyProfile = z.infer<typeof emergencyProfileSchema>;
