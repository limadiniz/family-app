import { z } from 'zod';

/**
 * Conflict Engine (V3 §43). A pure, I/O-free detector: apps/api fetches
 * the relevant slice of a person/day's data (events, CareWindows,
 * ResponsibilityAssignments, Handoffs) and hands it to `detectConflicts`,
 * which returns a flat list of conflicts. Kept here (not in apps/api) so
 * the detection rules are unit-testable without a database, same
 * rationale as `expandCareScheduleOccurrences`.
 *
 * §43's list vs. what's implemented:
 * - "eventos simultâneos"              -> SIMULTANEOUS_EVENTS
 * - "responsável indisponível"         -> UNAVAILABLE_RESPONSIBLE
 * - "criança em outra residência"      -> CHILD_IN_TWO_RESIDENCES
 * - "ausência de transporte"           -> MISSING_TRANSPORT
 * - "CareWindow incompatível"          -> INCOMPATIBLE_CARE_WINDOWS
 * - "handoff impossível"               -> IMPOSSIBLE_HANDOFF
 * - "responsabilidades conflitantes"   -> CONFLICTING_RESPONSIBILITIES
 */
export const conflictTypeSchema = z.enum([
  'SIMULTANEOUS_EVENTS',
  'UNAVAILABLE_RESPONSIBLE',
  'CHILD_IN_TWO_RESIDENCES',
  'MISSING_TRANSPORT',
  'INCOMPATIBLE_CARE_WINDOWS',
  'IMPOSSIBLE_HANDOFF',
  'CONFLICTING_RESPONSIBILITIES',
]);
export type ConflictType = z.infer<typeof conflictTypeSchema>;

export const conflictSchema = z.object({
  type: conflictTypeSchema,
  severity: z.enum(['ATTENTION', 'BLOCKING']),
  message: z.string(),
  involvedPersonIds: z.array(z.string()),
  involvedResourceIds: z.array(z.string()),
});
export type Conflict = z.infer<typeof conflictSchema>;

export interface ConflictCalendarEvent {
  id: string;
  subjectPersonId: string;
  title: string;
  category: string;
  startsAt: string;
  endsAt: string | null;
  responsiblePersonId: string | null;
  transportationPersonId: string | null;
}

export interface ConflictCareWindow {
  id: string;
  childPersonId: string;
  caregiverPersonId: string;
  residenceId: string | null;
  startsAt: string;
  endsAt: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
}

export interface ConflictResponsibilityAssignment {
  id: string;
  subjectPersonId: string;
  assignedToPersonId: string;
  startsAt: string;
  endsAt: string;
  status: string;
}

export interface ConflictHandoff {
  id: string;
  childPersonId: string;
  fromPersonId: string;
  toPersonId: string;
  scheduledAt: string;
  status: string;
}

export interface ConflictEngineInput {
  events: ConflictCalendarEvent[];
  careWindows: ConflictCareWindow[];
  responsibilityAssignments: ConflictResponsibilityAssignment[];
  handoffs: ConflictHandoff[];
}

/** Categories that plausibly need someone to physically move the child. */
const TRANSPORT_RELEVANT_CATEGORIES = new Set(['SCHOOL', 'HEALTH', 'SPORT']);

/** Minimum realistic gap between two handoffs for the same child (minutes). */
const MIN_HANDOFF_GAP_MINUTES = 30;

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd);
}

function eventEnd(e: ConflictCalendarEvent): string {
  return e.endsAt ?? e.startsAt;
}

/** All unordered pairs of a list — avoids indexed access under `noUncheckedIndexedAccess`. */
function pairs<T>(arr: T[]): Array<[T, T]> {
  const result: Array<[T, T]> = [];
  for (const [i, a] of arr.entries()) {
    for (const b of arr.slice(i + 1)) {
      result.push([a, b]);
    }
  }
  return result;
}

export function detectConflicts(input: ConflictEngineInput): Conflict[] {
  const conflicts: Conflict[] = [];

  // SIMULTANEOUS_EVENTS — two events for the same person overlapping in time.
  for (const [a, b] of pairs(input.events)) {
    if (a.subjectPersonId !== b.subjectPersonId) continue;
    if (!overlaps(a.startsAt, eventEnd(a), b.startsAt, eventEnd(b))) continue;
    conflicts.push({
      type: 'SIMULTANEOUS_EVENTS',
      severity: 'BLOCKING',
      message: `"${a.title}" e "${b.title}" estão marcados no mesmo horário.`,
      involvedPersonIds: [a.subjectPersonId],
      involvedResourceIds: [a.id, b.id],
    });
  }

  // MISSING_TRANSPORT — a transport-relevant event with no transportationPersonId.
  for (const e of input.events) {
    if (!TRANSPORT_RELEVANT_CATEGORIES.has(e.category)) continue;
    if (e.transportationPersonId) continue;
    conflicts.push({
      type: 'MISSING_TRANSPORT',
      severity: 'ATTENTION',
      message: `"${e.title}" ainda não tem quem leve/busque definido.`,
      involvedPersonIds: [e.subjectPersonId],
      involvedResourceIds: [e.id],
    });
  }

  // UNAVAILABLE_RESPONSIBLE — the person responsible for/transporting one
  // child's event is, at that same time, the SUBJECT of another event
  // (i.e. has their own commitment) elsewhere.
  for (const e of input.events) {
    const busyPersonIds = new Set([e.responsiblePersonId, e.transportationPersonId].filter((x): x is string => !!x));
    for (const busyPersonId of busyPersonIds) {
      const conflicting = input.events.find(
        (other) =>
          other.id !== e.id &&
          other.subjectPersonId === busyPersonId &&
          overlaps(e.startsAt, eventEnd(e), other.startsAt, eventEnd(other)),
      );
      if (conflicting) {
        conflicts.push({
          type: 'UNAVAILABLE_RESPONSIBLE',
          severity: 'BLOCKING',
          message: `A pessoa responsável por "${e.title}" tem outro compromisso ("${conflicting.title}") no mesmo horário.`,
          involvedPersonIds: [busyPersonId, e.subjectPersonId],
          involvedResourceIds: [e.id, conflicting.id],
        });
      }
    }
  }

  // UNAVAILABLE_RESPONSIBLE — the same caregiver/driver cannot cover two
  // different family members in overlapping commitments. This comparison
  // only becomes possible when the command center composes the whole family.
  for (const [a, b] of pairs(input.events)) {
    if (a.subjectPersonId === b.subjectPersonId) continue;
    if (!overlaps(a.startsAt, eventEnd(a), b.startsAt, eventEnd(b))) continue;

    const peopleOnA = new Set(
      [a.responsiblePersonId, a.transportationPersonId].filter((id): id is string => Boolean(id)),
    );
    const sharedPerson = [b.responsiblePersonId, b.transportationPersonId]
      .filter((id): id is string => Boolean(id))
      .find((id) => peopleOnA.has(id));
    if (!sharedPerson) continue;

    conflicts.push({
      type: 'UNAVAILABLE_RESPONSIBLE',
      severity: 'BLOCKING',
      message: `A mesma pessoa está responsável por “${a.title}” e “${b.title}” em horários sobrepostos.`,
      involvedPersonIds: [sharedPerson, a.subjectPersonId, b.subjectPersonId],
      involvedResourceIds: [a.id, b.id],
    });
  }

  const activeWindows = input.careWindows.filter((w) => w.status === 'SCHEDULED' || w.status === 'ACTIVE');

  // INCOMPATIBLE_CARE_WINDOWS — two overlapping windows for the same child, different caregivers.
  // CHILD_IN_TWO_RESIDENCES — same, but specifically a residence mismatch.
  for (const [a, b] of pairs(activeWindows)) {
    if (a.childPersonId !== b.childPersonId) continue;
    if (!overlaps(a.startsAt, a.endsAt, b.startsAt, b.endsAt)) continue;
    if (a.caregiverPersonId === b.caregiverPersonId) continue;

    if (a.residenceId && b.residenceId && a.residenceId !== b.residenceId) {
      conflicts.push({
        type: 'CHILD_IN_TWO_RESIDENCES',
        severity: 'BLOCKING',
        message: 'A criança está agendada para estar em duas residências diferentes ao mesmo tempo.',
        involvedPersonIds: [a.childPersonId, a.caregiverPersonId, b.caregiverPersonId],
        involvedResourceIds: [a.id, b.id],
      });
    } else {
      conflicts.push({
        type: 'INCOMPATIBLE_CARE_WINDOWS',
        severity: 'BLOCKING',
        message: 'Duas pessoas diferentes estão marcadas como responsáveis pela criança no mesmo horário.',
        involvedPersonIds: [a.childPersonId, a.caregiverPersonId, b.caregiverPersonId],
        involvedResourceIds: [a.id, b.id],
      });
    }
  }

  // CONFLICTING_RESPONSIBILITIES — two active assignments for the same
  // child, overlapping, different people.
  const activeAssignments = input.responsibilityAssignments.filter((r) => r.status === 'ACTIVE');
  for (const [a, b] of pairs(activeAssignments)) {
    if (a.subjectPersonId !== b.subjectPersonId) continue;
    if (a.assignedToPersonId === b.assignedToPersonId) continue;
    if (!overlaps(a.startsAt, a.endsAt, b.startsAt, b.endsAt)) continue;
    conflicts.push({
      type: 'CONFLICTING_RESPONSIBILITIES',
      severity: 'ATTENTION',
      message: 'Duas responsabilidades ativas se sobrepõem para a mesma criança, com pessoas diferentes.',
      involvedPersonIds: [a.subjectPersonId, a.assignedToPersonId, b.assignedToPersonId],
      involvedResourceIds: [a.id, b.id],
    });
  }

  // IMPOSSIBLE_HANDOFF — two handoffs for the same child too close together in time.
  const activeHandoffs = input.handoffs.filter((h) => h.status !== 'CANCELLED' && h.status !== 'COMPLETED');
  for (const [a, b] of pairs(activeHandoffs)) {
    if (a.childPersonId !== b.childPersonId) continue;
    const gapMinutes = Math.abs(new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()) / 60000;
    if (gapMinutes >= MIN_HANDOFF_GAP_MINUTES) continue;
    conflicts.push({
      type: 'IMPOSSIBLE_HANDOFF',
      severity: 'BLOCKING',
      message: `Dois handoffs marcados para a mesma criança com menos de ${MIN_HANDOFF_GAP_MINUTES} minutos de diferença.`,
      involvedPersonIds: [a.childPersonId, a.fromPersonId, a.toPersonId, b.fromPersonId, b.toPersonId],
      involvedResourceIds: [a.id, b.id],
    });
  }

  return conflicts;
}
