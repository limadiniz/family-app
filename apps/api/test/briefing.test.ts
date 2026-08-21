import { describe, expect, it, vi } from 'vitest';
import { BriefingService } from '../src/modules/briefing/briefing.service';
import { CommandCenterService } from '../src/modules/command-center/command-center.service';
import { PolicyDeniedError, type PolicyService } from '../src/common/policy.service';
import type { SupabaseService } from '../src/common/supabase.service';
import type { RequestActor } from '../src/common/auth.guard';

/** Same faked-dependency approach as the other new-module tests. */
function makeFakeSupabaseClient(responses: Record<string, Array<{ data: unknown; error: unknown }>>) {
  const counters: Record<string, number> = {};
  function resolveFor(table: string) {
    const queue = responses[table] ?? [];
    const idx = counters[table] ?? 0;
    counters[table] = idx + 1;
    return queue[idx] ?? queue[queue.length - 1] ?? { data: null, error: null };
  }
  function from(table: string) {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order', 'or', 'in', 'gte', 'lte', 'limit', 'neq']) {
      builder[method] = () => builder;
    }
    builder['then'] = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolveFor(table)).then(onFulfilled);
    builder['maybeSingle'] = async () => resolveFor(table);
    return builder;
  }
  return { client: { from } };
}

const ANA: RequestActor = { authUserId: 'auth-ana', tenantId: 'tenant-1', personId: 'ana', bearerToken: 'token-ana' };

describe('BriefingService.getDailyBriefing', () => {
  it('sweeps every family member via CommandCenterService.getToday and skips ones the actor cannot view', async () => {
    const { client } = makeFakeSupabaseClient({
      family_memberships: [
        { data: [{ family_unit_id: 'fu-1' }], error: null },
        {
          data: [
            { person_id: 'ana', persons: { display_name: 'Ana' } },
            { person_id: 'pedro', persons: { display_name: 'Pedro' } },
          ],
          error: null,
        },
      ],
    });

    const getToday = vi
      .fn()
      .mockImplementationOnce(async () => ({ date: '2026-08-20', events: [], tasks: [], routines: [], conflicts: [] }))
      .mockImplementationOnce(async () => {
        throw new PolicyDeniedError('NO_ACCESS');
      });

    const service = new BriefingService(
      { forUser: () => client } as unknown as SupabaseService,
      {} as unknown as PolicyService,
      { getToday } as unknown as CommandCenterService,
    );

    const briefing = await service.getDailyBriefing(ANA, '2026-08-20');
    expect(briefing.people).toHaveLength(1);
    expect(briefing.people[0].personId).toBe('ana');
  });

  it('returns an empty people list when the actor has no family memberships', async () => {
    const { client } = makeFakeSupabaseClient({ family_memberships: [{ data: [], error: null }] });
    const service = new BriefingService(
      { forUser: () => client } as unknown as SupabaseService,
      {} as unknown as PolicyService,
      { getToday: vi.fn() } as unknown as CommandCenterService,
    );
    const briefing = await service.getDailyBriefing(ANA, '2026-08-20');
    expect(briefing.people).toEqual([]);
  });
});

describe('BriefingService.getActivityFeed', () => {
  it('renders a curated template for a known event type and resolves person names', async () => {
    const { client } = makeFakeSupabaseClient({
      audit_events: [
        {
          data: [
            {
              id: 'ev1',
              event_type: 'RESPONSIBILITY_ASSIGNMENT_ACCEPTED',
              actor_person_id: 'maria-avo',
              subject_person_id: 'pedro',
              occurred_at: '2026-08-20T17:05:00Z',
              result: 'SUCCESS',
            },
          ],
          error: null,
        },
      ],
      persons: [
        {
          data: [
            { id: 'maria-avo', display_name: 'Maria' },
            { id: 'pedro', display_name: 'Pedro' },
          ],
          error: null,
        },
      ],
    });

    const service = new BriefingService(
      { forUser: () => client } as unknown as SupabaseService,
      { authorizeOrThrow: vi.fn().mockResolvedValue(undefined) } as unknown as PolicyService,
      {} as unknown as CommandCenterService,
    );

    const feed = await service.getActivityFeed(ANA);
    expect(feed).toEqual([{ occurredAt: '2026-08-20T17:05:00Z', eventType: 'RESPONSIBILITY_ASSIGNMENT_ACCEPTED', message: 'Maria aceitou cuidar de Pedro.' }]);
  });

  it('omits events the actor is not authorized (VIEW/AUDIT) to see for that subject', async () => {
    const { client } = makeFakeSupabaseClient({
      audit_events: [
        {
          data: [
            { id: 'ev1', event_type: 'HANDOFF_COMPLETED', actor_person_id: 'carlos', subject_person_id: 'other-child', occurred_at: '2026-08-20T18:10:00Z', result: 'SUCCESS' },
          ],
          error: null,
        },
      ],
      persons: [{ data: [{ id: 'carlos', display_name: 'Carlos' }], error: null }],
    });

    const service = new BriefingService(
      { forUser: () => client } as unknown as SupabaseService,
      { authorizeOrThrow: vi.fn().mockRejectedValue(new PolicyDeniedError('NO_ACCESS')) } as unknown as PolicyService,
      {} as unknown as CommandCenterService,
    );

    const feed = await service.getActivityFeed(ANA);
    expect(feed).toEqual([]);
  });
});
