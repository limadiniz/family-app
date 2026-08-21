import { Injectable } from '@nestjs/common';
import type { PermissionAction, PermissionDomain, Role } from '@family-app/domain';
import { FamilyPolicyEngine, type PolicyEngineInput } from '@family-app/policy-engine';
import type { RequestActor } from './auth.guard';
import { SupabaseService } from './supabase.service';

export class PolicyDeniedError extends Error {
  constructor(public readonly rule: string) {
    super('Policy denied');
  }
}

export class PolicyRequiresConfirmationError extends Error {
  constructor(public readonly rule: string) {
    super('Policy requires confirmation');
  }
}

/**
 * apps/api's binding of the pure FamilyPolicyEngine (packages/policy-engine)
 * to real data: loads the actor's shared-family roles, active explicit
 * grants, and active CareWindow status for (actor, subject), then calls
 * `authorize()`. This is the ONLY place in apps/api that is allowed to
 * decide ALLOW/DENY — controllers and services must call
 * `authorizeOrThrow`, never re-implement a check inline (§25).
 */
@Injectable()
export class PolicyService {
  private readonly engine = new FamilyPolicyEngine();

  constructor(private readonly supabase: SupabaseService) {}

  async loadPolicyEngineInput(actor: RequestActor, subjectPersonId: string): Promise<PolicyEngineInput> {
    const client = this.supabase.forUser(actor.bearerToken);
    const now = new Date().toISOString();

    const [rolesRes, subjectRes, grantsRes, careWindowRes] = await Promise.all([
      client
        .from('family_memberships')
        .select('role, family_unit_id')
        .eq('person_id', actor.personId)
        .eq('is_active', true),
      client.from('persons').select('is_minor').eq('id', subjectPersonId).maybeSingle(),
      client
        .from('authority_grants')
        .select('domain, action, valid_from, valid_until, revoked_at')
        .eq('grantee_person_id', actor.personId)
        .eq('subject_person_id', subjectPersonId),
      client
        .from('care_windows')
        .select('id')
        .eq('caregiver_person_id', actor.personId)
        .eq('child_person_id', subjectPersonId)
        .eq('status', 'ACTIVE')
        .lte('starts_at', now)
        .gte('ends_at', now)
        .limit(1),
    ]);

    // Only roles held in a FamilyUnit that ALSO contains the subject count.
    const actorFamilyUnitIds = new Set((rolesRes.data ?? []).map((r) => r.family_unit_id as string));
    let sharedFamilyRoles: Role[] = [];
    if (actorFamilyUnitIds.size > 0) {
      const { data: subjectMemberships } = await client
        .from('family_memberships')
        .select('role, family_unit_id')
        .eq('person_id', subjectPersonId)
        .eq('is_active', true);
      const sharedUnitIds = new Set(
        (subjectMemberships ?? [])
          .map((m) => m.family_unit_id as string)
          .filter((id) => actorFamilyUnitIds.has(id)),
      );
      sharedFamilyRoles = (rolesRes.data ?? [])
        .filter((r) => sharedUnitIds.has(r.family_unit_id as string))
        .map((r) => r.role as Role);
    }

    const activeAuthorityGrants = (grantsRes.data ?? [])
      .filter((g) => !g.revoked_at)
      .filter((g) => !g.valid_from || g.valid_from <= now)
      .filter((g) => !g.valid_until || g.valid_until >= now)
      .map((g) => ({ domain: g.domain as PermissionDomain, action: g.action as PermissionAction }));

    return {
      sharedFamilyRoles,
      activeAuthorityGrants,
      hasActiveCareWindow: (careWindowRes.data ?? []).length > 0,
      subjectIsMinor: subjectRes.data?.is_minor ?? true, // fail-safe: unknown subject treated as minor (more restrictive)
    };
  }

  /**
   * Throws PolicyDeniedError / PolicyRequiresConfirmationError (mapped to
   * human-readable HTTP responses by HttpExceptionFilter) or resolves
   * silently on ALLOW. Pass `confirmed: true` (only after the client has
   * shown the user an explicit confirmation dialog) to accept a
   * REQUIRE_CONFIRMATION decision.
   */
  async authorizeOrThrow(
    actor: RequestActor,
    action: PermissionAction,
    domain: PermissionDomain,
    subjectPersonId: string,
    opts: { confirmed?: boolean; purpose?: string } = {},
  ): Promise<void> {
    if (!actor.tenantId || !actor.personId) throw new PolicyDeniedError('NOT_ONBOARDED');

    const input = await this.loadPolicyEngineInput(actor, subjectPersonId);
    const decision = this.engine.authorize(
      {
        actor: { personId: actor.personId, tenantId: actor.tenantId, userId: actor.authUserId },
        action,
        domain,
        subjectPersonId,
        subjectTenantId: actor.tenantId,
        context: { purpose: opts.purpose },
      },
      input,
    );

    if (decision.decision === 'DENY') {
      throw new PolicyDeniedError(decision.rule);
    }
    if (decision.decision === 'REQUIRE_CONFIRMATION' && !opts.confirmed) {
      throw new PolicyRequiresConfirmationError(decision.rule);
    }
  }
}
