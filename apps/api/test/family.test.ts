import { describe, expect, it } from 'vitest';
import { FamilyService } from '../src/modules/family/family.service';
import type { SupabaseService } from '../src/common/supabase.service';
import type { PolicyService } from '../src/common/policy.service';
import type { RequestActor } from '../src/common/auth.guard';

/**
 * §5 of the redesign prompt: the Pessoas page needs each person's role
 * to power its filters (Dependentes/Responsáveis/Cuidadores/Profissionais)
 * — `GET /persons` didn't carry that before. Covers the additive `roles`
 * field this pass adds to `listPersonsInMyFamilies`, and confirms it
 * doesn't touch the existing per-row Policy Engine filtering.
 */
function makeFakeSupabaseClient(responses: Record<string, { data: unknown; error: unknown }>) {
  function from(table: string) {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'order']) {
      builder[method] = () => builder;
    }
    builder['then'] = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(responses[table] ?? { data: [], error: null }).then(onFulfilled);
    return builder;
  }
  return { from };
}

function makeActor(overrides: Partial<RequestActor> = {}): RequestActor {
  return {
    authUserId: 'auth-1',
    tenantId: 'tenant-1',
    personId: 'person-me',
    bearerToken: 'token-1',
    tenantMemberships: [],
    ...overrides,
  };
}

describe('FamilyService.listPersonsInMyFamilies', () => {
  it('attaches each policy-approved person their ACTIVE roles from family_memberships', async () => {
    const client = makeFakeSupabaseClient({
      persons: {
        data: [
          { id: 'person-child', display_name: 'Mariana', is_minor: true },
          { id: 'person-nanny', display_name: 'Joana', is_minor: false },
        ],
        error: null,
      },
      family_memberships: {
        data: [
          { person_id: 'person-child', role: 'CHILD' },
          { person_id: 'person-nanny', role: 'CAREGIVER' },
          { person_id: 'person-nanny', role: 'TEMPORARY_CAREGIVER' }, // a person can hold more than one active role
        ],
        error: null,
      },
    });
    const supabase = { forUser: () => client } as unknown as SupabaseService;
    const policy = { authorizeOrThrow: async () => undefined } as unknown as PolicyService;
    const service = new FamilyService(supabase, policy);

    const result = await service.listPersonsInMyFamilies(makeActor());

    expect(result).toEqual([
      { id: 'person-child', display_name: 'Mariana', is_minor: true, roles: ['CHILD'] },
      { id: 'person-nanny', display_name: 'Joana', is_minor: false, roles: ['CAREGIVER', 'TEMPORARY_CAREGIVER'] },
    ]);
  });

  it('excludes a person the Policy Engine denies VIEW/PROFILE for — unaffected by the roles addition', async () => {
    const client = makeFakeSupabaseClient({
      persons: {
        data: [
          { id: 'person-visible', display_name: 'Ana', is_minor: false },
          { id: 'person-hidden', display_name: 'Pedro (outra família)', is_minor: false },
        ],
        error: null,
      },
      family_memberships: { data: [{ person_id: 'person-visible', role: 'GUARDIAN' }], error: null },
    });
    const supabase = { forUser: () => client } as unknown as SupabaseService;
    const policy = {
      authorizeOrThrow: async (_actor: RequestActor, _action: string, _domain: string, subjectPersonId: string) => {
        if (subjectPersonId === 'person-hidden') throw new Error('DENY');
      },
    } as unknown as PolicyService;
    const service = new FamilyService(supabase, policy);

    const result = await service.listPersonsInMyFamilies(makeActor());

    expect(result).toEqual([{ id: 'person-visible', display_name: 'Ana', is_minor: false, roles: ['GUARDIAN'] }]);
  });

  it('returns an empty array without querying family_memberships when no person is policy-approved', async () => {
    let membershipsQueried = false;
    const client = makeFakeSupabaseClient({
      persons: { data: [{ id: 'person-hidden', display_name: 'Pedro', is_minor: false }], error: null },
    });
    const originalFrom = client.from.bind(client);
    client.from = (table: string) => {
      if (table === 'family_memberships') membershipsQueried = true;
      return originalFrom(table);
    };
    const supabase = { forUser: () => client } as unknown as SupabaseService;
    const policy = {
      authorizeOrThrow: async () => {
        throw new Error('DENY');
      },
    } as unknown as PolicyService;
    const service = new FamilyService(supabase, policy);

    const result = await service.listPersonsInMyFamilies(makeActor());

    expect(result).toEqual([]);
    expect(membershipsQueried).toBe(false);
  });

  it('gives a person with no ACTIVE membership row an empty roles array, not undefined', async () => {
    const client = makeFakeSupabaseClient({
      persons: { data: [{ id: 'person-solo', display_name: 'Sem vínculo ativo', is_minor: false }], error: null },
      family_memberships: { data: [], error: null },
    });
    const supabase = { forUser: () => client } as unknown as SupabaseService;
    const policy = { authorizeOrThrow: async () => undefined } as unknown as PolicyService;
    const service = new FamilyService(supabase, policy);

    const result = await service.listPersonsInMyFamilies(makeActor());

    expect(result).toEqual([{ id: 'person-solo', display_name: 'Sem vínculo ativo', is_minor: false, roles: [] }]);
  });
});
