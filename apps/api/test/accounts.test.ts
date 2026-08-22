import { describe, expect, it, vi } from 'vitest';
import { AccountsService } from '../src/modules/accounts/accounts.service';
import type { SupabaseService } from '../src/common/supabase.service';
import type { AuditService } from '../src/common/audit.service';
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
    const service = new AccountsService(
      { forUser: () => client } as unknown as SupabaseService,
      { record: vi.fn() } as unknown as AuditService,
    );
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
    const service = new AccountsService(
      { forUser: () => client } as unknown as SupabaseService,
      { record: vi.fn() } as unknown as AuditService,
    );
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

  it('updates only the authenticated person in the selected tenant and audits the change', async () => {
    const eq = vi.fn();
    const update = vi.fn();
    const builder: Record<string, unknown> = {};
    update.mockImplementation(() => builder);
    eq.mockImplementation(() => builder);
    builder['update'] = update;
    builder['eq'] = eq;
    builder['select'] = () => builder;
    builder['maybeSingle'] = async () => ({ data: { id: 'person-1', display_name: 'Luana Diniz' }, error: null });
    const record = vi.fn().mockResolvedValue(undefined);
    const service = new AccountsService(
      { forUser: () => ({ from: () => builder }) } as unknown as SupabaseService,
      { record } as unknown as AuditService,
    );
    const actor: RequestActor = {
      authUserId: 'auth-luana',
      email: 'luana@example.com',
      tenantId: 'tenant-1',
      personId: 'person-1',
      bearerToken: 'token-luana',
      tenantMemberships: [{ tenantId: 'tenant-1', personId: 'person-1' }],
    };

    const result = await service.updateMyProfile(actor, { displayName: '  Luana Diniz  ' });

    expect(update).toHaveBeenCalledWith({ display_name: 'Luana Diniz' });
    expect(eq).toHaveBeenCalledWith('id', 'person-1');
    expect(eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    expect(result).toEqual({ id: 'person-1', displayName: 'Luana Diniz', email: 'luana@example.com' });
    expect(record).toHaveBeenCalledWith(actor, expect.objectContaining({
      eventType: 'PROFILE_UPDATED',
      subjectPersonId: 'person-1',
      resourceId: 'person-1',
    }));
  });

  it('rejects an invalid display name before touching the database', async () => {
    const forUser = vi.fn();
    const service = new AccountsService(
      { forUser } as unknown as SupabaseService,
      { record: vi.fn() } as unknown as AuditService,
    );
    const actor: RequestActor = {
      authUserId: 'auth-luana',
      tenantId: 'tenant-1',
      personId: 'person-1',
      bearerToken: 'token-luana',
      tenantMemberships: [{ tenantId: 'tenant-1', personId: 'person-1' }],
    };

    await expect(service.updateMyProfile(actor, { displayName: 'L' })).rejects.toThrow(/2 e 150/i);
    expect(forUser).not.toHaveBeenCalled();
  });
});
