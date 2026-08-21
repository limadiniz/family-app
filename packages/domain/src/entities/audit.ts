import { z } from 'zod';
import { uuidSchema } from '../common';

/**
 * AuditEvent (§26). Immutable by convention: rows are INSERT-only (no
 * UPDATE/DELETE grants at the DB level — see packages/database migrations).
 */
export const auditEventTypeSchema = z.enum([
  'LOGIN',
  'LOGOUT',
  'VIEW_HEALTH',
  'VIEW_DOCUMENT',
  'CREATE_EVENT',
  'UPDATE_MEDICATION',
  'ADMINISTER_MEDICATION',
  'GRANT_PERMISSION',
  'REVOKE_PERMISSION',
  'SHARE_DOCUMENT',
  'EMERGENCY_ACCESS',
  'AI_QUERY',
  'AI_ACTION',
  'EXPORT_DATA',
  'DELETE_REQUEST',
  // Family-core additions used by Phase 1 flows:
  'PERSON_CREATED',
  'FAMILY_UNIT_CREATED',
  'FAMILY_MEMBER_ADDED',
  'RELATIONSHIP_CREATED',
  'RESIDENCE_CREATED',
  'INVITATION_SENT',
  'INVITATION_ACCEPTED',
  'POLICY_DECISION',
  // V2 additions (Command Center / Universal Inbox / Request Engine, §64):
  'CALENDAR_EVENT_CREATED',
  'TASK_CREATED',
  'CAPTURE_ITEM_CREATED',
  'CAPTURE_CONFIRMED',
  'CAPTURE_REJECTED',
  'REQUEST_CREATED',
  'REQUEST_ACCEPTED',
  'REQUEST_DECLINED',
  // Extended Care Network additions (adendo §30, §34):
  'RESPONSIBILITY_ASSIGNMENT_CREATED',
  'RESPONSIBILITY_ASSIGNMENT_ACCEPTED',
  'RESPONSIBILITY_ASSIGNMENT_DECLINED',
  'RESPONSIBILITY_ASSIGNMENT_ACTIVATED',
  'RESPONSIBILITY_ASSIGNMENT_COMPLETED',
  'RESPONSIBILITY_DELEGATED',
  'RESPONSIBILITY_DELEGATION_DENIED',
  'CARE_NETWORK_MEMBER_ADDED',
  // V3 additions (CareSchedule/CareWindow/Handoff application layer,
  // Handoff Brief / Care Brief, Context Engine, §31-34, §57-66):
  'CARE_SCHEDULE_CREATED',
  'CARE_SCHEDULE_CANCELLED',
  'CARE_WINDOW_CREATED',
  'CARE_WINDOW_ACTIVATED',
  'CARE_WINDOW_COMPLETED',
  'CARE_WINDOW_CANCELLED',
  'HANDOFF_CREATED',
  'HANDOFF_CONFIRMED',
  'HANDOFF_COMPLETED',
  'HANDOFF_DELAYED',
  'HANDOFF_CANCELLED',
  'HANDOFF_DISPUTED',
  'HANDOFF_BRIEF_VIEWED',
  'CARE_BRIEF_VIEWED',
]);
export type AuditEventType = z.infer<typeof auditEventTypeSchema>;

export const auditEventResultSchema = z.enum(['SUCCESS', 'DENIED', 'ERROR']);
export type AuditEventResult = z.infer<typeof auditEventResultSchema>;

export const auditEventSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  occurredAt: z.string().datetime({ offset: true }),
  eventType: auditEventTypeSchema,
  actorUserId: uuidSchema.nullable().optional(),
  actorPersonId: uuidSchema.nullable().optional(),
  subjectPersonId: uuidSchema.nullable().optional(),
  resourceType: z.string().max(100).nullable().optional(),
  resourceId: uuidSchema.nullable().optional(),
  result: auditEventResultSchema,
  /** Free-form but MUST be redacted (§76) — never store medical detail, tokens, passwords. */
  context: z.record(z.string(), z.unknown()).nullable().optional(),
  deviceId: z.string().max(200).nullable().optional(),
  ipAddress: z.string().max(64).nullable().optional(),
  correlationId: uuidSchema.nullable().optional(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export type CreateAuditEventInput = Omit<AuditEvent, 'id' | 'occurredAt'>;
