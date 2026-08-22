import { describe, expect, it, vi } from 'vitest';
import { InvitationsService } from '../src/modules/invitations/invitations.service';
import type { SupabaseService } from '../src/common/supabase.service';
import type { RequestActor } from '../src/common/auth.guard';

const actor: RequestActor = {
  authUserId: 'auth-daniel',
  email: 'daniel@example.com',
  tenantId: 'tenant-1',
  personId: 'person-daniel',
  bearerToken: 'verified-token',
  tenantMemberships: [{ tenantId: 'tenant-1', personId: 'person-daniel' }],
};

describe('InvitationsService — conexão entre responsáveis', () => {
  it('creates an e-mail-bound co-guardian invitation only after admin and subject checks', async () => {
    let familyMembershipQueries = 0;
    let inserted: Record<string, unknown> | undefined;
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: (table: string) => {
        const builder: Record<string, unknown> = {};
        for (const method of ['select', 'eq', 'in', 'order']) builder[method] = () => builder;
        builder['maybeSingle'] = async () => ({ data: { role: 'FAMILY_OWNER', is_active: true }, error: null });
        builder['insert'] = (payload: Record<string, unknown>) => {
          inserted = payload;
          return builder;
        };
        builder['single'] = async () => ({
          data: { id: 'invite-1', invitee_email: inserted?.invitee_email, token: inserted?.token },
          error: null,
        });
        builder['then'] = (resolve: (value: unknown) => unknown) => {
          familyMembershipQueries += table === 'family_memberships' ? 1 : 0;
          return Promise.resolve({ data: [{ person_id: 'child-1', role: 'CHILD' }], error: null }).then(resolve);
        };
        return builder;
      },
    };
    const service = new InvitationsService({
      forUser: () => client,
      anonymous: () => ({ auth: { signInWithOtp } }),
      webAppUrl: 'https://www.zelii.com.br',
    } as unknown as SupabaseService);

    const result = await service.create(actor, {
      familyUnitId: 'family-1',
      inviteeEmail: '  ESPOSA@EXAMPLE.COM ',
      subjectPersonIds: ['child-1'],
    });

    expect(familyMembershipQueries).toBe(1);
    expect(inserted).toEqual(expect.objectContaining({
      tenant_id: 'tenant-1',
      invited_by_person_id: 'person-daniel',
      invitee_email: 'esposa@example.com',
      proposed_role: 'CO_GUARDIAN',
      proposed_relationship: 'SPOUSE_PARTNER',
      subject_person_ids: ['child-1'],
    }));
    expect(String(result.token)).toHaveLength(43);
    expect(result.delivery).toEqual({ channel: 'EMAIL', status: 'SENT' });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'esposa@example.com',
      options: {
        emailRedirectTo: `https://www.zelii.com.br/convite/${String(result.token)}`,
        shouldCreateUser: true,
      },
    });
  });

  it('keeps the generated link available when the e-mail provider cannot deliver', async () => {
    let inserted: Record<string, unknown> | undefined;
    const client = {
      from: (table: string) => {
        const builder: Record<string, unknown> = {};
        for (const method of ['select', 'eq', 'in']) builder[method] = () => builder;
        builder['maybeSingle'] = async () => ({ data: { role: 'FAMILY_OWNER', is_active: true }, error: null });
        builder['insert'] = (payload: Record<string, unknown>) => {
          inserted = payload;
          return builder;
        };
        builder['single'] = async () => ({
          data: { id: 'invite-2', invitee_email: inserted?.invitee_email, token: inserted?.token },
          error: null,
        });
        builder['then'] = (resolve: (value: unknown) => unknown) => Promise.resolve({
          data: table === 'family_memberships' ? [{ person_id: 'child-1', role: 'CHILD' }] : [],
          error: null,
        }).then(resolve);
        return builder;
      },
    };
    const service = new InvitationsService({
      forUser: () => client,
      anonymous: () => ({ auth: { signInWithOtp: vi.fn().mockResolvedValue({ error: { message: 'provider unavailable' } }) } }),
      webAppUrl: 'https://www.zelii.com.br',
    } as unknown as SupabaseService);

    const result = await service.create(actor, {
      familyUnitId: 'family-1',
      inviteeEmail: 'ana@example.com',
      subjectPersonIds: ['child-1'],
    });

    expect(String(result.token)).toHaveLength(43);
    expect(result.delivery).toEqual({ channel: 'EMAIL', status: 'FAILED' });
  });

  it('resends a pending invitation without exposing its token in the response', async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: (table: string) => {
        const builder: Record<string, unknown> = {};
        for (const method of ['select', 'eq']) builder[method] = () => builder;
        builder['maybeSingle'] = async () => ({
          data: table === 'invitations'
            ? {
                id: 'invite-1',
                family_unit_id: 'family-1',
                invited_by_person_id: actor.personId,
                invitee_email: 'ana@example.com',
                token: 'private-token',
                status: 'PENDING',
                expires_at: new Date(Date.now() + 60_000).toISOString(),
              }
            : { role: 'FAMILY_OWNER', is_active: true },
          error: null,
        });
        return builder;
      },
    };
    const service = new InvitationsService({
      forUser: () => client,
      anonymous: () => ({ auth: { signInWithOtp } }),
      webAppUrl: 'https://www.zelii.com.br',
    } as unknown as SupabaseService);

    const result = await service.resend(actor, 'invite-1');

    expect(result).toEqual({ channel: 'EMAIL', status: 'SENT' });
    expect(result).not.toHaveProperty('token');
    expect(signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ email: 'ana@example.com' }));
  });

  it('accepts through the JWT-bound RPC without sending account, tenant or e-mail from the client', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ tenant_id: 'shared-tenant', person_id: 'wife-person', family_unit_id: 'family-1' }],
      error: null,
    });
    const service = new InvitationsService({ forUser: () => ({ rpc }) } as unknown as SupabaseService);

    const result = await service.accept(actor, 'safe-token', 'Ana Diniz');

    expect(rpc).toHaveBeenCalledWith('accept_family_invitation', {
      p_token: 'safe-token',
      p_display_name: 'Ana Diniz',
    });
    expect(result).toEqual({ tenantId: 'shared-tenant', personId: 'wife-person', familyUnitId: 'family-1' });
  });

  it('turns an invitation e-mail mismatch into a clear, non-technical error', async () => {
    const service = new InvitationsService({
      forUser: () => ({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'invitation_email_mismatch' } }) }),
    } as unknown as SupabaseService);

    await expect(service.accept(actor, 'token-for-someone-else', 'Ana')).rejects.toThrow(/conta correta/i);
  });
});
