import { z } from 'zod';
import { auditableFieldsSchema, uuidSchema } from '../common';

/**
 * CareSchedule: recurring custody/care pattern (§17). Uses an RRULE-like
 * string (iCal RFC 5545 subset) rather than a bespoke recurrence format
 * so we can reuse a battle-tested parser (e.g. `rrule` npm package) in
 * apps rather than inventing recurrence math.
 */
export const careScheduleSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    childPersonId: uuidSchema,
    caregiverPersonId: uuidSchema,
    residenceId: uuidSchema.nullable().optional(),
    /** RFC 5545 RRULE, e.g. "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" */
    rrule: z.string().min(1),
    startDate: z.string().date(),
    endDate: z.string().date().nullable().optional(),
    label: z.string().max(150).nullable().optional(),
  })
  .merge(auditableFieldsSchema);
export type CareSchedule = z.infer<typeof careScheduleSchema>;

/**
 * CareWindow: a concrete, materialized instance of "person X is
 * responsible for child Y between time A and B" (§18). Generated from a
 * CareSchedule occurrence, or created ad-hoc (e.g. temporary caregiver
 * for one evening). CareWindow is what the Policy Engine, notifications,
 * medication reminders, and emergency profile actually consult — never
 * the raw recurrence rule.
 */
export const careWindowSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    childPersonId: uuidSchema,
    caregiverPersonId: uuidSchema,
    careScheduleId: uuidSchema.nullable().optional(), // null => ad-hoc window
    residenceId: uuidSchema.nullable().optional(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    status: z.enum(['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED']).default('SCHEDULED'),
  })
  .merge(auditableFieldsSchema)
  .refine((w) => new Date(w.endsAt) > new Date(w.startsAt), {
    message: 'endsAt must be after startsAt',
  });
export type CareWindow = z.infer<typeof careWindowSchema>;

/** Handoff state machine (§19). */
export const handoffStatusSchema = z.enum([
  'EXPECTED',
  'CONFIRMED',
  'COMPLETED',
  'DELAYED',
  'CANCELLED',
  'DISPUTED',
]);
export type HandoffStatus = z.infer<typeof handoffStatusSchema>;

export const handoffSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    childPersonId: uuidSchema,
    fromPersonId: uuidSchema,
    toPersonId: uuidSchema,
    careWindowId: uuidSchema.nullable().optional(),
    scheduledAt: z.string().datetime({ offset: true }),
    actualAt: z.string().datetime({ offset: true }).nullable().optional(),
    locationResidenceId: uuidSchema.nullable().optional(),
    status: handoffStatusSchema.default('EXPECTED'),
    notes: z.string().max(1000).nullable().optional(),
  })
  .merge(auditableFieldsSchema);
export type Handoff = z.infer<typeof handoffSchema>;

const HANDOFF_TRANSITIONS: Record<HandoffStatus, HandoffStatus[]> = {
  EXPECTED: ['CONFIRMED', 'DELAYED', 'CANCELLED', 'DISPUTED'],
  CONFIRMED: ['COMPLETED', 'DELAYED', 'CANCELLED', 'DISPUTED'],
  DELAYED: ['CONFIRMED', 'COMPLETED', 'CANCELLED', 'DISPUTED'],
  COMPLETED: [],
  CANCELLED: [],
  DISPUTED: ['CONFIRMED', 'CANCELLED'],
};

export function canTransitionHandoff(from: HandoffStatus, to: HandoffStatus): boolean {
  return HANDOFF_TRANSITIONS[from].includes(to);
}
