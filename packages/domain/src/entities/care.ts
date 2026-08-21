import { z } from 'zod';
import { RRule } from 'rrule';
import { auditableFieldsSchema, uuidSchema } from '../common';

/**
 * CareSchedule: recurring custody/care pattern (§17, V3 §31). Uses a real
 * RFC 5545 RRULE (via the `rrule` package) rather than a bespoke
 * recurrence format, plus an explicit `exceptions` list (§31: "férias,
 * exceções, feriados") — dates on which the rule would normally produce
 * an occurrence but shouldn't (a specific Monday that's a holiday, a week
 * the child is traveling, etc). Exceptions are dates, not a second rule,
 * so they stay auditable and don't require re-deriving what the schedule
 * "would have been".
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
    /** ISO dates (YYYY-MM-DD) explicitly excluded from the recurrence. */
    exceptions: z.array(z.string().date()).default([]),
    /**
     * When true, dates in `BR_NATIONAL_HOLIDAYS` (see below) for the
     * relevant years are also excluded. Fixed-date national holidays
     * only (Carnaval/Easter/Corpus Christi are moving holidays and
     * deliberately NOT computed here — see the constant's doc comment).
     */
    excludeBrNationalHolidays: z.boolean().default(false),
  })
  .merge(auditableFieldsSchema);
export type CareSchedule = z.infer<typeof careScheduleSchema>;

/**
 * Brazil's fixed-date national holidays (month-day, "MM-DD"). Deliberately
 * excludes moving holidays (Carnaval, Sexta-feira Santa, Corpo de Cristo)
 * — computing those correctly requires the Easter algorithm, and getting
 * it subtly wrong would silently generate a wrong CareSchedule occurrence
 * (a wrong pickup day is a real-world failure, not a cosmetic one). A
 * moving-holiday calendar is a documented followup, not implemented here.
 */
export const BR_NATIONAL_HOLIDAYS_MMDD: readonly string[] = [
  '01-01', // Confraternização Universal
  '04-21', // Tiradentes
  '05-01', // Dia do Trabalho
  '09-07', // Independência
  '10-12', // Nossa Senhora Aparecida
  '11-02', // Finados
  '11-15', // Proclamação da República
  '11-20', // Consciência Negra (feriado nacional desde 2024)
  '12-25', // Natal
];

function isBrNationalHoliday(isoDate: string): boolean {
  return BR_NATIONAL_HOLIDAYS_MMDD.includes(isoDate.slice(5, 10));
}

/**
 * Expands a CareSchedule into concrete occurrence dates (local, no time
 * component — CareWindow is what carries actual start/end instants)
 * between `[rangeStart, rangeEnd]`, honoring `exceptions` and
 * `excludeBrNationalHolidays`. Pure function — no I/O — so it's testable
 * without a database and safe to call from both the API (materializing
 * CareWindows) and, later, any UI that wants to preview a schedule before
 * saving it.
 */
export function expandCareScheduleOccurrences(
  schedule: Pick<CareSchedule, 'rrule' | 'startDate' | 'endDate' | 'exceptions' | 'excludeBrNationalHolidays'>,
  rangeStart: string,
  rangeEnd: string,
): string[] {
  const dtstart = new Date(`${schedule.startDate}T00:00:00.000Z`);
  const rule = RRule.fromString(
    schedule.rrule.startsWith('DTSTART') ? schedule.rrule : `DTSTART:${toRRuleUtc(dtstart)}\n${schedule.rrule}`,
  );

  const windowStart = new Date(`${rangeStart}T00:00:00.000Z`);
  const scheduleEnd = schedule.endDate ? new Date(`${schedule.endDate}T23:59:59.999Z`) : null;
  const windowEndCandidate = new Date(`${rangeEnd}T23:59:59.999Z`);
  const windowEnd = scheduleEnd && scheduleEnd < windowEndCandidate ? scheduleEnd : windowEndCandidate;
  if (windowEnd < windowStart) return [];

  const occurrences = rule.between(windowStart, windowEnd, true);
  const exceptionSet = new Set(schedule.exceptions ?? []);

  return occurrences
    .map((d) => d.toISOString().slice(0, 10))
    .filter((iso) => !exceptionSet.has(iso))
    .filter((iso) => !(schedule.excludeBrNationalHolidays && isBrNationalHoliday(iso)));
}

function toRRuleUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

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
