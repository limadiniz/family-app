import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  canDelegateAtDepth,
  canTransitionResponsibilityAssignment,
  CARE_WINDOW_ELIGIBLE_RESPONSIBILITY_TYPES,
  getResponsibilityPermissionBundle,
  type ResponsibilityAssignmentStatus,
  type Role,
} from '@family-app/domain';
import { getDefaultDelegationPolicy } from '@family-app/policy-engine';
import type { RequestActor } from '../../common/auth.guard';
import { AuditService } from '../../common/audit.service';
import { PolicyDeniedError, PolicyService } from '../../common/policy.service';
import { SupabaseService } from '../../common/supabase.service';
import { RequestsService } from '../requests/requests.service';

/**
 * Extended Care Network (adendo). Implements the pipeline from §33:
 *
 *   Family Care Graph -> Eligible Care Network -> ResponsibilityAssignment
 *   -> Request/Acceptance -> Temporary Permission Bundle -> Execution -> Audit
 *
 * The core invariant: kinship never grants access (§2) — only an accepted
 * ResponsibilityAssignment, which mints scoped/time-boxed `AuthorityGrant`s
 * (and, only for genuinely custodial types, a `CareWindow`), does. Nothing
 * here bypasses the Family Policy Engine, and nobody can delegate access
 * they don't already hold themselves (see assertBundleWithinActorAuthority).
 */
@Injectable()
export class CareNetworkService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
    private readonly requests: RequestsService,
  ) {}

  private db(actor: RequestActor) {
    return this.supabase.forUser(actor.bearerToken);
  }

  // ------------------------------------------------------ create / delegate

  async create(
    actor: RequestActor,
    input: {
      subjectPersonId: string;
      responsibilityType: string;
      assignedToPersonId: string;
      startsAt: string;
      endsAt: string;
      instructions?: string;
      priority?: string;
      consultedPersonIds?: string[];
      informedPersonIds?: string[];
      fallbackAssignmentId?: string;
      requiredPermissions?: Array<{ domain: string; action: string }>;
      /** Set only when this call is a delegation/redelegation hop. */
      sourceAssignmentId?: string;
    },
  ) {
    if (input.assignedToPersonId === input.subjectPersonId) {
      throw new BadRequestException('A responsabilidade não pode ser atribuída à própria criança/sujeito.');
    }

    let accountablePersonId = actor.personId as string;
    let sourceType: 'RESPONSIBILITY_ASSIGNMENT' | 'MANUAL' = 'MANUAL';
    let sourceId: string | null = null;

    if (input.sourceAssignmentId) {
      const parent = await this.loadAssignmentOrThrow(actor, input.sourceAssignmentId);
      if (parent.assigned_to_person_id !== actor.personId) {
        throw new ForbiddenException('Só quem detém a responsabilidade pode delegá-la (§10-12).');
      }
      if (!['ACCEPTED', 'ACTIVE'].includes(parent.status as string)) {
        throw new BadRequestException('Só é possível delegar uma responsabilidade já aceita.');
      }
      if (parent.subject_person_id !== input.subjectPersonId) {
        throw new BadRequestException('Não é possível redelegar para um sujeito diferente do original.');
      }

      const depth = await this.computeChainDepth(actor, parent.id as string);
      const delegationPolicy = await this.resolveDelegationPolicy(actor);
      if (!canDelegateAtDepth(delegationPolicy, depth)) {
        await this.audit.record(actor, {
          eventType: 'RESPONSIBILITY_DELEGATION_DENIED',
          subjectPersonId: input.subjectPersonId,
          resourceType: 'responsibility_assignments',
          resourceId: parent.id as string,
          result: 'DENIED',
          context: { depth, canDelegate: delegationPolicy.canDelegate, canRedelegate: delegationPolicy.canRedelegate },
        });
        throw new ForbiddenException(
          depth === 0
            ? 'Você não tem permissão para delegar esta responsabilidade (§11-12).'
            : 'Você não tem permissão para redelegar esta responsabilidade (§11-12).',
        );
      }

      accountablePersonId = parent.accountable_person_id as string;
      sourceType = 'RESPONSIBILITY_ASSIGNMENT';
      sourceId = parent.id as string;
    } else {
      // Original assignment: the creator must independently hold real, standing
      // authority to organize care for the subject — never client-asserted.
      await this.policy.authorizeOrThrow(actor, 'MANAGE', 'SCHEDULE', input.subjectPersonId, {
        purpose: 'create_responsibility_assignment',
      });
    }

    // §8: nobody can grant a bundle broader than what they themselves are
    // authorized to do on the subject — checked for BOTH the type default
    // and any explicit override, so a client can never self-escalate by
    // supplying `requiredPermissions`.
    const bundle = getResponsibilityPermissionBundle(input.responsibilityType as never, input.requiredPermissions ?? null);
    await this.assertBundleWithinActorAuthority(actor, input.subjectPersonId, bundle);

    const db = this.db(actor);
    const { data, error } = await db
      .from('responsibility_assignments')
      .insert({
        tenant_id: actor.tenantId,
        subject_person_id: input.subjectPersonId,
        responsibility_type: input.responsibilityType,
        assigned_to_person_id: input.assignedToPersonId,
        assigned_by_person_id: actor.personId,
        accountable_person_id: accountablePersonId,
        consulted_person_ids: input.consultedPersonIds ?? [],
        informed_person_ids: input.informedPersonIds ?? [],
        source_type: sourceType,
        source_id: sourceId,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        status: 'PROPOSED',
        priority: input.priority ?? 'NORMAL',
        instructions: input.instructions ?? null,
        required_permissions: input.requiredPermissions ?? null,
        fallback_assignment_id: input.fallbackAssignmentId ?? null,
      })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    await this.audit.record(actor, {
      eventType: sourceId ? 'RESPONSIBILITY_DELEGATED' : 'RESPONSIBILITY_ASSIGNMENT_CREATED',
      subjectPersonId: input.subjectPersonId,
      resourceType: 'responsibility_assignments',
      resourceId: data.id as string,
      result: 'SUCCESS',
      context: { responsibilityType: input.responsibilityType, assignedToPersonId: input.assignedToPersonId },
    });

    // §16: Proposal -> Policy Validation (above) -> Request. Reuses the
    // already-audited Family Request Engine for the send/accept/decline
    // trail instead of duplicating it.
    const request = await this.requests.create(actor, {
      type: 'RESPONSIBILITY_ASSIGNMENT',
      requestedToPersonId: input.assignedToPersonId,
      subjectPersonId: input.subjectPersonId,
      relatedResourceType: 'responsibility_assignments',
      relatedResourceId: data.id as string,
      note: input.instructions,
      payload: { responsibilityType: input.responsibilityType, startsAt: input.startsAt, endsAt: input.endsAt },
    });

    const { data: sent, error: sentError } = await db
      .from('responsibility_assignments')
      .update({ status: 'SENT', request_id: request.id })
      .eq('id', data.id)
      .select()
      .single();
    if (sentError) throw new BadRequestException(sentError.message);
    return sent;
  }

  // -------------------------------------------------------------- read

  async listIncoming(actor: RequestActor) {
    const { data, error } = await this.db(actor)
      .from('responsibility_assignments')
      .select('*')
      .eq('assigned_to_person_id', actor.personId)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async listOutgoing(actor: RequestActor) {
    const { data, error } = await this.db(actor)
      .from('responsibility_assignments')
      .select('*')
      .or(`assigned_by_person_id.eq.${actor.personId},accountable_person_id.eq.${actor.personId}`)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  private async loadAssignmentOrThrow(actor: RequestActor, id: string) {
    const { data, error } = await this.db(actor).from('responsibility_assignments').select('*').eq('id', id).maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Responsabilidade não encontrada.');
    return data;
  }

  private assertTransition(current: ResponsibilityAssignmentStatus, next: ResponsibilityAssignmentStatus) {
    if (!canTransitionResponsibilityAssignment(current, next)) {
      throw new BadRequestException(`Não é possível mover a responsabilidade de "${current}" para "${next}".`);
    }
  }

  // ------------------------------------------------------- accept / decline

  /**
   * §16-17: acceptance is the only gate that activates a responsibility.
   * Mints the type's permission bundle as scoped, time-boxed
   * AuthorityGrants (and a CareWindow only for OVERNIGHT_CARE/
   * TEMPORARY_CARE — see gap-analysis for why not every type gets one).
   */
  async accept(actor: RequestActor, id: string) {
    const assignment = await this.loadAssignmentOrThrow(actor, id);
    if (assignment.assigned_to_person_id !== actor.personId) {
      throw new ForbiddenException('Somente a pessoa designada pode aceitar esta responsabilidade.');
    }
    this.assertTransition(assignment.status as ResponsibilityAssignmentStatus, 'ACCEPTED');

    const db = this.db(actor);
    const now = new Date().toISOString();

    const bundle = getResponsibilityPermissionBundle(
      assignment.responsibility_type as never,
      assignment.required_permissions as Array<{ domain: string; action: string }> | null,
    );
    for (const grant of bundle) {
      const { error: grantError } = await db.from('authority_grants').insert({
        tenant_id: actor.tenantId,
        grantee_person_id: assignment.assigned_to_person_id,
        subject_person_id: assignment.subject_person_id,
        domain: grant.domain,
        action: grant.action,
        valid_from: assignment.starts_at,
        valid_until: assignment.ends_at,
        granted_by_person_id: assignment.accountable_person_id,
      });
      if (grantError) throw new BadRequestException(grantError.message);
    }

    if (CARE_WINDOW_ELIGIBLE_RESPONSIBILITY_TYPES.includes(assignment.responsibility_type as never)) {
      const { error: windowError } = await db.from('care_windows').insert({
        tenant_id: actor.tenantId,
        child_person_id: assignment.subject_person_id,
        caregiver_person_id: assignment.assigned_to_person_id,
        starts_at: assignment.starts_at,
        ends_at: assignment.ends_at,
        status: 'SCHEDULED',
      });
      if (windowError) throw new BadRequestException(windowError.message);
    }

    const { data, error } = await db
      .from('responsibility_assignments')
      .update({ status: 'ACTIVE', accepted_at: now })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    await this.audit.record(actor, {
      eventType: 'RESPONSIBILITY_ASSIGNMENT_ACCEPTED',
      subjectPersonId: assignment.subject_person_id as string,
      resourceType: 'responsibility_assignments',
      resourceId: id,
      result: 'SUCCESS',
    });
    await this.audit.record(actor, {
      eventType: 'RESPONSIBILITY_ASSIGNMENT_ACTIVATED',
      subjectPersonId: assignment.subject_person_id as string,
      resourceType: 'responsibility_assignments',
      resourceId: id,
      result: 'SUCCESS',
      context: { bundleSize: bundle.length },
    });

    return data;
  }

  /** §21: decline never auto-escalates to a fallback — it only surfaces that one exists. */
  async decline(actor: RequestActor, id: string) {
    const assignment = await this.loadAssignmentOrThrow(actor, id);
    if (assignment.assigned_to_person_id !== actor.personId) {
      throw new ForbiddenException('Somente a pessoa designada pode recusar esta responsabilidade.');
    }
    this.assertTransition(assignment.status as ResponsibilityAssignmentStatus, 'DECLINED');

    const { data, error } = await this.db(actor)
      .from('responsibility_assignments')
      .update({ status: 'DECLINED' })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    await this.audit.record(actor, {
      eventType: 'RESPONSIBILITY_ASSIGNMENT_DECLINED',
      subjectPersonId: assignment.subject_person_id as string,
      resourceType: 'responsibility_assignments',
      resourceId: id,
      result: 'SUCCESS',
    });

    return { ...data, hasFallback: Boolean(assignment.fallback_assignment_id), fallbackAssignmentId: assignment.fallback_assignment_id };
  }

  async cancel(actor: RequestActor, id: string) {
    const assignment = await this.loadAssignmentOrThrow(actor, id);
    if (![assignment.assigned_by_person_id, assignment.accountable_person_id].includes(actor.personId)) {
      throw new ForbiddenException('Somente quem criou ou é responsável (ACCOUNTABLE) pode cancelar.');
    }
    this.assertTransition(assignment.status as ResponsibilityAssignmentStatus, 'CANCELLED');
    const { data, error } = await this.db(actor).from('responsibility_assignments').update({ status: 'CANCELLED' }).eq('id', id).select().single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /** §30: RESPONSIBLE person marks the task done — never inferred or auto-completed. */
  async complete(actor: RequestActor, id: string) {
    const assignment = await this.loadAssignmentOrThrow(actor, id);
    if (assignment.assigned_to_person_id !== actor.personId) {
      throw new ForbiddenException('Somente quem executou a responsabilidade pode marcá-la como concluída.');
    }
    this.assertTransition(assignment.status as ResponsibilityAssignmentStatus, 'COMPLETED');
    const { data, error } = await this.db(actor)
      .from('responsibility_assignments')
      .update({ status: 'COMPLETED', completed_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    await this.audit.record(actor, {
      eventType: 'RESPONSIBILITY_ASSIGNMENT_COMPLETED',
      subjectPersonId: assignment.subject_person_id as string,
      resourceType: 'responsibility_assignments',
      resourceId: id,
      result: 'SUCCESS',
    });
    return data;
  }

  /**
   * §21: explicit, human-triggered fallback activation. Never automatic —
   * only the ACCOUNTABLE person for the declined/expired assignment may
   * trigger it, and it just sends the pre-linked fallback (still subject
   * to its own accept/decline).
   */
  async activateFallback(actor: RequestActor, id: string) {
    const original = await this.loadAssignmentOrThrow(actor, id);
    if (original.accountable_person_id !== actor.personId) {
      throw new ForbiddenException('Somente a pessoa ACCOUNTABLE pode acionar o responsável substituto.');
    }
    if (!['DECLINED', 'EXPIRED'].includes(original.status as string)) {
      throw new BadRequestException('Só é possível acionar um substituto para uma responsabilidade recusada ou expirada.');
    }
    if (!original.fallback_assignment_id) {
      throw new BadRequestException('Esta responsabilidade não tem um substituto pré-configurado.');
    }

    const fallback = await this.loadAssignmentOrThrow(actor, original.fallback_assignment_id as string);
    if (fallback.status !== 'PROPOSED') {
      throw new BadRequestException('O substituto pré-configurado já não está disponível para envio.');
    }

    const request = await this.requests.create(actor, {
      type: 'RESPONSIBILITY_ASSIGNMENT',
      requestedToPersonId: fallback.assigned_to_person_id as string,
      subjectPersonId: fallback.subject_person_id as string,
      relatedResourceType: 'responsibility_assignments',
      relatedResourceId: fallback.id as string,
      payload: { responsibilityType: fallback.responsibility_type, startsAt: fallback.starts_at, endsAt: fallback.ends_at },
    });

    const { data, error } = await this.db(actor)
      .from('responsibility_assignments')
      .update({ status: 'SENT', request_id: request.id })
      .eq('id', fallback.id)
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  // ------------------------------------------------------ delegation helpers

  private async computeChainDepth(actor: RequestActor, assignmentId: string, maxHops = 20): Promise<number> {
    let depth = 0;
    let currentId: string | null = assignmentId;
    const seen = new Set<string>();
    const db = this.db(actor);
    while (currentId && depth < maxHops) {
      if (seen.has(currentId)) break;
      seen.add(currentId);
      const { data } = await db.from('responsibility_assignments').select('source_type, source_id').eq('id', currentId).maybeSingle();
      if (!data || data.source_type !== 'RESPONSIBILITY_ASSIGNMENT' || !data.source_id) break;
      depth += 1;
      currentId = data.source_id as string;
    }
    return depth;
  }

  private async resolveDelegationPolicy(actor: RequestActor) {
    const db = this.db(actor);
    const { data: override } = await db
      .from('delegation_policies')
      .select('can_delegate, can_redelegate, max_delegation_depth')
      .eq('person_id', actor.personId)
      .maybeSingle();
    if (override) {
      return {
        canDelegate: override.can_delegate as boolean,
        canRedelegate: override.can_redelegate as boolean,
        maxDelegationDepth: override.max_delegation_depth as number,
      };
    }

    const { data: memberships } = await db.from('family_memberships').select('role').eq('person_id', actor.personId).eq('is_active', true);
    const roles = (memberships ?? []).map((m) => m.role as Role);
    if (roles.length === 0) return { canDelegate: false, canRedelegate: false, maxDelegationDepth: 0 };

    // Most permissive role wins — role defaults are already conservative by
    // design (packages/policy-engine's ROLE_DEFAULT_DELEGATION_POLICY).
    return roles
      .map((r) => getDefaultDelegationPolicy(r))
      .reduce((best, current) => ({
        canDelegate: best.canDelegate || current.canDelegate,
        canRedelegate: best.canRedelegate || current.canRedelegate,
        maxDelegationDepth: Math.max(best.maxDelegationDepth, current.maxDelegationDepth),
      }));
  }

  /** §8: "you cannot grant what you don't have" — applies to both the type default bundle and any client-supplied override. */
  private async assertBundleWithinActorAuthority(
    actor: RequestActor,
    subjectPersonId: string,
    bundle: Array<{ domain: string; action: string }>,
  ) {
    for (const { domain, action } of bundle) {
      try {
        await this.policy.authorizeOrThrow(actor, action as never, domain as never, subjectPersonId, {
          purpose: 'responsibility_assignment_bundle_check',
          confirmed: true,
        });
      } catch (err) {
        if (err instanceof PolicyDeniedError) {
          throw new ForbiddenException(
            `Você não pode conceder "${domain}:${action}" porque não possui essa autorização sobre esta pessoa.`,
          );
        }
        throw err;
      }
    }
  }

  // ------------------------------------------------------------ care network

  async listMembers(actor: RequestActor, subjectPersonId: string) {
    await this.policy.authorizeOrThrow(actor, 'VIEW', 'SCHEDULE', subjectPersonId, { purpose: 'list_care_network_members' });
    const { data, error } = await this.db(actor)
      .from('care_network_members')
      .select('*')
      .eq('subject_person_id', subjectPersonId)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async addMember(
    actor: RequestActor,
    input: {
      subjectPersonId: string;
      personId: string;
      capabilities?: string[];
      note?: string;
      validFrom?: string;
      validUntil?: string;
    },
  ) {
    await this.policy.authorizeOrThrow(actor, 'MANAGE', 'SCHEDULE', input.subjectPersonId, { purpose: 'add_care_network_member' });
    const { data, error } = await this.db(actor)
      .from('care_network_members')
      .upsert(
        {
          tenant_id: actor.tenantId,
          subject_person_id: input.subjectPersonId,
          person_id: input.personId,
          status: 'PENDING',
          capabilities: input.capabilities ?? [],
          note: input.note ?? null,
          valid_from: input.validFrom ?? null,
          valid_until: input.validUntil ?? null,
          added_by_person_id: actor.personId,
        },
        { onConflict: 'tenant_id,subject_person_id,person_id' },
      )
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    await this.audit.record(actor, {
      eventType: 'CARE_NETWORK_MEMBER_ADDED',
      subjectPersonId: input.subjectPersonId,
      resourceType: 'care_network_members',
      resourceId: data.id as string,
      result: 'SUCCESS',
      context: { personId: input.personId },
    });
    return data;
  }

  async updateMemberStatus(actor: RequestActor, memberId: string, status: 'ACTIVE' | 'INACTIVE') {
    const { data: existing, error: loadError } = await this.db(actor)
      .from('care_network_members')
      .select('subject_person_id')
      .eq('id', memberId)
      .maybeSingle();
    if (loadError) throw new BadRequestException(loadError.message);
    if (!existing) throw new NotFoundException('Membro da rede de cuidado não encontrado.');

    await this.policy.authorizeOrThrow(actor, 'MANAGE', 'SCHEDULE', existing.subject_person_id as string, {
      purpose: 'update_care_network_member',
    });
    const { data, error } = await this.db(actor).from('care_network_members').update({ status }).eq('id', memberId).select().single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  // ---------------------------------------------------- recurring + availability

  async createRecurring(
    actor: RequestActor,
    input: {
      subjectPersonId: string;
      responsibilityType: string;
      defaultAssignedToPersonId: string;
      fallbackPersonId?: string;
      rrule: string;
      startDate: string;
      endDate?: string;
      instructions?: string;
    },
  ) {
    await this.policy.authorizeOrThrow(actor, 'MANAGE', 'SCHEDULE', input.subjectPersonId, { purpose: 'create_recurring_responsibility' });
    const { data, error } = await this.db(actor)
      .from('recurring_responsibilities')
      .insert({
        tenant_id: actor.tenantId,
        subject_person_id: input.subjectPersonId,
        responsibility_type: input.responsibilityType,
        default_assigned_to_person_id: input.defaultAssignedToPersonId,
        fallback_person_id: input.fallbackPersonId ?? null,
        rrule: input.rrule,
        start_date: input.startDate,
        end_date: input.endDate ?? null,
        instructions: input.instructions ?? null,
        created_by_person_id: actor.personId,
      })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async listRecurring(actor: RequestActor, subjectPersonId: string) {
    await this.policy.authorizeOrThrow(actor, 'VIEW', 'SCHEDULE', subjectPersonId, { purpose: 'list_recurring_responsibilities' });
    const { data, error } = await this.db(actor)
      .from('recurring_responsibilities')
      .select('*')
      .eq('subject_person_id', subjectPersonId)
      .eq('is_active', true);
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async cancelRecurring(actor: RequestActor, id: string) {
    const { data, error } = await this.db(actor).from('recurring_responsibilities').update({ is_active: false }).eq('id', id).select().single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async setAvailability(
    actor: RequestActor,
    slots: Array<{ dayOfWeek: number; startTime: string; endTime: string; note?: string }>,
  ) {
    const db = this.db(actor);
    await db.from('caregiver_availability').update({ is_active: false }).eq('person_id', actor.personId);
    if (slots.length === 0) return [];
    const { data, error } = await db
      .from('caregiver_availability')
      .insert(
        slots.map((s) => ({
          tenant_id: actor.tenantId,
          person_id: actor.personId,
          day_of_week: s.dayOfWeek,
          start_time: s.startTime,
          end_time: s.endTime,
          note: s.note ?? null,
          is_active: true,
        })),
      )
      .select();
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async getAvailability(actor: RequestActor, personId: string) {
    const { data, error } = await this.db(actor)
      .from('caregiver_availability')
      .select('*')
      .eq('person_id', personId)
      .eq('is_active', true)
      .order('day_of_week');
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }
}
