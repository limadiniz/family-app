import { describe, expect, it, vi } from 'vitest';
import { CommandCenterService } from '../src/modules/command-center/command-center.service';
import type { PolicyService } from '../src/common/policy.service';
import type { AuditService } from '../src/common/audit.service';
import type { SupabaseService } from '../src/common/supabase.service';
import type { RequestActor } from '../src/common/auth.guard';

/** Same faked-dependency approach as care-schedule.test.ts / care-brief.test.ts. */
function makeFakeSupabaseClient(responses: Record<string, { data: unknown; error: unknown }>) {
  function from(table: string) {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order', 'or', 'neq', 'gte', 'lte']) {
      builder[method] = () => builder;
    }
    builder['then'] = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(responses[table] ?? { data: [], error: null }).then(onFulfilled);
    return builder;
  }
  return { client: { from } };
}

const ANA: RequestActor = { authUserId: 'auth-ana', tenantId: 'tenant-1', personId: 'ana', bearerToken: 'token-ana' };

describe('CommandCenterService.getToday — Conflict Engine wiring (§43)', () => {
  it('surfaces a SIMULTANEOUS_EVENTS conflict computed from the day\'s calendar_events', async () => {
    const { client } = makeFakeSupabaseClient({
      calendar_events: {
        data: [
          { id: 'e1', subject_person_id: 'pedro', title: 'Futebol', category: 'SPORT', starts_at: '2026-08-20T10:00:00Z', ends_at: '2026-08-20T11:00:00Z', responsible_person_id: null, transportation_person_id: 'ana' },
          { id: 'e2', subject_person_id: 'pedro', title: 'Natação', category: 'SPORT', starts_at: '2026-08-20T10:30:00Z', ends_at: '2026-08-20T11:30:00Z', responsible_person_id: null, transportation_person_id: 'ana' },
        ],
        error: null,
      },
      tasks: { data: [], error: null },
      routines: { data: [], error: null },
      care_windows: { data: [], error: null },
      responsibility_assignments: { data: [], error: null },
      handoffs: { data: [], error: null },
    });

    const service = new CommandCenterService(
      { forUser: () => client } as unknown as SupabaseService,
      { authorizeOrThrow: vi.fn().mockResolvedValue(undefined) } as unknown as PolicyService,
      { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService,
    );

    const today = await service.getToday(ANA, 'pedro', '2026-08-20');
    expect(today.conflicts).toHaveLength(1);
    expect(today.conflicts[0].type).toBe('SIMULTANEOUS_EVENTS');
  });

  it('returns an empty conflicts array when nothing overlaps', async () => {
    const { client } = makeFakeSupabaseClient({
      calendar_events: { data: [], error: null },
      tasks: { data: [], error: null },
      routines: { data: [], error: null },
      care_windows: { data: [], error: null },
      responsibility_assignments: { data: [], error: null },
      handoffs: { data: [], error: null },
    });

    const service = new CommandCenterService(
      { forUser: () => client } as unknown as SupabaseService,
      { authorizeOrThrow: vi.fn().mockResolvedValue(undefined) } as unknown as PolicyService,
      { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService,
    );

    const today = await service.getToday(ANA, 'pedro', '2026-08-20');
    expect(today.conflicts).toEqual([]);
  });
});
