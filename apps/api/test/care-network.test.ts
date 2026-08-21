import { describe, expect, it, vi } from 'vitest';
import { RESPONSIBILITY_PERMISSION_BUNDLES } from '@family-app/domain';
import { CareNetworkService } from '../src/modules/care-network/care-network.service';
import { PolicyDeniedError, type PolicyService } from '../src/common/policy.service';
import type { AuditService } from '../src/common/audit.service';
import type { SupabaseService } from '../src/common/supabase.service';
import type { RequestActor } from '../src/common/auth.guard';
import type { RequestsService } from '../src/modules/requests/requests.service';

/**
 * Extended Care Network (adendo) — service-level tests with faked
 * dependencies, same approach as wellbeing.emergency-audit.test.ts (no
 * live Supabase/PostgREST available in this environment for authenticated
 * HTTP-level integration tests; see gap-analysis-extended-care-network.md).
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
    for (const method of ['select', 'eq', 'order', 'or', 'update', 'upsert']) {
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
const JOANA_BABA: RequestActor = { authUserId: 'auth-joana', tenantId: 'tenant-1', personId: 'joana-baba', bearerToken: 'token-joana' };
const MARIA_AVO: RequestActor = { authUserId: 'auth-maria', tenantId: 'tenant-1', personId: 'maria-avo', bearerToken: 'token-maria' };

function makeService(opts: {
  responses: Record<string, Array<{ data: unknown; error: unknown }>>;
  authorizeOrThrow?: ReturnType<typeof vi.fn>;
  auditRecord?: ReturnType<typeof vi.fn>;
  requestsCreate?: ReturnType<typeof vi.fn>;
}) {
  const { client, inserted } = makeFakeSupabaseClient(opts.responses);
  const auditRecord = opts.auditRecord ?? vi.fn().mockResolvedValue(undefined);
  const authorizeOrThrow = opts.authorizeOrThrow ?? vi.fn().mockResolvedValue(undefined);
  const requestsCreate = opts.requestsCreate ?? vi.fn().mockResolvedValue({ id: 'request-1' });

  const service = new CareNetworkService(
    { forUser: () => client } as unknown as SupabaseService,
    { authorizeOrThrow } as unknown as PolicyService,
    { record: auditRecord } as unknown as AuditService,
    { create: requestsCreate } as unknown as RequestsService,
  );
  return { service, inserted, auditRecord, authorizeOrThrow, requestsCreate };
}

describe('CareNetworkService.create — delegation (adendo §10-12)', () => {
  it('denies a babá (CAREGIVER, can_delegate=false) trying to redelegate, and records RESPONSIBILITY_DELEGATION_DENIED', async () => {
    const parentAssignment = {
      id: 'parent-1',
      assigned_to_person_id: 'joana-baba',
      status: 'ACTIVE',
      subject_person_id: 'child-1',
      accountable_person_id: 'ana',
      source_type: 'MANUAL',
      source_id: null,
    };
    const { service, auditRecord, inserted } = makeService({
      responses: {
        responsibility_assignments: [
          { data: parentAssignment, error: null }, // loadAssignmentOrThrow
          { data: { source_type: 'MANUAL', source_id: null }, error: null }, // computeChainDepth
        ],
        delegation_policies: [{ data: null, error: null }], // no explicit override
        family_memberships: [{ data: [{ role: 'CAREGIVER' }], error: null }],
      },
    });

    await expect(
      service.create(JOANA_BABA, {
        subjectPersonId: 'child-1',
        responsibilityType: 'PICKUP',
        assignedToPersonId: 'maria-avo',
        startsAt: '2026-08-21T17:00:00Z',
        endsAt: '2026-08-21T18:00:00Z',
        sourceAssignmentId: 'parent-1',
      }),
    ).rejects.toThrow(/delegar/i);

    expect(auditRecord).toHaveBeenCalledWith(
      JOANA_BABA,
      expect.objectContaining({ eventType: 'RESPONSIBILITY_DELEGATION_DENIED', result: 'DENIED' }),
    );
    expect(inserted.responsibility_assignments ?? []).toHaveLength(0);
  });

  it('allows a GUARDIAN (can_delegate=true) to create the first delegation hop', async () => {
    const parentAssignment = {
      id: 'parent-1',
      assigned_to_person_id: 'ana',
      status: 'ACTIVE',
      subject_person_id: 'child-1',
      accountable_person_id: 'ana',
      source_type: 'MANUAL',
      source_id: null,
    };
    const newAssignment = { id: 'assignment-2', status: 'PROPOSED' };
    const { service, inserted } = makeService({
      responses: {
        responsibility_assignments: [
          { data: parentAssignment, error: null }, // loadAssignmentOrThrow
          { data: { source_type: 'MANUAL', source_id: null }, error: null }, // computeChainDepth
          { data: newAssignment, error: null }, // insert().select().single()
          { data: { ...newAssignment, status: 'SENT', request_id: 'request-1' }, error: null }, // final update
        ],
        delegation_policies: [{ data: null, error: null }],
        family_memberships: [{ data: [{ role: 'GUARDIAN' }], error: null }],
      },
    });

    const result = await service.create(ANA, {
      subjectPersonId: 'child-1',
      responsibilityType: 'PICKUP',
      assignedToPersonId: 'maria-avo',
      startsAt: '2026-08-21T17:00:00Z',
      endsAt: '2026-08-21T18:00:00Z',
      sourceAssignmentId: 'parent-1',
    });

    expect(result).toEqual(expect.objectContaining({ status: 'SENT' }));
    expect(inserted.responsibility_assignments).toHaveLength(1);
    expect((inserted.responsibility_assignments[0] as Record<string, unknown>).accountable_person_id).toBe('ana');
    expect((inserted.responsibility_assignments[0] as Record<string, unknown>).source_type).toBe('RESPONSIBILITY_ASSIGNMENT');
  });
});

describe('CareNetworkService.create — bundle within actor authority (adendo §8)', () => {
  it('rejects creating a MEDICAL_APPOINTMENT assignment when the actor has no HEALTH:VIEW authority themselves', async () => {
    const authorizeOrThrow = vi.fn().mockImplementation(async (_actor, action: string, domain: string) => {
      if (domain === 'HEALTH') throw new PolicyDeniedError('NO_MATCHING_GRANT_DENY');
      return undefined; // MANAGE/SCHEDULE and other bundle domains pass
    });
    const { service, inserted } = makeService({ responses: {}, authorizeOrThrow });

    await expect(
      service.create(JOANA_BABA, {
        subjectPersonId: 'child-1',
        responsibilityType: 'MEDICAL_APPOINTMENT',
        assignedToPersonId: 'maria-avo',
        startsAt: '2026-08-21T09:00:00Z',
        endsAt: '2026-08-21T11:00:00Z',
      }),
    ).rejects.toThrow(/não pode conceder/i);

    expect(inserted.responsibility_assignments ?? []).toHaveLength(0);
  });
});

describe('CareNetworkService.accept — permission bundle + CareWindow scoping (adendo §7-9)', () => {
  it('mints exactly the PICKUP bundle as scoped AuthorityGrants and creates NO CareWindow', async () => {
    const assignment = {
      id: 'assignment-1',
      assigned_to_person_id: 'maria-avo',
      status: 'SENT',
      subject_person_id: 'child-1',
      accountable_person_id: 'ana',
      responsibility_type: 'PICKUP',
      required_permissions: null,
      starts_at: '2026-08-21T17:00:00Z',
      ends_at: '2026-08-21T18:00:00Z',
    };
    const { service, inserted, auditRecord } = makeService({
      responses: {
        responsibility_assignments: [
          { data: assignment, error: null }, // loadAssignmentOrThrow
          { data: { ...assignment, status: 'ACTIVE' }, error: null }, // final update().select().single()
        ],
        authority_grants: [{ data: null, error: null }],
      },
    });

    const result = await service.accept(MARIA_AVO, 'assignment-1');

    expect(result).toEqual(expect.objectContaining({ status: 'ACTIVE' }));
    expect(inserted.authority_grants).toHaveLength(RESPONSIBILITY_PERMISSION_BUNDLES.PICKUP.length);
    for (const grant of inserted.authority_grants as Array<Record<string, unknown>>) {
      expect(grant.valid_from).toBe(assignment.starts_at);
      expect(grant.valid_until).toBe(assignment.ends_at);
      expect(grant.domain).not.toBe('HEALTH');
      expect(grant.domain).not.toBe('DOCUMENTS');
      expect(grant.domain).not.toBe('FINANCE');
    }
    expect(inserted.care_windows ?? []).toHaveLength(0);
    expect(auditRecord).toHaveBeenCalledWith(MARIA_AVO, expect.objectContaining({ eventType: 'RESPONSIBILITY_ASSIGNMENT_ACCEPTED' }));
    expect(auditRecord).toHaveBeenCalledWith(MARIA_AVO, expect.objectContaining({ eventType: 'RESPONSIBILITY_ASSIGNMENT_ACTIVATED' }));
  });

  it('also creates a CareWindow for OVERNIGHT_CARE (genuinely custodial type)', async () => {
    const assignment = {
      id: 'assignment-2',
      assigned_to_person_id: 'maria-avo',
      status: 'SENT',
      subject_person_id: 'child-1',
      accountable_person_id: 'ana',
      responsibility_type: 'OVERNIGHT_CARE',
      required_permissions: null,
      starts_at: '2026-08-22T20:00:00Z',
      ends_at: '2026-08-23T08:00:00Z',
    };
    const { service, inserted } = makeService({
      responses: {
        responsibility_assignments: [
          { data: assignment, error: null },
          { data: { ...assignment, status: 'ACTIVE' }, error: null },
        ],
        authority_grants: [{ data: null, error: null }],
        care_windows: [{ data: null, error: null }],
      },
    });

    await service.accept(MARIA_AVO, 'assignment-2');

    expect(inserted.care_windows).toHaveLength(1);
    const window = inserted.care_windows[0] as Record<string, unknown>;
    expect(window.child_person_id).toBe('child-1');
    expect(window.caregiver_person_id).toBe('maria-avo');
  });

  it('rejects acceptance by anyone other than the assigned person', async () => {
    const assignment = {
      id: 'assignment-3',
      assigned_to_person_id: 'maria-avo',
      status: 'SENT',
      subject_person_id: 'child-1',
      accountable_person_id: 'ana',
      responsibility_type: 'PICKUP',
      required_permissions: null,
      starts_at: '2026-08-21T17:00:00Z',
      ends_at: '2026-08-21T18:00:00Z',
    };
    const { service } = makeService({
      responses: { responsibility_assignments: [{ data: assignment, error: null }] },
    });

    await expect(service.accept(ANA, 'assignment-3')).rejects.toThrow(/somente a pessoa designada/i);
  });
});
