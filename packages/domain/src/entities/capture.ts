import { z } from 'zod';
import { auditableFieldsSchema, provenanceMetaSchema, uuidSchema } from '../common';

/**
 * Universal Family Inbox / Capture Engine (Prompt Mestre V2 §13-23, P0).
 *
 * Every piece of information the family sends into the platform lands
 * first as a `CaptureItem`. Nothing derived from it (a CalendarEvent, a
 * Task, a Document) is created until a human confirms a `CaptureProposal`
 * — this is enforced in the API layer (capture.service.ts), not just by
 * convention: the confirm endpoint is the *only* code path allowed to
 * write to calendar_events/tasks/checklists from capture data, and it
 * requires an authenticated, policy-authorized actor plus the proposal's
 * id, never auto-runs off an extraction alone.
 */
export const captureSourceSchema = z.enum([
  'TEXT',
  'PHOTO',
  'SCREENSHOT',
  'PDF',
  'DOCUMENT',
  'AUDIO',
  'EMAIL',
  'FORWARDED_MESSAGE',
]);
export type CaptureSource = z.infer<typeof captureSourceSchema>;

export const captureStatusSchema = z.enum([
  'RECEIVED',
  'PROCESSING',
  'NEEDS_REVIEW',
  'READY',
  'CONFIRMED',
  'REJECTED',
  'FAILED',
  'ARCHIVED',
]);
export type CaptureStatus = z.infer<typeof captureStatusSchema>;

export const captureCategorySchema = z.enum([
  'SCHOOL_ANNOUNCEMENT',
  'SCHOOL_ASSIGNMENT',
  'SCHOOL_EXAM',
  'MEDICAL_PRESCRIPTION',
  'MEDICAL_EXAM',
  'MEDICAL_APPOINTMENT',
  'ACTIVITY',
  'CALENDAR_EVENT',
  'TASK',
  'PAYMENT',
  'DOCUMENT',
  'TRANSPORTATION',
  'OTHER',
]);
export type CaptureCategory = z.infer<typeof captureCategorySchema>;

export const captureItemSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    createdByPersonId: uuidSchema,
    /** Whose calendar/tasks this capture is most likely about — set once matched, may start null. */
    subjectPersonId: uuidSchema.nullable().optional(),
    source: captureSourceSchema,
    status: captureStatusSchema.default('RECEIVED'),
    rawText: z.string().max(8000).nullable().optional(),
    category: captureCategorySchema.nullable().optional(),
    failureReason: z.string().max(1000).nullable().optional(),
  })
  .merge(auditableFieldsSchema);
export type CaptureItem = z.infer<typeof captureItemSchema>;

/** File payload for non-text captures — always stored in a private bucket, never a public URL. */
export const captureAttachmentSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    captureItemId: uuidSchema,
    storagePath: z.string().min(1),
    originalFilename: z.string().max(300),
    mimeType: z.string().max(150),
    fileSizeBytes: z.number().int().nonnegative(),
  })
  .merge(auditableFieldsSchema);
export type CaptureAttachment = z.infer<typeof captureAttachmentSchema>;

/**
 * What the classifier/extractor produced — always carries a confidence
 * score (§22) and is never itself treated as confirmed fact. One
 * CaptureItem may accumulate several extractions across retries.
 */
export const captureExtractionSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    captureItemId: uuidSchema,
    extractorName: z.string().min(1).max(100),
    extractedFields: z.record(z.string(), z.unknown()),
  })
  .merge(auditableFieldsSchema)
  .merge(provenanceMetaSchema);
export type CaptureExtraction = z.infer<typeof captureExtractionSchema>;

/**
 * A concrete, human-reviewable proposal to create one downstream record
 * (event/task/checklist/document). Confirming a proposal is the only way
 * capture data becomes a real CalendarEvent/Task/etc.
 */
export const captureProposalTargetSchema = z.enum(['CALENDAR_EVENT', 'TASK', 'CHECKLIST', 'DOCUMENT']);
export type CaptureProposalTarget = z.infer<typeof captureProposalTargetSchema>;

export const captureProposalStatusSchema = z.enum(['PENDING', 'CONFIRMED', 'EDITED_AND_CONFIRMED', 'DISCARDED']);
export type CaptureProposalStatus = z.infer<typeof captureProposalStatusSchema>;

export const captureProposalSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    captureItemId: uuidSchema,
    targetType: captureProposalTargetSchema,
    proposedFields: z.record(z.string(), z.unknown()),
    status: captureProposalStatusSchema.default('PENDING'),
    confirmedByPersonId: uuidSchema.nullable().optional(),
    confirmedAt: z.string().datetime({ offset: true }).nullable().optional(),
    resultingRecordId: uuidSchema.nullable().optional(),
  })
  .merge(auditableFieldsSchema)
  .merge(provenanceMetaSchema.pick({ confidence: true }));
export type CaptureProposal = z.infer<typeof captureProposalSchema>;

const CAPTURE_TRANSITIONS: Record<CaptureStatus, CaptureStatus[]> = {
  RECEIVED: ['PROCESSING', 'FAILED'],
  PROCESSING: ['NEEDS_REVIEW', 'READY', 'FAILED'],
  NEEDS_REVIEW: ['READY', 'REJECTED', 'FAILED'],
  READY: ['CONFIRMED', 'REJECTED'],
  CONFIRMED: ['ARCHIVED'],
  REJECTED: ['ARCHIVED'],
  FAILED: ['ARCHIVED', 'PROCESSING'],
  ARCHIVED: [],
};

export function canTransitionCaptureItem(from: CaptureStatus, to: CaptureStatus): boolean {
  return CAPTURE_TRANSITIONS[from].includes(to);
}
