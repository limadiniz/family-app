import { z } from 'zod';
import { auditableFieldsSchema, uuidSchema } from '../common';
import type { PermissionAction, PermissionDomain } from './role-permission';

/**
 * Extended Care Network — Responsibility Assignment (adendo §1-21). The
 * platform must stop asking "who are this child's parents?" and start
 * asking "who is part of this child's trust network, and what exactly is
 * each person authorized to do, for how long, and who remains accountable
 * for it happening?" (§36). Kinship (`Relationship`) never grants access by
 * itself (§2) — only an accepted `ResponsibilityAssignment`, which mints
 * scoped, time-boxed `AuthorityGrant`s, does.
 */
export const responsibilityTypeSchema = z.enum([
  'PICKUP',
  'DROPOFF',
  'TRANSPORT',
  'SCHOOL_SUPPORT',
  'MEDICAL_APPOINTMENT',
  'MEDICATION_SUPPORT',
  'ACTIVITY_TRANSPORT',
  'OVERNIGHT_CARE',
  'TEMPORARY_CARE',
  'DOCUMENT_DELIVERY',
  'PAYMENT',
  'PURCHASE',
  'HOMEWORK_SUPPORT',
  'MEAL_PREPARATION',
  'EMERGENCY_CONTACT',
  'OTHER',
]);
export type ResponsibilityType = z.infer<typeof responsibilityTypeSchema>;

/** §17: acceptance is mandatory by default — nobody is "responsible" until they accept. */
export const responsibilityAssignmentStatusSchema = z.enum([
  'PROPOSED',
  'SENT',
  'VIEWED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
  'ACTIVE',
  'COMPLETED',
  'FAILED',
]);
export type ResponsibilityAssignmentStatus = z.infer<typeof responsibilityAssignmentStatusSchema>;

export const responsibilityPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
export type ResponsibilityPriority = z.infer<typeof responsibilityPrioritySchema>;

export const permissionGrantPairSchema = z.object({
  domain: z.string(),
  action: z.string(),
});
export type PermissionGrantPair = z.infer<typeof permissionGrantPairSchema>;

export const responsibilityAssignmentSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    subjectPersonId: uuidSchema,
    responsibilityType: responsibilityTypeSchema,
    /** RESPONSIBLE (§14): the person who will actually execute the task. */
    assignedToPersonId: uuidSchema,
    /** Who created THIS assignment row (the original creator, or the delegator on a redelegation hop). */
    assignedByPersonId: uuidSchema,
    /** ACCOUNTABLE (§14): never changes across a delegation chain, always the original creator's accountable person. */
    accountablePersonId: uuidSchema,
    /** CONSULTED/INFORMED (§15) — informational roles, never grant access by themselves. */
    consultedPersonIds: z.array(uuidSchema).default([]),
    informedPersonIds: z.array(uuidSchema).default([]),
    /** Traceability for delegation chains (§13): sourceType='RESPONSIBILITY_ASSIGNMENT' + sourceId=<parent>, or null for an original assignment. */
    sourceType: z.enum(['RESPONSIBILITY_ASSIGNMENT', 'CALENDAR_EVENT', 'RECURRING_RESPONSIBILITY', 'MANUAL']).default('MANUAL'),
    sourceId: uuidSchema.nullable().optional(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    status: responsibilityAssignmentStatusSchema.default('PROPOSED'),
    priority: responsibilityPrioritySchema.default('NORMAL'),
    instructions: z.string().max(2000).nullable().optional(),
    /** Explicit override of the type's default bundle — null means "use RESPONSIBILITY_PERMISSION_BUNDLES[type]". */
    requiredPermissions: z.array(permissionGrantPairSchema).nullable().optional(),
    /** §20: a pre-linked assignment (PROPOSED, not yet sent) eligible for explicit, human-triggered fallback activation. */
    fallbackAssignmentId: uuidSchema.nullable().optional(),
    /** Linked Family Request Engine row driving the Proposal→Accept flow (§16). */
    requestId: uuidSchema.nullable().optional(),
    acceptedAt: z.string().datetime({ offset: true }).nullable().optional(),
    completedAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .merge(auditableFieldsSchema)
  .refine((a) => new Date(a.endsAt) > new Date(a.startsAt), { message: 'endsAt must be after startsAt' });
export type ResponsibilityAssignment = z.infer<typeof responsibilityAssignmentSchema>;

const RESPONSIBILITY_TRANSITIONS: Record<ResponsibilityAssignmentStatus, ResponsibilityAssignmentStatus[]> = {
  PROPOSED: ['SENT', 'CANCELLED'],
  SENT: ['VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED'],
  VIEWED: ['ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED'],
  ACCEPTED: ['ACTIVE', 'CANCELLED'],
  DECLINED: [],
  EXPIRED: [],
  CANCELLED: [],
  ACTIVE: ['COMPLETED', 'FAILED', 'CANCELLED'],
  COMPLETED: [],
  FAILED: [],
};

/** §17: nothing skips straight from PROPOSED/SENT to ACTIVE — acceptance is always the gate. */
export function canTransitionResponsibilityAssignment(
  from: ResponsibilityAssignmentStatus,
  to: ResponsibilityAssignmentStatus,
): boolean {
  return RESPONSIBILITY_TRANSITIONS[from].includes(to);
}

/**
 * §7-8: the minimum permission bundle each responsibility type grants —
 * deterministic, not client-suppliable. A PICKUP never implies
 * HEALTH.VIEW/DOCUMENTS.VIEW/FINANCE.VIEW, matching the adendo's own
 * worked example almost verbatim. Expressed against the existing
 * (domain, action) grain from packages/policy-engine rather than
 * inventing a new VIEW_BASIC/VIEW_FULL axis — see gap-analysis for the
 * documented simplification.
 */
export const RESPONSIBILITY_PERMISSION_BUNDLES: Record<
  ResponsibilityType,
  Array<{ domain: PermissionDomain; action: PermissionAction }>
> = {
  PICKUP: [
    { domain: 'PROFILE', action: 'VIEW' },
    { domain: 'SCHEDULE', action: 'VIEW' },
    { domain: 'TRANSPORTATION', action: 'VIEW' },
    { domain: 'CONTACTS', action: 'VIEW' },
    { domain: 'EMERGENCY', action: 'VIEW' },
  ],
  DROPOFF: [
    { domain: 'PROFILE', action: 'VIEW' },
    { domain: 'SCHEDULE', action: 'VIEW' },
    { domain: 'TRANSPORTATION', action: 'VIEW' },
    { domain: 'CONTACTS', action: 'VIEW' },
    { domain: 'EMERGENCY', action: 'VIEW' },
  ],
  TRANSPORT: [
    { domain: 'PROFILE', action: 'VIEW' },
    { domain: 'SCHEDULE', action: 'VIEW' },
    { domain: 'TRANSPORTATION', action: 'VIEW' },
    { domain: 'CONTACTS', action: 'VIEW' },
    { domain: 'EMERGENCY', action: 'VIEW' },
  ],
  ACTIVITY_TRANSPORT: [
    { domain: 'PROFILE', action: 'VIEW' },
    { domain: 'SCHEDULE', action: 'VIEW' },
    { domain: 'ACTIVITIES', action: 'VIEW' },
    { domain: 'TRANSPORTATION', action: 'VIEW' },
    { domain: 'CONTACTS', action: 'VIEW' },
    { domain: 'EMERGENCY', action: 'VIEW' },
  ],
  SCHOOL_SUPPORT: [
    { domain: 'PROFILE', action: 'VIEW' },
    { domain: 'SCHOOL', action: 'VIEW' },
    { domain: 'SCHEDULE', action: 'VIEW' },
  ],
  HOMEWORK_SUPPORT: [
    { domain: 'PROFILE', action: 'VIEW' },
    { domain: 'SCHOOL', action: 'VIEW' },
  ],
  MEDICAL_APPOINTMENT: [
    { domain: 'PROFILE', action: 'VIEW' },
    { domain: 'SCHEDULE', action: 'VIEW' },
    { domain: 'HEALTH', action: 'VIEW' },
    { domain: 'EMERGENCY', action: 'VIEW' },
  ],
  MEDICATION_SUPPORT: [
    { domain: 'PROFILE', action: 'VIEW' },
    { domain: 'MEDICATION', action: 'VIEW' },
    { domain: 'MEDICATION', action: 'EDIT' },
    { domain: 'EMERGENCY', action: 'VIEW' },
  ],
  OVERNIGHT_CARE: [
    { domain: 'PROFILE', action: 'VIEW' },
    { domain: 'SCHEDULE', action: 'VIEW' },
    { domain: 'HEALTH', action: 'VIEW' },
    { domain: 'MEDICATION', action: 'VIEW' },
    { domain: 'MEDICATION', action: 'EDIT' },
    { domain: 'EMERGENCY', action: 'VIEW' },
    { domain: 'CONTACTS', action: 'VIEW' },
  ],
  TEMPORARY_CARE: [
    { domain: 'PROFILE', action: 'VIEW' },
    { domain: 'SCHEDULE', action: 'VIEW' },
    { domain: 'HEALTH', action: 'VIEW' },
    { domain: 'MEDICATION', action: 'VIEW' },
    { domain: 'MEDICATION', action: 'EDIT' },
    { domain: 'EMERGENCY', action: 'VIEW' },
    { domain: 'CONTACTS', action: 'VIEW' },
  ],
  DOCUMENT_DELIVERY: [{ domain: 'DOCUMENTS', action: 'VIEW' }],
  PAYMENT: [{ domain: 'FINANCE', action: 'VIEW' }],
  PURCHASE: [{ domain: 'FINANCE', action: 'VIEW' }],
  MEAL_PREPARATION: [{ domain: 'PROFILE', action: 'VIEW' }],
  EMERGENCY_CONTACT: [{ domain: 'EMERGENCY', action: 'VIEW' }],
  OTHER: [{ domain: 'PROFILE', action: 'VIEW' }],
};

/** Only genuinely custodial responsibility types materialize a CareWindow on activation (see gap-analysis). */
export const CARE_WINDOW_ELIGIBLE_RESPONSIBILITY_TYPES: ResponsibilityType[] = ['OVERNIGHT_CARE', 'TEMPORARY_CARE'];

export function getResponsibilityPermissionBundle(
  type: ResponsibilityType,
  override?: Array<{ domain: string; action: string }> | null,
): Array<{ domain: PermissionDomain; action: PermissionAction }> {
  if (override && override.length > 0) {
    return override as Array<{ domain: PermissionDomain; action: PermissionAction }>;
  }
  return RESPONSIBILITY_PERMISSION_BUNDLES[type];
}
