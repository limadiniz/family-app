import { z } from 'zod';
import { auditableFieldsSchema, uuidSchema } from '../common';

/**
 * Extended Care Network — Caregiver Pool, Capabilities, Delegation Policy,
 * Recurring Responsibility, and Availability (adendo §10-12, §22-24, §34).
 * These are treated as DATA/POLICY, never hardcoded `if` branches (§23:
 * "devem ser tratados como policies/configurações, e não permissões
 * rígidas no código").
 */

// ---------------------------------------------------------------- Delegation

/**
 * §11-12: who may pass a responsibility they hold to someone else, and how
 * deep the chain may go. Deliberately scoped per-person (not per-child) —
 * see gap-analysis for the documented simplification. A missing row falls
 * back to `ROLE_DEFAULT_DELEGATION_POLICY` (packages/policy-engine).
 */
export const delegationPolicySchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    personId: uuidSchema,
    canDelegate: z.boolean().default(false),
    canRedelegate: z.boolean().default(false),
    maxDelegationDepth: z.number().int().min(0).max(10).default(1),
    updatedByPersonId: uuidSchema,
  })
  .merge(auditableFieldsSchema);
export type DelegationPolicy = z.infer<typeof delegationPolicySchema>;

/**
 * §12: every redelegation must validate Policy Engine → Relationship →
 * Authority → Permission → Responsibility Type → Target Person — never
 * "if received a task, can pass to anyone". This function only implements
 * the depth/policy arithmetic; the caller (apps/api) still runs the full
 * FamilyPolicyEngine + relationship/authority checks around it.
 */
export function canDelegateAtDepth(policy: Pick<DelegationPolicy, 'canDelegate' | 'canRedelegate' | 'maxDelegationDepth'>, currentDepth: number): boolean {
  if (currentDepth >= policy.maxDelegationDepth) return false;
  // Depth 0 -> 1 (first hop, from the original accountable/creator) requires can_delegate.
  // Depth >= 1 -> deeper (redelegating something already received via delegation) requires can_redelegate.
  return currentDepth === 0 ? policy.canDelegate : policy.canRedelegate;
}

/**
 * Walks a delegation chain via `sourceId` pointers (a `ResponsibilityAssignment`
 * whose `sourceType === 'RESPONSIBILITY_ASSIGNMENT'`) using a caller-supplied
 * lookup, and returns its depth (0 = original, not itself a delegation).
 * Guards against cycles defensively (should never happen given how chains
 * are only ever created forward, but never trust stored data blindly).
 */
export function computeDelegationDepth(
  assignmentId: string | null | undefined,
  lookup: (id: string) => { sourceType: string; sourceId: string | null | undefined } | undefined,
  maxHops = 20,
): number {
  let depth = 0;
  let currentId = assignmentId;
  const seen = new Set<string>();
  while (currentId && depth < maxHops) {
    if (seen.has(currentId)) break; // cycle guard
    seen.add(currentId);
    const node = lookup(currentId);
    if (!node || node.sourceType !== 'RESPONSIBILITY_ASSIGNMENT' || !node.sourceId) break;
    depth += 1;
    currentId = node.sourceId;
  }
  return depth;
}

// ------------------------------------------------------------- Caregiver pool

/** §23: capability flags per caregiver — configuration, never hardcoded role checks. */
export const responsibilityCapabilityKeySchema = z.enum([
  'CAN_PICKUP',
  'CAN_TRANSPORT',
  'CAN_STAY_OVERNIGHT',
  'CAN_ATTEND_MEDICAL_APPOINTMENT',
  'CAN_ADMINISTER_REGISTERED_MEDICATION',
  'CAN_RECEIVE_SCHOOL_INFORMATION',
  'CAN_MAKE_PURCHASES',
  'CAN_HANDLE_DOCUMENTS',
  'CAN_VIEW_EMERGENCY_PROFILE',
]);
export type ResponsibilityCapabilityKey = z.infer<typeof responsibilityCapabilityKeySchema>;

export const careNetworkMemberStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'PENDING']);
export type CareNetworkMemberStatus = z.infer<typeof careNetworkMemberStatusSchema>;

/**
 * §22: the Caregiver Pool for one child — "Quem pode ajudar?" (§28) reads
 * directly from this. Membership alone still grants nothing; it only
 * describes eligibility. Actual access always flows through an accepted
 * `ResponsibilityAssignment`'s minted `AuthorityGrant`s.
 */
export const careNetworkMemberSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    subjectPersonId: uuidSchema,
    personId: uuidSchema,
    status: careNetworkMemberStatusSchema.default('PENDING'),
    capabilities: z.array(responsibilityCapabilityKeySchema).default([]),
    note: z.string().max(1000).nullable().optional(),
    validFrom: z.string().datetime({ offset: true }).nullable().optional(),
    validUntil: z.string().datetime({ offset: true }).nullable().optional(),
    addedByPersonId: uuidSchema,
  })
  .merge(auditableFieldsSchema);
export type CareNetworkMember = z.infer<typeof careNetworkMemberSchema>;

export function isCareNetworkMemberCurrentlyEligible(
  member: Pick<CareNetworkMember, 'status' | 'validFrom' | 'validUntil'>,
  at: Date = new Date(),
): boolean {
  if (member.status !== 'ACTIVE') return false;
  if (member.validFrom && at < new Date(member.validFrom)) return false;
  if (member.validUntil && at > new Date(member.validUntil)) return false;
  return true;
}

// -------------------------------------------------------- Recurring + availability

/**
 * §18-19: "toda terça minha mãe busca Mariana na escola". Stored as a
 * template today — materializing concrete `ResponsibilityAssignment`
 * occurrences and handling per-occurrence exceptions is a future job, the
 * same documented gap `CareSchedule`/`CareWindow` already have since Phase 1.
 */
export const recurringResponsibilitySchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    subjectPersonId: uuidSchema,
    responsibilityType: z.string(), // re-validated against responsibilityTypeSchema at the API layer
    defaultAssignedToPersonId: uuidSchema,
    fallbackPersonId: uuidSchema.nullable().optional(),
    /** RFC 5545 RRULE, same convention as CareSchedule. */
    rrule: z.string().min(1),
    startDate: z.string().date(),
    endDate: z.string().date().nullable().optional(),
    instructions: z.string().max(2000).nullable().optional(),
    isActive: z.boolean().default(true),
    createdByPersonId: uuidSchema,
  })
  .merge(auditableFieldsSchema);
export type RecurringResponsibility = z.infer<typeof recurringResponsibilitySchema>;

/**
 * §24: "preparar estrutura futura" — explicitly scoped by the adendo itself
 * as data-only today; no suggestion/ranking algorithm reads this yet.
 */
export const caregiverAvailabilitySchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    personId: uuidSchema,
    dayOfWeek: z.number().int().min(0).max(6), // 0 = Sunday
    startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
    endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
    note: z.string().max(500).nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .merge(auditableFieldsSchema);
export type CaregiverAvailability = z.infer<typeof caregiverAvailabilitySchema>;
