import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { RequestActor } from '../../common/auth.guard';
import { AuditService } from '../../common/audit.service';
import { SupabaseService } from '../../common/supabase.service';

/**
 * Multi-família (§68/§10): AuthGuard já resolve `actor.tenantMemberships`
 * a partir de `account_memberships` a cada request, e RLS em `tenants`/
 * `persons` usa `app.is_current_tenant(...)` — não depende de nenhum
 * `x-tenant-id` selecionado, então dá pra ler os nomes de TODAS as
 * tenants/persons da conta numa query só, mesmo antes de escolher uma.
 * Sem service_role: usa `forUser`, respeitando RLS como qualquer outra
 * leitura (§10 — "não use service_role como atalho").
 */
@Injectable()
export class AccountsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly audit: AuditService,
  ) {}

  async getMyProfile(actor: RequestActor) {
    this.requireCurrentPerson(actor);
    const { data, error } = await this.supabase
      .forUser(actor.bearerToken)
      .from('persons')
      .select('id, display_name')
      .eq('id', actor.personId)
      .eq('tenant_id', actor.tenantId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Seu perfil não foi encontrado nesta família.');
    return { id: data.id, displayName: data.display_name, email: actor.email ?? '' };
  }

  async updateMyProfile(actor: RequestActor, input: { displayName: string }) {
    this.requireCurrentPerson(actor);
    const displayName = input.displayName?.trim();
    if (!displayName || displayName.length < 2 || displayName.length > 150) {
      throw new BadRequestException('Informe um nome entre 2 e 150 caracteres.');
    }

    const { data, error } = await this.supabase
      .forUser(actor.bearerToken)
      .from('persons')
      .update({ display_name: displayName })
      .eq('id', actor.personId)
      .eq('tenant_id', actor.tenantId)
      .select('id, display_name')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Seu perfil não foi encontrado nesta família.');

    await this.audit.record(actor, {
      eventType: 'PROFILE_UPDATED',
      subjectPersonId: actor.personId,
      resourceType: 'persons',
      resourceId: actor.personId ?? undefined,
      result: 'SUCCESS',
      context: { changedFields: ['display_name'] },
    });
    return { id: data.id, displayName: data.display_name, email: actor.email ?? '' };
  }

  async listMyTenants(actor: RequestActor) {
    if (actor.tenantMemberships.length === 0) {
      return { currentTenantId: actor.tenantId, memberships: [] };
    }
    const client = this.supabase.forUser(actor.bearerToken);
    const tenantIds = [...new Set(actor.tenantMemberships.map((m) => m.tenantId))];
    const personIds = [...new Set(actor.tenantMemberships.map((m) => m.personId))];

    const [{ data: tenants, error: tenantsError }, { data: persons, error: personsError }] = await Promise.all([
      client.from('tenants').select('id, name').in('id', tenantIds),
      client.from('persons').select('id, display_name').in('id', personIds),
    ]);
    if (tenantsError) throw tenantsError;
    if (personsError) throw personsError;

    const tenantName = new Map((tenants ?? []).map((t) => [t.id as string, t.name as string]));
    const personName = new Map((persons ?? []).map((p) => [p.id as string, p.display_name as string]));

    return {
      currentTenantId: actor.tenantId,
      memberships: actor.tenantMemberships.map((m) => ({
        tenantId: m.tenantId,
        personId: m.personId,
        tenantName: tenantName.get(m.tenantId) ?? 'Família',
        personDisplayName: personName.get(m.personId) ?? '',
      })),
    };
  }

  private requireCurrentPerson(actor: RequestActor): asserts actor is RequestActor & { tenantId: string; personId: string } {
    if (!actor.tenantId || !actor.personId) {
      throw new BadRequestException('Selecione a família em que deseja editar seu perfil.');
    }
  }
}
