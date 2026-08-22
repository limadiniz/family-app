import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiService } from '../src/modules/ai/ai.service';
import type { PolicyService } from '../src/common/policy.service';
import type { AuditService } from '../src/common/audit.service';
import type { SupabaseService } from '../src/common/supabase.service';
import type { RequestActor } from '../src/common/auth.guard';

/**
 * Context Engine + Family Copilot wiring (V3 §57-63). Fakes the same way
 * as the other service tests — table-name-keyed response queues — plus a
 * real `PolicyService.loadPolicyEngineInput` stub shaped to ALLOW
 * (FAMILY_OWNER role default) so `AiGateway`'s own internal
 * `FamilyPolicyEngine.authorize()` call is exercised for real, not mocked
 * away — the whole point of this module is that retrieval can't happen
 * without that call returning ALLOW first.
 */
function makeFakeSupabaseClient(responses: Record<string, { data: unknown; error: unknown } | Array<{ data: unknown; error: unknown }>>) {
  const counters: Record<string, number> = {};
  const queryCalls: Array<{ table: string; method: string; args: unknown[] }> = [];
  function resolveFor(table: string) {
    const entry = responses[table];
    if (!entry) return { data: [], error: null };
    if (!Array.isArray(entry)) return entry;
    const idx = counters[table] ?? 0;
    counters[table] = idx + 1;
    return entry[idx] ?? entry[entry.length - 1];
  }
  function from(table: string) {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'is', 'order', 'gte', 'lte', 'limit', 'insert', 'update']) {
      builder[method] = (...args: unknown[]) => {
        queryCalls.push({ table, method, args });
        return builder;
      };
    }
    builder['then'] = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolveFor(table)).then(onFulfilled);
    builder['maybeSingle'] = async () => resolveFor(table);
    builder['single'] = async () => resolveFor(table);
    return builder;
  }
  return { client: { from }, queryCalls };
}

const ANA: RequestActor = { authUserId: 'auth-ana', tenantId: 'tenant-1', personId: 'ana', bearerToken: 'token-ana' };

const ALLOW_ALL_POLICY_INPUT = {
  sharedFamilyRoles: ['FAMILY_OWNER'] as never,
  activeAuthorityGrants: [] as never,
  hasActiveCareWindow: false,
  subjectIsMinor: true,
};

function makeService(opts: {
  responses: Record<string, { data: unknown; error: unknown } | Array<{ data: unknown; error: unknown }>>;
  aiEnabled?: boolean;
  auditRecord?: ReturnType<typeof vi.fn>;
  loadPolicyEngineInput?: ReturnType<typeof vi.fn>;
  authorizeOrThrow?: ReturnType<typeof vi.fn>;
}) {
  const { client, queryCalls } = makeFakeSupabaseClient(opts.responses);
  const auditRecord = opts.auditRecord ?? vi.fn().mockResolvedValue(undefined);
  const loadPolicyEngineInput = opts.loadPolicyEngineInput ?? vi.fn().mockResolvedValue(ALLOW_ALL_POLICY_INPUT);
  const authorizeOrThrow = opts.authorizeOrThrow ?? vi.fn().mockResolvedValue(undefined);

  process.env.AI_ENABLED = String(opts.aiEnabled ?? true);

  const service = new AiService(
    { forUser: () => client } as unknown as SupabaseService,
    { loadPolicyEngineInput, authorizeOrThrow } as unknown as PolicyService,
    { record: auditRecord } as unknown as AuditService,
  );
  return { service, auditRecord, loadPolicyEngineInput, authorizeOrThrow, queryCalls };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AI_ENABLED;
  delete process.env.AI_PROVIDER_API_KEY;
  delete process.env.AI_MODEL;
});

describe('AiService.ask — disabled', () => {
  it('returns the honest "not enabled" answer and never touches the database when AI_ENABLED=false', async () => {
    const { service, loadPolicyEngineInput } = makeService({ responses: {}, aiEnabled: false });
    const answer = await service.ask(ANA, 'O que tenho amanhã?', ['pedro']);
    expect(answer.text).toContain('não está habilitado');
    expect(loadPolicyEngineInput).not.toHaveBeenCalled();
  });
});

describe('AiService.ask — enabled, no provider key configured (deterministic fallback)', () => {
  it('retrieves real SCHEDULE facts and returns a deterministic summary', async () => {
    const { service, auditRecord } = makeService({
      aiEnabled: true,
      responses: {
        calendar_events: {
          data: [{ id: 'e1', title: 'Pediatra', starts_at: '2026-08-21T10:00:00Z', category: 'HEALTH' }],
          error: null,
        },
      },
    });

    const answer = await service.ask(ANA, 'O que tenho amanhã?', ['pedro']);
    expect(answer.text).toContain('Pediatra');
    expect(answer.facts).toHaveLength(1);
    expect(auditRecord).toHaveBeenCalledWith(ANA, expect.objectContaining({ eventType: 'AI_QUERY', result: 'SUCCESS' }));
    // The raw question must never be persisted into the audit trail (§76).
    const [, event] = auditRecord.mock.calls[0] as [RequestActor, { context?: Record<string, unknown> }];
    expect(JSON.stringify(event.context)).not.toContain('amanhã');
  });

  it('adds valid, confirmed memory to the authorized context', async () => {
    const { service } = makeService({
      aiEnabled: true,
      responses: {
        calendar_events: { data: [], error: null },
        ai_memory_items: {
          data: [
            {
              id: 'memory-1',
              summary: 'Pedro precisa levar o inalador nas atividades esportivas.',
              valid_until: null,
              last_verified_at: '2026-08-20T10:00:00Z',
            },
          ],
          error: null,
        },
      },
    });

    const answer = await service.ask(ANA, 'O que preciso lembrar para a atividade?', ['pedro']);
    expect(answer.text).toContain('Memória confirmada');
    expect(answer.text).toContain('inalador');
    expect(answer.facts.some((fact) => fact.source.type === 'ai_memory_items')).toBe(true);
  });

  it('returns "não encontrei" when no facts were retrieved for any resolved domain', async () => {
    const { service } = makeService({
      aiEnabled: true,
      responses: { calendar_events: { data: [], error: null } },
    });
    const answer = await service.ask(ANA, 'O que tenho amanhã?', ['pedro']);
    expect(answer.text).toContain('Não encontrei');
  });
});

describe('AiService — authorized persistent memory', () => {
  it('queries non-revoked memories with IS NULL instead of casting the string "null" as a timestamp', async () => {
    const { service, queryCalls } = makeService({ responses: { ai_memory_items: { data: [], error: null } } });

    await service.listMemory(ANA, 'pedro');

    expect(queryCalls).toContainEqual({ table: 'ai_memory_items', method: 'is', args: ['revoked_at', null] });
    expect(queryCalls).not.toContainEqual({ table: 'ai_memory_items', method: 'eq', args: ['revoked_at', null] });
  });

  it('creates memory only after explicit confirmation and audits without the summary', async () => {
    const auditRecord = vi.fn().mockResolvedValue(undefined);
    const authorizeOrThrow = vi.fn().mockResolvedValue(undefined);
    const { service } = makeService({
      responses: {
        ai_memory_items: {
          data: {
            id: 'memory-1',
            subject_person_id: 'pedro',
            domain: 'SCHEDULE',
            summary: 'Evitar compromissos nas manhãs de sexta-feira.',
          },
          error: null,
        },
      },
      auditRecord,
      authorizeOrThrow,
    });

    const created = await service.createMemory(ANA, {
      subjectPersonId: 'pedro',
      domain: 'SCHEDULE',
      memoryType: 'CONSTRAINT',
      summary: 'Evitar compromissos nas manhãs de sexta-feira.',
      sourceRefs: [{ type: 'user_confirmation' }],
      confirmed: true,
    });

    expect(created.id).toBe('memory-1');
    expect(authorizeOrThrow).toHaveBeenCalledTimes(2);
    expect(auditRecord).toHaveBeenCalledWith(
      ANA,
      expect.objectContaining({ eventType: 'AI_ACTION', context: expect.objectContaining({ action: 'MEMORY_CONFIRMED' }) }),
    );
    expect(JSON.stringify(auditRecord.mock.calls[0])).not.toContain('sexta-feira');
  });

  it('rejects an attempt to persist memory without explicit confirmation', async () => {
    const { service, authorizeOrThrow } = makeService({ responses: {} });
    await expect(
      service.createMemory(ANA, {
        subjectPersonId: 'pedro',
        domain: 'SCHEDULE',
        memoryType: 'CONTEXT',
        summary: 'Texto que não foi confirmado.',
        sourceRefs: [],
        confirmed: false,
      } as never),
    ).rejects.toThrow();
    expect(authorizeOrThrow).not.toHaveBeenCalled();
  });
});

describe('AiService.ask — enabled, provider configured', () => {
  it('calls the Anthropic Messages API and returns its text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'Você tem consulta com o pediatra amanhã às 10h.' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    process.env.AI_PROVIDER_API_KEY = 'sk-test';
    process.env.AI_MODEL = 'claude-test';

    const { service } = makeService({
      aiEnabled: true,
      responses: { calendar_events: { data: [{ id: 'e1', title: 'Pediatra', starts_at: '2026-08-21T10:00:00Z', category: 'HEALTH' }], error: null } },
    });

    const answer = await service.ask(ANA, 'O que tenho amanhã?', ['pedro']);
    expect(fetchMock).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', expect.objectContaining({ method: 'POST' }));
    expect(answer.text).toBe('Você tem consulta com o pediatra amanhã às 10h.');
  });

  it('degrades to the deterministic summary when the provider call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    process.env.AI_PROVIDER_API_KEY = 'sk-test';
    process.env.AI_MODEL = 'claude-test';

    const { service } = makeService({
      aiEnabled: true,
      responses: { calendar_events: { data: [{ id: 'e1', title: 'Pediatra', starts_at: '2026-08-21T10:00:00Z', category: 'HEALTH' }], error: null } },
    });

    const answer = await service.ask(ANA, 'O que tenho amanhã?', ['pedro']);
    expect(answer.text).toContain('Pediatra'); // deterministic fallback, not a thrown error
  });
});

describe('AiService.ask — Action Layer (§60)', () => {
  it('suggests a PROPOSE_RESPONSIBILITY_ASSIGNMENT action for a "quem pode buscar" question with facts available', async () => {
    const { service } = makeService({
      aiEnabled: true,
      responses: { calendar_events: { data: [{ id: 'e1', title: 'Pediatra', starts_at: '2026-08-21T10:00:00Z', category: 'HEALTH' }], error: null } },
    });
    const answer = await service.ask(ANA, 'Quem pode buscar o Pedro na escola?', ['pedro']);
    expect(answer.suggestedAction).toEqual(
      expect.objectContaining({ type: 'PROPOSE_RESPONSIBILITY_ASSIGNMENT', payload: expect.objectContaining({ subjectPersonId: 'pedro' }) }),
    );
  });

  it('does not suggest an action for an unrelated question', async () => {
    const { service } = makeService({
      aiEnabled: true,
      responses: { calendar_events: { data: [{ id: 'e1', title: 'Pediatra', starts_at: '2026-08-21T10:00:00Z', category: 'HEALTH' }], error: null } },
    });
    const answer = await service.ask(ANA, 'O que tenho amanhã?', ['pedro']);
    expect(answer.suggestedAction).toBeUndefined();
  });
});
