import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { resolveAuthContext } from '@family-app/auth';
import { SupabaseService } from './supabase.service';

export interface RequestActor {
  authUserId: string;
  email?: string;
  /** null until the onboarding bootstrap RPC has run for this auth user, or
   *  until a tenant context has been selected (see tenantMemberships below). */
  tenantId: string | null;
  personId: string | null;
  bearerToken: string;
  /** Every ACTIVE tenant this account belongs to (identity is decoupled
   *  from tenant — one Account can legitimately hold memberships in more
   *  than one FamilyUnit's tenant). Used by clients to drive a tenant
   *  switcher when there is more than one. */
  tenantMemberships: Array<{ tenantId: string; personId: string }>;
}

export type ActorRequest = Request & { actor: RequestActor; correlationId?: string };

/**
 * Verifies the bearer token against Supabase Auth (§14, §67) and attaches
 * the resolved actor to the request. Deliberately does NOT trust any
 * client-supplied user/tenant/person id (§10) — tenantId/personId are
 * looked up server-side from public.account_memberships using the user's
 * own token (self-select RLS policy), never taken from the request body.
 *
 * Because identity is decoupled from tenant (an Account may hold more than
 * one ACTIVE account_membership, one per tenant it belongs to), a single
 * "current tenant" is not always unambiguous. The caller may pass an
 * `x-tenant-id` header to select which membership applies to this request;
 * that header is only ever used to pick among the account's OWN active
 * memberships (looked up server-side), never trusted as an authorization
 * claim by itself (§10) — a tenant id that is not among the account's own
 * memberships is rejected, not silently ignored or honored.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ActorRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Sessão ausente ou inválida. Faça login novamente.');
    }
    const bearerToken = header.slice('Bearer '.length);

    const authCtx = await resolveAuthContext(bearerToken, {
      supabaseUrl: this.supabase.url,
      supabaseAnonKey: this.supabase.anonKey,
    }).catch(() => {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    });

    const client = this.supabase.forUser(bearerToken);
    const { data } = await client
      .from('account_memberships')
      .select('tenant_id, person_id')
      .eq('account_id', authCtx.authUserId)
      .eq('status', 'ACTIVE');

    const memberships = (data ?? []).map((row) => ({
      tenantId: row.tenant_id as string,
      personId: row.person_id as string,
    }));

    const requestedTenantId = request.headers['x-tenant-id'];
    let selected: { tenantId: string; personId: string } | undefined;
    if (typeof requestedTenantId === 'string' && requestedTenantId.length > 0) {
      selected = memberships.find((m) => m.tenantId === requestedTenantId);
      if (!selected) {
        throw new UnauthorizedException('Tenant informado não pertence a esta conta.');
      }
    } else if (memberships.length === 1) {
      selected = memberships[0];
    }
    // memberships.length > 1 and no x-tenant-id: leave tenantId/personId
    // null rather than guessing — the client must select a tenant context.

    request.actor = {
      authUserId: authCtx.authUserId,
      email: authCtx.email,
      tenantId: selected?.tenantId ?? null,
      personId: selected?.personId ?? null,
      bearerToken,
      tenantMemberships: memberships,
    };
    return true;
  }
}
