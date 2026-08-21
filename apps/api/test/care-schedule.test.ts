import { describe, expect, it, vi } from 'vitest';
import { CareScheduleService } from '../src/modules/care-schedule/care-schedule.service';
import { PolicyDeniedError, type PolicyService } from '../src/common/policy.service';
import type { AuditService } from '../src/common/audit.service';
import type { SupabaseService } from '../src/common/supabase.service';
import type { RequestActor } from '../src/common/auth.guard';

/**
 * CareSchedule/CareWindow/Handoff application layer (V3 §17-19, §31) —
 * same faked-dependency approach as care-network.test.ts (no live
 * Supabase/PostgREST available in this environment for authenticated
 * HTTP-level integration tests; see gap-analysis-v3.md).
 */
function makeFakeSupabaseClient(responses: Record<string, Array<{ data: unknown; error: unknown }>>) {
  const counters: Record<string, number> = {};
  const inserted: Record<string, unknown[]> = {};

  function resolveFor(table: string) {
    const queue = responses[table] ?? [];
    const idx = counters[table] ?? 0;
    counters[table] = idx + 1;
    return queue[idx] ?? queue[queue.length - 1] ?? { data: null, error: null };
  }

  function from(table: string) {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order', 'or', 'update', 'upsert', 'is', 'gte', 'lte']) {
      builder[method] = () => builder;
    }
    builder['insert'] = (row: unknown) => {
      inserted[table] = inserted[table] ?? [];
      if (Array.isArray(row)) inserted[table].push(...row);
      else inserted[table].push(row);
      return builder;
    };
    builder['then'] = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolveFor(table)).then(onFulfilled);
    builder['single'] = async () => resolveFor(table);
    builder['maybeSingle'] = async () => resolveFor(table);
    return builder;
  }

  return { client: { from }, inserted, counters };
}

const ANA: RequestActor = { authUserId: 'auth-ana', tenantId: 'tenant-1', personId: 'ana', bearerToken: 'token-ana' };

function makeService(opts: {
  responses: Record<string, Array<{ data: unknown; error: unknown }>>;
  authorizeOrThrow?: ReturnType<typeof vi.fn>;
  auditRecord?: ReturnType<typeof vi.fn>;
}) {
  const { client, inserted } = makeFakeSupabaseClient(opts.responses);
  const auditRecord = opts.auditRecord ?? vi.fn().mockResolvedValue(undefined);
  const authorizeOrThrow = opts.authorizeOrThrow ?? vi.fn().mockResolvedValue(undefined);

  const service = new CareScheduleService(
    { forUser: () => client } as unknown as SupabaseService,
    { authorizeOrThrow } as unknown as PolicyService,
    { record: auditRecord } as unknown as AuditService,
  );
  return { service, inserted, auditRecord, authorizeOrThrow };
}

describe('CareScheduleService.createSchedule', () => {
  it('denies creation when the Policy Engine denies CREATE/SCHEDULE', async () => {
    const { service, authorizeOrThrow } = makeService({
      responses: {},
      authorizeOrThrow: vi.fn().mockRejectedValue(new PolicyDeniedError('NO_AUTHORITY')),
    });
    await expect(
      service.createSchedule(ANA, {
        childPersonId: 'pedro',
        caregiverPersonId: 'maria-avo',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        startDate: '2026-08-03',
      }),
    ).rejects.toThrow(PolicyDeniedError);
    expect(authorizeOrThrow).toHaveBeenCalledWith(ANA, 'CREATE', 'SCHEDULE', 'pedro', { purpose: 'create_care_schedule' });
  });

  it('inserts a care_schedules row and records CARE_SCHEDULE_CREATED', async () => {
    const { service, auditRecord } = makeService({
      responses: {
        care_schedules: [{ data: { id: 'sched-1', child_person_id: 'pedro' }, error: null }],
      },
    });
    const result = await service.createSchedule(ANA, {
      childPersonId: 'pedro',
      caregiverPersonId: 'maria-avo',
      rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
      startDate: '2026-08-03',
      exceptions: ['2026-08-10'],
      excludeBrNationalHolidays: true,
    });
    expect(result).toEqual({ id: 'sched-1', child_person_id: 'pedro' });
    expect(auditRecord).toHaveBeenCalledWith(
      ANA,
      expect.objectContaining({ eventType: 'CARE_SCHEDULE_CREATED', subjectPersonId: 'pedro', resourceId: 'sched-1' }),
    );
  });
});

describe('CareScheduleService.occurrences', () => {
  it('expands the schedule honoring persisted exceptions and holiday flag', async () => {
    const { service } = makeService({
      responses: {
        care_schedules: [
          {
            data: {
              id: 'sched-1',
              child_person_id: 'pedro',
              rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
              start_date: '2026-08-03',
              end_date: null,
              exceptions: ['2026-08-05'],
              exclude_br_national_holidays: false,
            },
            error: null,
          },
        ],
      },
    });
    const occurrences = await service.occurrences(ANA, 'sched-1', '2026-08-03', '2026-08-07');
    expect(occurrences).toEqual(['2026-08-03', '2026-08-07']); // 08-05 excluded by explicit exception
  });
});

describe('CareScheduleService.materializeWindow', () => {
  it('refuses to materialize a date that is not a real occurrence', async () => {
    const { service } = makeService({
      responses: {
        care_schedules: [
          {
            data: {
              id: 'sched-1',
              child_person_id: 'pedro',
              caregiver_person_id: 'maria-avo',
              rrule: 'FREQ=WEEKLY;BYDAY=MO',
              start_date: '2026-08-03',
              end_date: null,
              exceptions: [],
              exclude_br_national_holidays: false,
              residence_id: null,
            },
            error: null,
          },
        ],
      },
    });
    // 2026-08-04 is a Tuesday, not a Monday occurrence.
    await expect(service.materializeWindow(ANA, 'sched-1', { date: '2026-08-04' })).rejects.toThrow(
      /não é uma ocorrência válida/,
    );
  });

  it('creates a CareWindow referencing the CareSchedule for a valid occurrence', async () => {
    const { service, inserted } = makeService({
      responses: {
        care_schedules: [
          {
            data: {
              id: 'sched-1',
              child_person_id: 'pedro',
              caregiver_person_id: 'maria-avo',
              rrule: 'FREQ=WEEKLY;BYDAY=MO',
              start_date: '2026-08-03',
              end_date: null,
              exceptions: [],
              exclude_br_national_holidays: false,
              residence_id: null,
            },
            error: null,
          },
        ],
        care_windows: [{ data: { id: 'window-1' }, error: null }],
      },
    });
    await service.materializeWindow(ANA, 'sched-1', { date: '2026-08-03', startTime: '07:00:00', endTime: '19:00:00' });
    expect(inserted.care_windows).toEqual([
      expect.objectContaining({
        care_schedule_id: 'sched-1',
        child_person_id: 'pedro',
        caregiver_person_id: 'maria-avo',
        starts_at: '2026-08-03T07:00:00.000Z',
        ends_at: '2026-08-03T19:00:00.000Z',
        status: 'SCHEDULED',
      }),
    ]);
  });
});

describe('CareScheduleService.transition (Handoff state machine)', () => {
  it('rejects an invalid transition without touching the database or policy engine', async () => {
    const { service, authorizeOrThrow } = makeService({
      responses: {
        handoffs: [{ data: { id: 'h1', status: 'COMPLETED', child_person_id: 'pedro' }, error: null }],
      },
    });
    await expect(service.transition(ANA, 'h1', 'CONFIRMED')).rejects.toThrow(/Transição inválida/);
    expect(authorizeOrThrow).not.toHaveBeenCalled();
  });

  it('on completion of a Handoff linked to a CareWindow, also activates that CareWindow', async () => {
    const { service, auditRecord } = makeService({
      responses: {
        handoffs: [
          { data: { id: 'h1', status: 'CONFIRMED', child_person_id: 'pedro', care_window_id: 'window-1' }, error: null },
          { data: { id: 'h1', status: 'COMPLETED', child_person_id: 'pedro', care_window_id: 'window-1' }, error: null },
        ],
        care_windows: [
          { data: { id: 'window-1', child_person_id: 'pedro', status: 'SCHEDULED' }, error: null },
          { data: { id: 'window-1', child_person_id: 'pedro', status: 'ACTIVE' }, error: null },
        ],
      },
    });

    await service.transition(ANA, 'h1', 'COMPLETED');

    expect(auditRecord).toHaveBeenCalledWith(
      ANA,
      expect.objectContaining({ eventType: 'HANDOFF_COMPLETED', resourceId: 'h1' }),
    );
    expect(auditRecord).toHaveBeenCalledWith(
      ANA,
      expect.objectContaining({ eventType: 'CARE_WINDOW_ACTIVATED', resourceId: 'window-1' }),
    );
  });
});
