import { describe, expect, it, vi } from 'vitest';
import { AiInsightsService, buildInsightDrafts } from '../src/modules/ai/ai-insights.service';
import type { RequestActor } from '../src/common/auth.guard';

const ACTOR: RequestActor = {
  authUserId: 'auth-ana',
  tenantId: '00000000-0000-4000-8000-000000000001',
  personId: '00000000-0000-4000-8000-000000000002',
  bearerToken: 'token',
};

function plan() {
  return {
    needsAttention: {
      conflicts: [{
        type: 'SIMULTANEOUS_EVENTS',
        severity: 'BLOCKING' as const,
        message: 'Dois compromissos se sobrepõem.',
        involvedPersonIds: ['00000000-0000-4000-8000-000000000003'],
        involvedResourceIds: ['event-1', 'event-2'],
      }],
      tasks: [],
    },
    today: { events: [] },
    tomorrow: { preparations: [] },
  };
}

describe('AI proactive insights — deterministic, opt-in and deduplicated', () => {
  it('derives conflict insight from a deterministic rule with a stable key', () => {
    const first = buildInsightDrafts(plan(), '2026-08-22')[0];
    const second = buildInsightDrafts(plan(), '2026-08-22')[0];
    expect(first).toEqual(second);
    expect(first).toEqual(expect.objectContaining({
      insightType: 'SCHEDULE_CONFLICT_DETECTED',
      ruleId: 'conflict_engine:SIMULTANEOUS_EVENTS',
      proposedActionType: 'PROPOSE_REQUEST',
    }));
  });

  it('does not scan the family plan when proactivity is disabled', async () => {
    const getFamilyPlan = vi.fn();
    const service = new AiInsightsService(
      {} as never,
      { getFamilyPlan } as never,
      { getPreferences: vi.fn().mockResolvedValue({ proactive_enabled: false }) } as never,
      { record: vi.fn() } as never,
    );
    await expect(service.getForDay(ACTOR, '2026-08-22')).resolves.toEqual({
      enabled: false,
      suppressedReason: 'DISABLED',
      insights: [],
    });
    expect(getFamilyPlan).not.toHaveBeenCalled();
  });

  it('upserts using the actor and stable dedupe key, never a raw prompt', async () => {
    const upsert = vi.fn();
    const select = vi.fn().mockResolvedValue({ data: [], error: null });
    upsert.mockReturnValue({ select });
    const service = new AiInsightsService(
      { forUser: () => ({ from: () => ({ upsert }) }) } as never,
      { getFamilyPlan: vi.fn().mockResolvedValue(plan()) } as never,
      { getPreferences: vi.fn().mockResolvedValue({ proactive_enabled: true, quiet_hours_start: null, quiet_hours_end: null }) } as never,
      { record: vi.fn() } as never,
    );
    await service.getForDay(ACTOR, '2026-08-22');
    expect(upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ actor_person_id: ACTOR.personId, dedupe_key: expect.stringContaining('conflict') })],
      expect.objectContaining({ ignoreDuplicates: false }),
    );
    expect(JSON.stringify(upsert.mock.calls)).not.toContain('question');
  });
});
