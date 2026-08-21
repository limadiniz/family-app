import { z } from 'zod';
import { auditableFieldsSchema, uuidSchema } from '../common';

/**
 * Family Request Engine (Prompt Mestre V2 §30-37, P0). Responsibility
 * never changes silently: a `Request` must be created, sent, and
 * accepted before its effect (e.g. reassigning a pickup) is applied. The
 * original responsibility/schedule stays in force until acceptance —
 * enforced in apps/api's RequestService, not just documented here.
 */
export const requestTypeSchema = z.enum([
  'RESPONSIBILITY_TRANSFER',
  'SCHEDULE_CHANGE',
  'PICKUP_REQUEST',
  'DROPOFF_REQUEST',
  'RESIDENCE_CHANGE',
  'EXPENSE_APPROVAL',
  'PERMISSION_REQUEST',
  'DOCUMENT_REQUEST',
  'INFORMATION_REQUEST',
  /** Extended Care Network (adendo §16): proposing a ResponsibilityAssignment to someone. */
  'RESPONSIBILITY_ASSIGNMENT',
  'OTHER',
]);
export type RequestType = z.infer<typeof requestTypeSchema>;

export const requestStatusSchema = z.enum([
  'DRAFT',
  'SENT',
  'VIEWED',
  'ACCEPTED',
  'DECLINED',
  'CANCELLED',
  'EXPIRED',
  'DISPUTED',
  'COMPLETED',
]);
export type RequestStatus = z.infer<typeof requestStatusSchema>;

export const requestSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    type: requestTypeSchema,
    status: requestStatusSchema.default('DRAFT'),
    requestedByPersonId: uuidSchema,
    requestedToPersonId: uuidSchema,
    /** The child/subject the request concerns, when applicable (pickup/schedule/residence requests). */
    subjectPersonId: uuidSchema.nullable().optional(),
    /** Free-form structured payload — shape depends on `type` (e.g. { date, time } for PICKUP_REQUEST). */
    payload: z.record(z.string(), z.unknown()).default({}),
    /** Linked record this request would change once accepted (a CareWindow, CareSchedule, Handoff, etc.). */
    relatedResourceType: z.string().max(60).nullable().optional(),
    relatedResourceId: uuidSchema.nullable().optional(),
    note: z.string().max(1000).nullable().optional(),
    respondedAt: z.string().datetime({ offset: true }).nullable().optional(),
    expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .merge(auditableFieldsSchema);
export type Request = z.infer<typeof requestSchema>;

/** Immutable action log for a Request — the "trilha de alterações" (§35-36) the platform must never overwrite. */
export const requestActionTypeSchema = z.enum([
  'CREATED',
  'SENT',
  'VIEWED',
  'ACCEPTED',
  'DECLINED',
  'CANCELLED',
  'DISPUTED',
  'COMMENTED',
  'COMPLETED',
]);
export type RequestActionType = z.infer<typeof requestActionTypeSchema>;

export const requestActionSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    requestId: uuidSchema,
    actionType: requestActionTypeSchema,
    actorPersonId: uuidSchema,
    note: z.string().max(1000).nullable().optional(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type RequestAction = z.infer<typeof requestActionSchema>;

const REQUEST_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['VIEWED', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'],
  VIEWED: ['ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'DISPUTED'],
  ACCEPTED: ['COMPLETED', 'DISPUTED'],
  DECLINED: ['DISPUTED'],
  CANCELLED: [],
  EXPIRED: [],
  DISPUTED: ['ACCEPTED', 'DECLINED', 'CANCELLED'],
  COMPLETED: [],
};

export function canTransitionRequest(from: RequestStatus, to: RequestStatus): boolean {
  return REQUEST_TRANSITIONS[from].includes(to);
}
