import { describe, expect, it } from 'vitest';
import { detectConflicts, type ConflictEngineInput } from '../src/entities/conflict';

const EMPTY: ConflictEngineInput = { events: [], careWindows: [], responsibilityAssignments: [], handoffs: [] };

describe('detectConflicts', () => {
  it('returns no conflicts for an empty day', () => {
    expect(detectConflicts(EMPTY)).toEqual([]);
  });

  it('flags SIMULTANEOUS_EVENTS for the same child at overlapping times', () => {
    const conflicts = detectConflicts({
      ...EMPTY,
      events: [
        { id: 'e1', subjectPersonId: 'pedro', title: 'Futebol', category: 'SPORT', startsAt: '2026-08-20T10:00:00Z', endsAt: '2026-08-20T11:00:00Z', responsiblePersonId: null, transportationPersonId: 'ana' },
        { id: 'e2', subjectPersonId: 'pedro', title: 'Natação', category: 'SPORT', startsAt: '2026-08-20T10:30:00Z', endsAt: '2026-08-20T11:30:00Z', responsiblePersonId: null, transportationPersonId: 'ana' },
      ],
    });
    expect(conflicts.filter((c) => c.type === 'SIMULTANEOUS_EVENTS')).toHaveLength(1);
  });

  it('does not flag two events for different children as simultaneous', () => {
    const conflicts = detectConflicts({
      ...EMPTY,
      events: [
        { id: 'e1', subjectPersonId: 'pedro', title: 'Futebol', category: 'SPORT', startsAt: '2026-08-20T10:00:00Z', endsAt: '2026-08-20T11:00:00Z', responsiblePersonId: null, transportationPersonId: 'ana' },
        { id: 'e2', subjectPersonId: 'mariana', title: 'Natação', category: 'SPORT', startsAt: '2026-08-20T10:30:00Z', endsAt: '2026-08-20T11:30:00Z', responsiblePersonId: null, transportationPersonId: 'ana' },
      ],
    });
    expect(conflicts.filter((c) => c.type === 'SIMULTANEOUS_EVENTS')).toHaveLength(0);
  });

  it('flags MISSING_TRANSPORT only for transport-relevant categories without a transportationPersonId', () => {
    const conflicts = detectConflicts({
      ...EMPTY,
      events: [
        { id: 'e1', subjectPersonId: 'pedro', title: 'Prova', category: 'SCHOOL', startsAt: '2026-08-20T08:00:00Z', endsAt: '2026-08-20T09:00:00Z', responsiblePersonId: null, transportationPersonId: null },
        { id: 'e2', subjectPersonId: 'pedro', title: 'Aniversário', category: 'OTHER', startsAt: '2026-08-20T14:00:00Z', endsAt: '2026-08-20T15:00:00Z', responsiblePersonId: null, transportationPersonId: null },
      ],
    });
    const missing = conflicts.filter((c) => c.type === 'MISSING_TRANSPORT');
    expect(missing).toHaveLength(1);
    expect(missing[0].involvedResourceIds).toEqual(['e1']);
  });

  it('flags UNAVAILABLE_RESPONSIBLE when the transporting adult has their own overlapping commitment', () => {
    const conflicts = detectConflicts({
      ...EMPTY,
      events: [
        { id: 'e1', subjectPersonId: 'pedro', title: 'Pediatra', category: 'HEALTH', startsAt: '2026-08-20T10:00:00Z', endsAt: '2026-08-20T11:00:00Z', responsiblePersonId: 'ana', transportationPersonId: 'ana' },
        { id: 'e2', subjectPersonId: 'ana', title: 'Reunião de trabalho', category: 'OTHER', startsAt: '2026-08-20T10:30:00Z', endsAt: '2026-08-20T11:30:00Z', responsiblePersonId: null, transportationPersonId: null },
      ],
    });
    expect(conflicts.filter((c) => c.type === 'UNAVAILABLE_RESPONSIBLE')).toHaveLength(1);
  });

  it('flags CHILD_IN_TWO_RESIDENCES for overlapping CareWindows with different caregivers AND different residences', () => {
    const conflicts = detectConflicts({
      ...EMPTY,
      careWindows: [
        { id: 'w1', childPersonId: 'pedro', caregiverPersonId: 'ana', residenceId: 'res-ana', startsAt: '2026-08-20T09:00:00Z', endsAt: '2026-08-20T18:00:00Z', status: 'SCHEDULED' },
        { id: 'w2', childPersonId: 'pedro', caregiverPersonId: 'carlos', residenceId: 'res-carlos', startsAt: '2026-08-20T12:00:00Z', endsAt: '2026-08-20T20:00:00Z', status: 'SCHEDULED' },
      ],
    });
    expect(conflicts.map((c) => c.type)).toEqual(['CHILD_IN_TWO_RESIDENCES']);
  });

  it('flags INCOMPATIBLE_CARE_WINDOWS (not residence-specific) when residence is unknown/same', () => {
    const conflicts = detectConflicts({
      ...EMPTY,
      careWindows: [
        { id: 'w1', childPersonId: 'pedro', caregiverPersonId: 'ana', residenceId: null, startsAt: '2026-08-20T09:00:00Z', endsAt: '2026-08-20T18:00:00Z', status: 'ACTIVE' },
        { id: 'w2', childPersonId: 'pedro', caregiverPersonId: 'maria-avo', residenceId: null, startsAt: '2026-08-20T12:00:00Z', endsAt: '2026-08-20T20:00:00Z', status: 'SCHEDULED' },
      ],
    });
    expect(conflicts.map((c) => c.type)).toEqual(['INCOMPATIBLE_CARE_WINDOWS']);
  });

  it('ignores CANCELLED CareWindows entirely', () => {
    const conflicts = detectConflicts({
      ...EMPTY,
      careWindows: [
        { id: 'w1', childPersonId: 'pedro', caregiverPersonId: 'ana', residenceId: null, startsAt: '2026-08-20T09:00:00Z', endsAt: '2026-08-20T18:00:00Z', status: 'CANCELLED' },
        { id: 'w2', childPersonId: 'pedro', caregiverPersonId: 'maria-avo', residenceId: null, startsAt: '2026-08-20T12:00:00Z', endsAt: '2026-08-20T20:00:00Z', status: 'SCHEDULED' },
      ],
    });
    expect(conflicts).toEqual([]);
  });

  it('flags CONFLICTING_RESPONSIBILITIES for overlapping ACTIVE assignments to different people', () => {
    const conflicts = detectConflicts({
      ...EMPTY,
      responsibilityAssignments: [
        { id: 'r1', subjectPersonId: 'pedro', assignedToPersonId: 'ana', startsAt: '2026-08-20T09:00:00Z', endsAt: '2026-08-20T18:00:00Z', status: 'ACTIVE' },
        { id: 'r2', subjectPersonId: 'pedro', assignedToPersonId: 'maria-avo', startsAt: '2026-08-20T12:00:00Z', endsAt: '2026-08-20T20:00:00Z', status: 'ACTIVE' },
      ],
    });
    expect(conflicts.map((c) => c.type)).toEqual(['CONFLICTING_RESPONSIBILITIES']);
  });

  it('flags IMPOSSIBLE_HANDOFF for two handoffs of the same child under the minimum gap', () => {
    const conflicts = detectConflicts({
      ...EMPTY,
      handoffs: [
        { id: 'h1', childPersonId: 'pedro', fromPersonId: 'ana', toPersonId: 'maria-avo', scheduledAt: '2026-08-20T18:00:00Z', status: 'EXPECTED' },
        { id: 'h2', childPersonId: 'pedro', fromPersonId: 'maria-avo', toPersonId: 'carlos', scheduledAt: '2026-08-20T18:10:00Z', status: 'EXPECTED' },
      ],
    });
    expect(conflicts.map((c) => c.type)).toEqual(['IMPOSSIBLE_HANDOFF']);
  });

  it('does not flag IMPOSSIBLE_HANDOFF for handoffs comfortably spaced apart', () => {
    const conflicts = detectConflicts({
      ...EMPTY,
      handoffs: [
        { id: 'h1', childPersonId: 'pedro', fromPersonId: 'ana', toPersonId: 'maria-avo', scheduledAt: '2026-08-20T08:00:00Z', status: 'EXPECTED' },
        { id: 'h2', childPersonId: 'pedro', fromPersonId: 'maria-avo', toPersonId: 'carlos', scheduledAt: '2026-08-20T18:00:00Z', status: 'EXPECTED' },
      ],
    });
    expect(conflicts).toEqual([]);
  });
});
