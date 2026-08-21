import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { resolveAuthContext } from '@family-app/auth';
import { SupabaseService } from './supabase.service';

export interface RequestActor {
  authUserId: string;
  email?: string;
  /** null until the onboarding bootstrap RPC has run for this auth user. */
  tenantId: string | null;
  personId: string | null;
  bearerToken: string;
}

export type ActorRequest = Request & { actor: RequestActor; correlationId?: string };

/**
 * Verifies the bearer token against Supabase Auth (§14, §67) and attaches
 * the resolved actor to the request. Deliberately does NOT trust any
 * client-supplied user/tenant/person id (§10) — tenantId/personId are
 * looked up server-side from public.users using the user's own token
 * (self-select RLS policy), never taken from the request body.
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
    const { data } = await client.from('users').select('tenant_id, person_id').eq('id', authCtx.authUserId).maybeSingle();

    request.actor = {
      authUserId: authCtx.authUserId,
      email: authCtx.email,
      tenantId: (data?.tenant_id as string | undefined) ?? null,
      personId: (data?.person_id as string | undefined) ?? null,
      bearerToken,
    };
    return true;
  }
}
