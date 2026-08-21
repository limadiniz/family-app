import { BadRequestException, Injectable } from '@nestjs/common';
import type { RequestActor } from '../../common/auth.guard';
import { SupabaseService } from '../../common/supabase.service';

/**
 * Onboarding flow (§85): Criar conta -> Confirmar identidade -> Criar
 * perfil Person -> Criar FamilyUnit -> Adicionar primeiro dependente ->
 * Selecionar relacionamento -> Definir primeira residência -> Configurar
 * notificações -> Home.
 *
 * Steps 1-2 (create account, confirm identity) happen client-side against
 * Supabase Auth directly (apps/web / apps/mobile call supabase-js
 * `auth.signUp`) — that is the standard, most secure Supabase pattern and
 * avoids apps/api re-implementing credential handling. `bootstrap` below
 * is step 3 onward: it is called immediately after a successful Auth
 * signup, using the freshly-issued session token, to materialize the
 * Tenant + Person + linked User row atomically via the
 * `app.create_tenant_and_owner` SECURITY DEFINER RPC.
 */
@Injectable()
export class OnboardingService {
  constructor(private readonly supabase: SupabaseService) {}

  async bootstrap(actor: RequestActor, input: { displayName: string }) {
    if (actor.tenantId && actor.personId) {
      return { tenantId: actor.tenantId, personId: actor.personId, alreadyBootstrapped: true };
    }
    if (!actor.email) {
      throw new BadRequestException('E-mail não encontrado na sessão.');
    }

    // Service role required: no public.users row exists yet for this
    // auth user, so a user-scoped client would fail every RLS check.
    // Safety comes from `resolveAuthContext` in AuthGuard having already
    // verified this bearer token belongs to `actor.authUserId` — a caller
    // can only ever bootstrap their OWN account.
    const service = this.supabase.serviceRole();
    const { data, error } = await service.rpc('create_tenant_and_owner', {
      p_auth_user_id: actor.authUserId,
      p_email: actor.email,
      p_display_name: input.displayName,
    });
    if (error) throw new BadRequestException(error.message);

    const row = Array.isArray(data) ? data[0] : data;
    return { tenantId: row.tenant_id, personId: row.person_id, alreadyBootstrapped: false };
  }

  async status(actor: RequestActor) {
    if (!actor.tenantId || !actor.personId) {
      return { bootstrapped: false, hasFamilyUnit: false, dependentCount: 0, personId: null, tenantId: null };
    }
    const client = this.supabase.forUser(actor.bearerToken);
    const [{ count: familyUnitCount }, { count: dependentCount }] = await Promise.all([
      client.from('family_memberships').select('id', { count: 'exact', head: true }).eq('person_id', actor.personId),
      client.from('persons').select('id', { count: 'exact', head: true }).eq('is_minor', true),
    ]);
    return {
      bootstrapped: true,
      hasFamilyUnit: (familyUnitCount ?? 0) > 0,
      dependentCount: dependentCount ?? 0,
      personId: actor.personId,
      tenantId: actor.tenantId,
    };
  }
}
