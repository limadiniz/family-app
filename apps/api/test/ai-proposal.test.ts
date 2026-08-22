import { describe, expect, it, vi } from 'vitest';
import { AiProposalService } from '../src/modules/ai/ai-proposal.service';
import type { RequestActor } from '../src/common/auth.guard';

const ANA: RequestActor = {
  authUserId: 'auth-ana',
  tenantId: '00000000-0000-4000-8000-000000000001',
  personId: '00000000-0000-4000-8000-000000000002',
  bearerToken: 'token-ana',
};
const PEDRO = '00000000-0000-4000-8000-000000000003';

function fakeClient(responses: Array<{ data: unknown; error: unknown }>) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let index = 0;
  const from = vi.fn(() => {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'insert', 'update', 'eq', 'is', 'order']) {
      builder[method] = (...args: unknown[]) => {
        calls.push({ method, args });
        return builder;
      };
    }
    const next = () => responses[index++] ?? { data: null, error: null };
    builder['maybeSingle'] = async () => next();
    builder['single'] = async () => next();
    builder['then'] = (resolve: (value: unknown) => unknown) => Promise.resolve(next()).then(resolve);
    return builder;
  });
  return { client: { from }, calls };
}

function makeService(responses: Array<{ data: unknown; error: unknown }>) {
  const { client, calls } = fakeClient(responses);
  const authorizeOrThrow = vi.fn().mockResolvedValue(undefined);
  const audit = vi.fn().mockResolvedValue(undefined);
  const commandCenter = { createTask: vi.fn(), createCalendarEvent: vi.fn() };
  const requests = { create: vi.fn() };
  const careNetwork = { create: vi.fn() };
  const service = new AiProposalService(
    { forUser: () => client } as never,
    { authorizeOrThrow } as never,
    { record: audit } as never,
    commandCenter as never,
    requests as never,
    careNetwork as never,
  );
  return { service, calls, authorizeOrThrow, commandCenter, requests, careNetwork };
}

describe('AiProposalService — governed proposal lifecycle', () => {
  it('derives authorization server-side and prepares without executing a domain action', async () => {
    const proposal = {
      id: 'proposal-1',
      proposal_type: 'PROPOSE_TASK',
      status: 'READY_FOR_REVIEW',
      version: 1,
    };
    const { service, calls, authorizeOrThrow, commandCenter } = makeService([
      { data: null, error: null },
      { data: proposal, error: null },
    ]);

    const result = await service.create(ANA, {
      type: 'PROPOSE_TASK',
      subjectPersonIds: [PEDRO],
      proposedData: { subjectPersonId: PEDRO, title: 'Separar carteirinha' },
      factIds: ['documents:doc-1'],
      uncertainFields: [],
      expectedEffects: ['Criar uma tarefa revisável'],
      informationToShare: [],
      idempotencyKey: 'proposal-task-pedro-1',
    });

    expect(result).toEqual(proposal);
    expect(authorizeOrThrow).toHaveBeenCalledWith(ANA, 'CREATE', 'AI', PEDRO, expect.any(Object));
    expect(authorizeOrThrow).toHaveBeenCalledWith(ANA, 'CREATE', 'SCHEDULE', PEDRO, expect.any(Object));
    expect(calls.find((call) => call.method === 'insert')?.args[0]).toEqual(
      expect.objectContaining({ required_authorization: [{ domain: 'SCHEDULE', action: 'CREATE' }] }),
    );
    expect(commandCenter.createTask).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation before changing proposal state', async () => {
    const { service } = makeService([]);
    await expect(service.confirm(ANA, 'proposal-1', 1, false)).rejects.toThrow(/confirmação explícita/i);
  });

  it('revalidates authorization and uses optimistic versioning on confirmation', async () => {
    const ready = {
      id: 'proposal-1',
      proposal_type: 'PROPOSE_TASK',
      subject_person_ids: [PEDRO],
      required_authorization: [{ domain: 'SCHEDULE', action: 'CREATE' }],
      information_to_share: [],
      status: 'READY_FOR_REVIEW',
      version: 1,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    const confirmed = { ...ready, status: 'CONFIRMED', version: 2 };
    const { service, authorizeOrThrow, calls } = makeService([
      { data: ready, error: null },
      { data: confirmed, error: null },
    ]);

    const result = await service.confirm(ANA, 'proposal-1', 1, true);
    expect(result.status).toBe('CONFIRMED');
    expect(authorizeOrThrow).toHaveBeenCalledWith(ANA, 'EDIT', 'AI', PEDRO, expect.any(Object));
    expect(authorizeOrThrow).toHaveBeenCalledWith(ANA, 'CREATE', 'SCHEDULE', PEDRO, expect.any(Object));
    expect(calls.filter((call) => call.method === 'eq').some((call) => call.args[0] === 'version' && call.args[1] === 1)).toBe(true);
  });

  it('does not execute twice when the atomic execution claim fails', async () => {
    const confirmed = {
      id: 'proposal-1',
      proposal_type: 'PROPOSE_TASK',
      proposed_data: { subjectPersonId: PEDRO, title: 'Separar documento' },
      subject_person_ids: [PEDRO],
      required_authorization: [{ domain: 'SCHEDULE', action: 'CREATE' }],
      information_to_share: [],
      status: 'CONFIRMED',
      version: 2,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    const { service, commandCenter } = makeService([
      { data: confirmed, error: null },
      { data: null, error: null },
    ]);

    await expect(service.execute(ANA, 'proposal-1', 2, true)).rejects.toThrow(/já foi iniciada|mudou/i);
    expect(commandCenter.createTask).not.toHaveBeenCalled();
  });
});
