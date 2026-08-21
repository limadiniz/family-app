import { describe, expect, it } from 'vitest';
import { AccountsService } from '../src/modules/accounts/accounts.service';
import type { SupabaseService } from '../src/common/supabase.service';
import type { RequestActor } from '../src/common/auth.guard';

/**
 * Multi-família (§10/§68). listMyTenants é a única peça de backend nova
 * do seletor multi-família — cobre o caso que motivou a mudança: uma
 * conta com 2+ memberships e `tenantId` ainda não resolvido (null).
 */
function makeFakeSupabaseClient(responses: Record<string, { data: unknown; error: unknown }>) {
  function from(table: string) {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'in']) {
      builder[method] = () => builder;
    }
    builder['then'] = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(responses[table] ?? { data: [], error: null }).then(onFulfilled);
    return builder;
  }
  return { client: { from } };
}

describe('AccountsService.listMyTenants', () => {
  it('returns an empty list without querying anything for a brand-new account (no memberships yet)', async () => {
    const { client } = makeFakeSupabaseClient({});
    const service = new AccountsService({ forUser: () => client } as unknown as SupabaseService);
    const actor: RequestActor = {
      authUserId: 'auth-x',
      tenantId: null,
      personId: null,
      bearerToken: 'token-x',
      tenantMemberships: [],
    };

    const result = await service.listMyTenants(actor);
    expect(result).toEqual({ currentTenantId: null, memberships: [] });
  });

  it('resolves tenant/person names for every ACTIVE membership, even when currentTenantId is still ambiguous (null)', async () => {
    const { client } = makeFakeSupabaseClient({
      tenants: {
        data: [
          { id: 'tenant-a', name: 'Família Silva' },
          { id: 'tenant-b', name: 'Família Costa' },
        ],
        error: null,
      },
      persons: {
        data: [
          { id: 'person-ana-a', display_name: 'Ana' },
          { id: 'person-ana-b', display_name: 'Ana (cuidadora)' },
        ],
        error: null,
      },
    });
    const service = new AccountsService({ forUser: () => client } as unknown as SupabaseService);
    const actor: RequestActor = {
      authUserId: 'auth-ana',
      tenantId: null, // AuthGuard não escolheu — 2+ memberships e nenhum x-tenant-id enviado
      personId: null,
      bearerToken: 'token-ana',
      tenantMemberships: [
        { tenantId: 'tenant-a', personId: 'person-ana-a' },
        { tenantId: 'tenant-b', personId: 'person-ana-b' },
      ],
    };

    const result = await service.listMyTenants(actor);
    expect(result.currentTenantId).toBeNull();
    expect(result.memberships).toEqual([
      { tenantId: 'tenant-a', personId: 'person-ana-a', tenantName: 'Família Silva', personDisplayName: 'Ana' },
      { tenantId: 'tenant-b', personId: 'person-ana-b', tenantName: 'Família Costa', personDisplayName: 'Ana (cuidadora)' },
    ]);
  });
});
