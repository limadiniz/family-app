import { describe, expect, it, vi } from 'vitest';
import { CareBriefService } from '../src/modules/care-brief/care-brief.service';
import { PolicyDeniedError, type PolicyService } from '../src/common/policy.service';
import type { AuditService } from '../src/common/audit.service';
import type { SupabaseService } from '../src/common/supabase.service';
import type { RequestActor } from '../src/common/auth.guard';

/**
 * Handoff Brief + Care Brief (V3 §33-34) — same faked-dependency approach
 * as care-network.test.ts/care-schedule.test.ts.
 */
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
    for (const method of ['select', 'eq', 'neq', 'order', 'or', 'in', 'gte', 'lte', 'limit']) {
      builder[method] = () => builder;
    }
    builder['then'] = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolveFor(table)).then(onFulfilled);
    builder['single'] = async () => resolveFor(table);
    builder['maybeSingle'] = async () => resolveFor(table);
    return builder;
  }

  return { client: { from } };
}

const MARIA: RequestActor = { authUserId: 'auth-maria', tenantId: 'tenant-1', personId: 'maria-avo', bearerToken: 'token-maria' };

function makeService(opts: {
  responses: Record<string, Array<{ data: unknown; error: unknown }>>;
  authorizeOrThrow?: ReturnType<typeof vi.fn>;
  auditRecord?: ReturnType<typeof vi.fn>;
}) {
  const { client } = makeFakeSupabaseClient(opts.responses);
  const auditRecord = opts.auditRecord ?? vi.fn().mockResolvedValue(undefined);
  const authorizeOrThrow = opts.authorizeOrThrow ?? vi.fn().mockResolvedValue(undefined);

  const service = new CareBriefService(
    { forUser: () => client } as unknown as SupabaseService,
    { authorizeOrThrow } as unknown as PolicyService,
    { record: auditRecord } as unknown as AuditService,
  );
  return { service, auditRecord, authorizeOrThrow };
}

describe('CareBriefService.getCareBrief', () => {
  it('omits a section (instead of throwing) when the actor lacks that domain, but still returns the rest', async () => {
    const authorizeOrThrow = vi.fn().mockImplementation(async (_actor, _action, domain: string) => {
      if (domain === 'MEDICATION') throw new PolicyDeniedError('NO_MEDICATION_ACCESS');
      // SCHEDULE, EMERGENCY, CONTACTS all allowed for this test.
    });
    const { service } = makeService({
      responses: {
        calendar_events: [{ data: [{ starts_at: '2026-08-20T10:00:00.000Z', title: 'Futebol', transportation_person_id: null }], error: null }],
        emergency_profiles: [{ data: { allergies: ['amendoim'], conditions: [] }, error: null }],
        family_memberships: [
          { data: [{ family_unit_id: 'fu-1' }], error: null },
          { data: [{ person_id: 'ana', role: 'GUARDIAN', persons: { display_name: 'Ana' } }], error: null },
        ],
      },
      authorizeOrThrow,
    });

    const brief = await service.getCareBrief(MARIA, 'pedro', '2026-08-20');

    const medicationSection = brief.sections.find((s) => s.title === 'SAÚDE')!;
    expect(medicationSection.omittedForPermissions).toBe(true);
    expect(medicationSection.items).toEqual([]);

    const agendaSection = brief.sections.find((s) => s.title === 'AGENDA')!;
    expect(agendaSection.omittedForPermissions).toBe(false);
    expect(agendaSection.items).toHaveLength(1);
    expect(agendaSection.items[0].label).toContain('Futebol');

    const attentionSection = brief.sections.find((s) => s.title === 'ATENÇÃO')!;
    expect(attentionSection.items[0]).toEqual({ label: 'Alergia registrada: amendoim', status: 'ATTENTION' });

    const contactsSection = brief.sections.find((s) => s.title === 'CONTATOS')!;
    expect(contactsSection.items[0].label).toBe('Ana');
  });

  it('records a CARE_BRIEF_VIEWED audit event', async () => {
    const { service, auditRecord } = makeService({
      responses: {
        calendar_events: [{ data: [], error: null }],
        emergency_profiles: [{ data: null, error: null }],
        family_memberships: [{ data: [], error: null }],
        medications: [{ data: [], error: null }],
      },
    });
    await service.getCareBrief(MARIA, 'pedro', '2026-08-20');
    expect(auditRecord).toHaveBeenCalledWith(
      MARIA,
      expect.objectContaining({ eventType: 'CARE_BRIEF_VIEWED', subjectPersonId: 'pedro' }),
    );
  });
});

describe('CareBriefService.getHandoffBrief', () => {
  it('flags an expected-but-unregistered dose as ATTENTION', async () => {
    const { service } = makeService({
      responses: {
        handoffs: [{ data: { id: 'h1', child_person_id: 'pedro', scheduled_at: '2026-08-20T18:00:00.000Z' }, error: null }],
        medications: [
          {
            data: [{ id: 'med-1', name: 'Amoxicilina', medication_schedules: [{ rrule: 'FREQ=DAILY', start_date: '2026-08-01', end_date: null }] }],
            error: null,
          },
        ],
        medication_administrations: [{ data: [], error: null }],
        tasks: [{ data: [], error: null }],
        calendar_events: [{ data: [], error: null }],
      },
    });

    const brief = await service.getHandoffBrief(MARIA, 'h1');
    const medsSection = brief.sections.find((s) => s.title === 'MEDICAMENTOS')!;
    expect(medsSection.items).toEqual([{ label: 'Amoxicilina: dose prevista hoje, nada registrado ainda', status: 'ATTENTION' }]);
  });

  it('throws NotFoundException for a nonexistent handoff', async () => {
    const { service } = makeService({ responses: { handoffs: [{ data: null, error: null }] } });
    await expect(service.getHandoffBrief(MARIA, 'missing')).rejects.toThrow(/não encontrado/);
  });
});
