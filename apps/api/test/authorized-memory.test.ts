import { describe, expect, it, vi } from 'vitest';
import { AuthorizedMemoryService } from '../src/modules/ai/authorized-memory.service';
import type { RequestActor } from '../src/common/auth.guard';

const ACTOR: RequestActor = {
  authUserId: 'auth-ana',
  tenantId: '00000000-0000-4000-8000-000000000001',
  personId: '00000000-0000-4000-8000-000000000002',
  bearerToken: 'token',
};

function fakeClient() {
  const updates: unknown[] = [];
  let terminal = 0;
  const responses = [
    { data: { id: 'old-memory', subject_person_id: '00000000-0000-4000-8000-000000000003', domain: 'SCHEDULE', summary: 'Antiga', revoked_at: null }, error: null },
    { data: null, error: null },
  ];
  return {
    updates,
    client: {
      from: () => {
        const builder: Record<string, unknown> = {};
        for (const method of ['select', 'eq', 'is']) builder[method] = () => builder;
        builder['update'] = (value: unknown) => { updates.push(value); return builder; };
        builder['maybeSingle'] = async () => responses[terminal++];
        builder['then'] = (resolve: (value: unknown) => unknown) => Promise.resolve(responses[terminal++]).then(resolve);
        return builder;
      },
    },
  };
}

describe('AuthorizedMemoryService — correction and supersession', () => {
  it('creates a confirmed replacement and explicitly supersedes the previous item', async () => {
    const { client, updates } = fakeClient();
    const createMemory = vi.fn().mockResolvedValue({ id: 'new-memory' });
    const authorizeOrThrow = vi.fn().mockResolvedValue(undefined);
    const service = new AuthorizedMemoryService(
      { forUser: () => client } as never,
      { authorizeOrThrow } as never,
      { record: vi.fn().mockResolvedValue(undefined) } as never,
      { createMemory } as never,
    );

    await service.correct(ACTOR, 'old-memory', {
      summary: 'Informação corrigida.',
      normalizedContent: { confirmed: true },
      confirmed: true,
    });

    expect(createMemory).toHaveBeenCalledWith(ACTOR, expect.objectContaining({
      memoryType: 'CORRECTION',
      sourceRefs: [{ type: 'ai_memory_items', id: 'old-memory' }],
      confirmed: true,
    }));
    expect(updates).toContainEqual(expect.objectContaining({ superseded_by_id: 'new-memory', revoked_at: expect.any(String) }));
    expect(authorizeOrThrow).toHaveBeenCalledTimes(2);
  });
});
