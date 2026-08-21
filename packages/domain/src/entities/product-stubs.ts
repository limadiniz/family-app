import { z } from 'zod';
import { auditableFieldsSchema, provenanceMetaSchema, uuidSchema } from '../common';

/**
 * Product entity schemas for the Command Center (P0, Prompt Mestre V2
 * §24-29) and Health Core (P0, §41-44/55-58). `CalendarEvent`, `Task`,
 * `HealthProfile`, `Document`/`ExtractedDocumentData`, and
 * `AutonomyProfile` started life here as Phase 1 planning stubs and are
 * now real, migrated, API-backed entities — see
 * `supabase/migrations/20260820*` and `apps/api/src/modules/{calendar,
 * tasks,health}`. See also `routine.ts`, `capture.ts`, `request.ts`, and
 * `health-core.ts` for the entities added alongside them in this phase.
 */

export const calendarEventCategorySchema = z.enum([
  'SCHOOL',
  'HEALTH',
  'SPORT',
  'FAMILY',
  'MEDICATION',
  'DOCUMENT',
  'FINANCE',
  'OTHER',
]);
export type CalendarEventCategory = z.infer<typeof calendarEventCategorySchema>;

export const calendarEventSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    subjectPersonId: uuidSchema,
    title: z.string().min(1).max(200),
    category: calendarEventCategorySchema,
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }).nullable().optional(),
    residenceId: uuidSchema.nullable().optional(),
    responsiblePersonId: uuidSchema.nullable().optional(),
    transportationPersonId: uuidSchema.nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .merge(auditableFieldsSchema);
export type CalendarEvent = z.infer<typeof calendarEventSchema>;

export const taskStatusSchema = z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED', 'OVERDUE']);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    subjectPersonId: uuidSchema.nullable().optional(),
    responsiblePersonId: uuidSchema.nullable().optional(),
    alternateResponsiblePersonId: uuidSchema.nullable().optional(),
    title: z.string().min(1).max(200),
    description: z.string().max(4000).nullable().optional(),
    dueAt: z.string().datetime({ offset: true }).nullable().optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
    status: taskStatusSchema.default('TODO'),
    rrule: z.string().nullable().optional(),
  })
  .merge(auditableFieldsSchema);
export type Task = z.infer<typeof taskSchema>;

export const healthProfileSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    personId: uuidSchema,
    bloodType: z.string().max(5).nullable().optional(),
    allergies: z.array(z.string()).default([]),
    conditions: z.array(z.string()).default([]),
    healthPlanName: z.string().max(150).nullable().optional(),
    healthPlanCardNumber: z.string().max(60).nullable().optional(),
  })
  .merge(auditableFieldsSchema);
export type HealthProfile = z.infer<typeof healthProfileSchema>;

export const medicationAdministrationStatusSchema = z.enum([
  'SCHEDULED',
  'TAKEN',
  'MISSED',
  'SKIPPED',
  'LATE',
  'UNCONFIRMED',
]);
export type MedicationAdministrationStatus = z.infer<typeof medicationAdministrationStatusSchema>;

export const documentCategorySchema = z.enum([
  'IDENTIFICATION',
  'SUS',
  'HEALTH_PLAN',
  'PRESCRIPTION',
  'EXAM',
  'VACCINATION',
  'SCHOOL',
  'AUTHORIZATION',
  'OTHER',
]);
export type DocumentCategory = z.infer<typeof documentCategorySchema>;

export const documentSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    subjectPersonId: uuidSchema,
    category: documentCategorySchema,
    storagePath: z.string().min(1), // private bucket path — never a public URL
    originalFilename: z.string().max(300),
    mimeType: z.string().max(150),
    fileSizeBytes: z.number().int().nonnegative(),
  })
  .merge(auditableFieldsSchema)
  .merge(provenanceMetaSchema.pick({ provenance: true }));
export type DocumentEntity = z.infer<typeof documentSchema>;

export const extractedDocumentDataSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    documentId: uuidSchema,
    extractedFields: z.record(z.string(), z.unknown()),
    confirmedByPersonId: uuidSchema.nullable().optional(),
    confirmedAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .merge(auditableFieldsSchema)
  .merge(provenanceMetaSchema);
export type ExtractedDocumentData = z.infer<typeof extractedDocumentDataSchema>;

export const autonomyLevelSchema = z.enum([
  'MANAGED',
  'OBSERVE',
  'PARTICIPATE',
  'ORGANIZE',
  'INDEPENDENT',
  'ADULT_TRANSITION',
]);
export type AutonomyLevel = z.infer<typeof autonomyLevelSchema>;

export const autonomyProfileSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    personId: uuidSchema,
    level: autonomyLevelSchema.default('MANAGED'),
    setByPersonId: uuidSchema,
  })
  .merge(auditableFieldsSchema);
export type AutonomyProfile = z.infer<typeof autonomyProfileSchema>;
