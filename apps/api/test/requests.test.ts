import { describe, expect, it, vi } from 'vitest';
import { RequestsService } from '../src/modules/requests/requests.service';
import type { AuditService } from '../src/common/audit.service';
import type { SupabaseService } from '../src/common/supabase.service';
import type { RequestActor } from '../src/common/auth.guard';

/**
 * Family Request Engine (§30-37) — service-level tests with faked
 * dependencies, same per-table response-queue approach as
 * care-network.test.ts. Added alongside the zelii-p0 §10 fix: create()
 * previously inserted `status: 'SENT'` directly, which the real
 * `requests_insert_as_requester` RLS policy (supabase/migrations/
 * 20260820000020_care_schedule_window_handoff_requests.sql) rejects —
 * it requires `status = 'DRAFT'` at insert, with SENT only reachable via
 * a follow-up UPDATE. This file existed nowhere before that fix, which
 * is exactly how the bug went unnoticed.
 */
function makeFakeSupabaseClient(responses: Record<string, Array<{ data: unknown; error: unknown }>>) {
  const counters: Record<string, number> = {};
  const inserted: Record<string, unknown[]> = {};
  const updated: Record<string, unknown[]> = {};

  function resolveFor(table: string) {
    const queue = responses[table] ?? [];
    const idx = counters[table] ?? 0;
    counters[table] = idx + 1;
    return queue[idx] ?? queue[queue.length - 1] ?? { data: null, error: null };
  }

  function from(table: string) {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order']) {
      builder[method] = () => builder;
    }
    builder['insert'] = (row: unknown) => {
      inserted[table] = inserted[table] ?? [];
      inserted[table].push(row);
      return builder;
    };
    builder['update'] = (patch: unknown) => {
      updated[table] = updated[table] ?? [];
      updated[table].push(patch);
      return builder;
    };
    builder['then'] = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolveFor(table)).then(onFulfilled);
    builder['single'] = async () => resolveFor(table);
    builder['maybeSingle'] = async () => resolveFor(table);
    return builder;
  }

  return { client: { from }, inserted, updated };
}

const ANA: RequestActor = { authUserId: 'auth-ana', tenantId: 'tenant-1', personId: 'ana', bearerToken: 'token-ana' } as RequestActor;
const BRUNO: RequestActor = { authUserId: 'auth-bruno', tenantId: 'tenant-1', personId: 'bruno', bearerToken: 'token-bruno' } as RequestActor;

function makeService(responses: Record<string, Array<{ data: unknown; error: unknown }>>, auditRecord = vi.fn().mockResolvedValue(undefined)) {
  const { client, inserted, updated } = makeFakeSupabaseClient(responses);
  const service = new RequestsService({ forUser: () => client } as unknown as SupabaseService, { record: auditRecord } as unknown as AuditService);
  return { service, inserted, updated, auditRecord };
}

describe('RequestsService.create — DRAFT->SENT (zelii-p0 §10 fix)', () => {
  it('inserts as DRAFT first, never SENT directly', async () => {
    const draftRow = { id: 'req-1', status: 'DRAFT', requested_to_person_id: 'bruno', subject_person_id: 'pedro' };
    const sentRow = { ...draftRow, status: 'SENT' };
    const { service, inserted } = makeService({
      requests: [
        { data: draftRow, error: null }, // insert().select().single()
        { data: sentRow, error: null }, // update({status:'SENT'}).eq().select().single()
      ],
    });

    const result = await service.create(ANA, { type: 'PICKUP_REQUEST', requestedToPersonId: 'bruno', subjectPersonId: 'pedro' });

    expect((inserted.requests[0] as Record<string, unknown>).status).toBe('DRAFT');
    expect(result.status).toBe('SENT');
  });

  it('logs both CREATED and SENT actions', async () => {
    const draftRow = { id: 'req-2', status: 'DRAFT', requested_to_person_id: 'bruno' };
    const { service, inserted } = makeService({
      requests: [{ data: draftRow, error: null }, { data: { ...draftRow, status: 'SENT' }, error: null }],
    });

    await service.create(ANA, { type: 'INFORMATION_REQUEST', requestedToPersonId: 'bruno' });

    const actions = (inserted.request_actions ?? []) as Array<Record<string, unknown>>;
    expect(actions.map((a) => a.action_type)).toEqual(['CREATED', 'SENT']);
  });

  it('rejects a request targeted at the actor themselves without touching the DB', async () => {
    const { service, inserted } = makeService({});

    await expect(service.create(ANA, { type: 'OTHER', requestedToPersonId: 'ana' })).rejects.toThrow();
    expect(inserted.requests ?? []).toHaveLength(0);
  });
});

describe('RequestsService.accept', () => {
  const baseRequest = {
    id: 'req-3',
    status: 'SENT',
    type: 'RESPONSIBILITY_TRANSFER',
    requested_by_person_id: 'ana',
    requested_to_person_id: 'bruno',
    subject_person_id: 'pedro',
    related_resource_type: 'calendar_events',
    related_resource_id: 'event-1',
  };

  it('only the recipient may accept', async () => {
    const { service } = makeService({ requests: [{ data: baseRequest, error: null }] });
    await expect(service.accept(ANA, 'req-3')).rejects.toThrow(/Somente o destinatário/);
  });

  it('surfaces a clear error instead of silently no-oping when the RLS-gated effect update matches no row (zelii-p0 §10 fix)', async () => {
    const { service } = makeService({
      requests: [{ data: baseRequest, error: null }],
      // calendar_events update().eq().select('id').maybeSingle() -> no row visible/editable per RLS
      calendar_events: [{ data: null, error: null }],
    });

    await expect(service.accept(BRUNO, 'req-3')).rejects.toThrow(/permissão/);
  });

  it('applies the effect and transitions to ACCEPTED when the effect update succeeds', async () => {
    const { service, updated } = makeService({
      requests: [
        { data: baseRequest, error: null }, // loadRequestOrThrow
        { data: { ...baseRequest, status: 'ACCEPTED' }, error: null }, // final status update
      ],
      calendar_events: [{ data: { id: 'event-1' }, error: null }],
    });

    const result = await service.accept(BRUNO, 'req-3', 'ok');

    expect(result.status).toBe('ACCEPTED');
    const calendarUpdate = (updated.calendar_events?.[0] ?? {}) as Record<string, unknown>;
    expect(calendarUpdate.responsible_person_id).toBe('bruno');
  });
});
