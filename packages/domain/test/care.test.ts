import { describe, expect, it } from 'vitest';
import { canTransitionHandoff, expandCareScheduleOccurrences } from '../src/entities/care';

describe('canTransitionHandoff', () => {
  it('allows EXPECTED -> CONFIRMED', () => {
    expect(canTransitionHandoff('EXPECTED', 'CONFIRMED')).toBe(true);
  });

  it('does not allow COMPLETED -> anything (terminal state)', () => {
    expect(canTransitionHandoff('COMPLETED', 'CONFIRMED')).toBe(false);
    expect(canTransitionHandoff('COMPLETED', 'CANCELLED')).toBe(false);
  });

  it('allows DISPUTED to be resolved back to CONFIRMED or CANCELLED only', () => {
    expect(canTransitionHandoff('DISPUTED', 'CONFIRMED')).toBe(true);
    expect(canTransitionHandoff('DISPUTED', 'CANCELLED')).toBe(true);
    expect(canTransitionHandoff('DISPUTED', 'COMPLETED')).toBe(false);
  });
});

describe('expandCareScheduleOccurrences', () => {
  const base = {
    rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
    startDate: '2026-08-03', // a Monday
    endDate: null as string | null,
    exceptions: [] as string[],
    excludeBrNationalHolidays: false,
  };

  it('expands a weekly rule within the requested range', () => {
    const occurrences = expandCareScheduleOccurrences(base, '2026-08-03', '2026-08-14');
    // Mon 3, Wed 5, Fri 7, Mon 10, Wed 12, Fri 14
    expect(occurrences).toEqual(['2026-08-03', '2026-08-05', '2026-08-07', '2026-08-10', '2026-08-12', '2026-08-14']);
  });

  it('honors an explicit exception date', () => {
    const occurrences = expandCareScheduleOccurrences(
      { ...base, exceptions: ['2026-08-05'] },
      '2026-08-03',
      '2026-08-07',
    );
    expect(occurrences).toEqual(['2026-08-03', '2026-08-07']);
  });

  it('excludes BR national holidays when requested', () => {
    // 2026-09-07 (Independência, a Monday) falls in this range.
    const occurrences = expandCareScheduleOccurrences(
      { ...base, excludeBrNationalHolidays: true },
      '2026-09-07',
      '2026-09-09',
    );
    expect(occurrences).not.toContain('2026-09-07');
    expect(occurrences).toEqual(['2026-09-09']);
  });

  it('never produces an occurrence past the schedule endDate even if the requested range extends further', () => {
    const occurrences = expandCareScheduleOccurrences(
      { ...base, endDate: '2026-08-05' },
      '2026-08-03',
      '2026-08-14',
    );
    expect(occurrences).toEqual(['2026-08-03', '2026-08-05']);
  });

  it('returns an empty array when the range starts after the schedule ends', () => {
    const occurrences = expandCareScheduleOccurrences(
      { ...base, endDate: '2026-08-05' },
      '2026-08-10',
      '2026-08-14',
    );
    expect(occurrences).toEqual([]);
  });
});
