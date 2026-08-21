import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  assertNoDuplicateActiveRole,
  assertSingleFamilyOwnerInvariant,
  BusinessRuleViolation,
} from '@family-app/business-rules';
import { derivePersonAgeFacts } from '@family-app/domain';
import type { RequestActor } from '../../common/auth.guard';
import { PolicyService } from '../../common/policy.service';
import { SupabaseService } from '../../common/supabase.service';

@Injectable()
export class FamilyService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly policy: PolicyService,
  ) {}

  private db(actor: RequestActor) {
    return this.supabase.forUser(actor.bearerToken);
  }

  // ---------------------------------------------------------------- persons

  async getPerson(actor: RequestActor, personId: string) {
    await this.policy.authorizeOrThrow(actor, 'VIEW', 'PROFILE', personId, { purpose: 'get_person' });
    const { data, error } = await this.db(actor).from('persons').select('*').eq('id', personId).maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Pessoa não encontrada.');
    return data;
  }

  async listPersonsInMyFamilies(actor: RequestActor) {
    // RLS already scopes this to the actor's tenant; we additionally filter
    // per-row through the Policy Engine so a recomposed family sharing one
    // tenant never leaks a person the actor has no relationship to.
    const { data, error } = await this.db(actor).from('persons').select('*').order('display_name');
    if (error) throw new BadRequestException(error.message);
    const results = [];
    for (const person of data ?? []) {
      const decision = await this.policy
        .authorizeOrThrow(actor, 'VIEW', 'PROFILE', person.id as string)
        .then(() => true)
        .catch(() => false);
      if (decision) results.push(person);
    }
    return results;
  }

  async updatePerson(actor: RequestActor, personId: string, patch: Record<string, unknown>) {
    await this.policy.authorizeOrThrow(actor, 'EDIT', 'PROFILE', personId, { purpose: 'update_person' });
    const { data, error } = await this.db(actor).from('persons').update(patch).eq('id', personId).select().maybeSingle();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  // ------------------------------------------------------------ family unit

  async createFamilyUnit(actor: RequestActor, input: { name: string; kind?: string }) {
    if (!actor.tenantId || !actor.personId) throw new BadRequestException('Conclua o cadastro inicial primeiro.');
    const db = this.db(actor);
    const { data: unit, error } = await db
      .from('family_units')
      .insert({ tenant_id: actor.tenantId, name: input.name, kind: input.kind ?? 'OTHER' })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    const { error: membershipError } = await db.from('family_memberships').insert({
      tenant_id: actor.tenantId,
      family_unit_id: unit.id,
      person_id: actor.personId,
      role: 'FAMILY_OWNER',
    });
    if (membershipError) throw new BadRequestException(membershipError.message);

    return unit;
  }

  async listFamilyUnits(actor: RequestActor) {
    const { data, error } = await this.db(actor)
      .from('family_memberships')
      .select('family_unit_id, role, family_units(id, name, kind)')
      .eq('person_id', actor.personId)
      .eq('is_active', true);
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async addFamilyMembership(actor: RequestActor, input: { familyUnitId: string; personId: string; role: string }) {
    const db = this.db(actor);
    const { data: existing, error: existingError } = await db
      .from('family_memberships')
      .select('person_id, role, is_active')
      .eq('family_unit_id', input.familyUnitId);
    if (existingError) throw new BadRequestException(existingError.message);

    const existingMemberships = (existing ?? []).map((m) => ({
      personId: m.person_id as string,
      role: m.role as never,
      isActive: m.is_active as boolean,
    }));

    try {
      assertSingleFamilyOwnerInvariant(existingMemberships, {
        tenantId: actor.tenantId!,
        familyUnitId: input.familyUnitId,
        personId: input.personId,
        role: input.role as never,
      });
      assertNoDuplicateActiveRole(
        existingMemberships,
        { tenantId: actor.tenantId!, familyUnitId: input.familyUnitId, personId: input.personId, role: input.role as never },
      );
    } catch (err) {
      if (err instanceof BusinessRuleViolation) throw new BadRequestException(err.message);
      throw err;
    }

    // Structural check (§128 ASSUMPTION): adding a member requires the
    // actor to already hold an owner-tier role in the SAME family unit.
    // We don't call the Policy Engine here because there is no
    // pre-existing "subject" fact being viewed/edited — this is a
    // membership-graph mutation, not a domain-scoped action.
    const actorRole = (existing ?? []).find((m) => m.person_id === actor.personId && m.is_active)?.role;
    if (!['FAMILY_OWNER', 'GUARDIAN', 'CO_GUARDIAN'].includes(actorRole as string)) {
      throw new BadRequestException('Você não tem permissão para adicionar membros a esta família.');
    }

    const { data, error } = await db
      .from('family_memberships')
      .insert({ tenant_id: actor.tenantId, family_unit_id: input.familyUnitId, person_id: input.personId, role: input.role })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async createDependent(actor: RequestActor, input: { displayName: string; birthDate?: string; familyUnitId: string }) {
    if (!actor.tenantId) throw new BadRequestException('Conclua o cadastro inicial primeiro.');
    const facts = derivePersonAgeFacts(input.birthDate ?? null);
    const db = this.db(actor);

    const { data: person, error } = await db
      .from('persons')
      .insert({
        tenant_id: actor.tenantId,
        display_name: input.displayName,
        birth_date: input.birthDate ?? null,
        person_type: facts.personType,
        is_minor: facts.isMinor,
      })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    const role = facts.personType === 'ADULT' ? 'EXTENDED_FAMILY' : facts.isMinor && facts.personType !== 'INFANT' ? 'CHILD' : 'CHILD';
    const { error: membershipError } = await db.from('family_memberships').insert({
      tenant_id: actor.tenantId,
      family_unit_id: input.familyUnitId,
      person_id: person.id,
      role,
    });
    if (membershipError) throw new BadRequestException(membershipError.message);

    await db.from('audit_events').insert({
      tenant_id: actor.tenantId,
      event_type: 'PERSON_CREATED',
      actor_user_id: actor.authUserId,
      actor_person_id: actor.personId,
      subject_person_id: person.id,
      result: 'SUCCESS',
    });

    return person;
  }

  // -------------------------------------------------------- relationships

  async createRelationship(actor: RequestActor, input: { fromPersonId: string; toPersonId: string; relationshipType: string }) {
    await this.policy.authorizeOrThrow(actor, 'EDIT', 'PROFILE', input.toPersonId, { purpose: 'create_relationship' });
    const { data, error } = await this.db(actor)
      .from('relationships')
      .insert({
        tenant_id: actor.tenantId,
        from_person_id: input.fromPersonId,
        to_person_id: input.toPersonId,
        relationship_type: input.relationshipType,
      })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    await this.db(actor).from('audit_events').insert({
      tenant_id: actor.tenantId,
      event_type: 'RELATIONSHIP_CREATED',
      actor_user_id: actor.authUserId,
      actor_person_id: actor.personId,
      subject_person_id: input.toPersonId,
      result: 'SUCCESS',
    });

    return data;
  }

  // ------------------------------------------------------------ residences

  async createResidence(actor: RequestActor, input: { label: string; city?: string; state?: string; postalCode?: string }) {
    if (!actor.tenantId) throw new BadRequestException('Conclua o cadastro inicial primeiro.');
    const { data, error } = await this.db(actor)
      .from('residences')
      .insert({ tenant_id: actor.tenantId, label: input.label, city: input.city, state: input.state, postal_code: input.postalCode })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async addResidenceMembership(actor: RequestActor, input: { residenceId: string; personId: string; isPrimary?: boolean }) {
    await this.policy.authorizeOrThrow(actor, 'EDIT', 'PROFILE', input.personId, { purpose: 'add_residence_membership' });
    const { data, error } = await this.db(actor)
      .from('residence_memberships')
      .insert({ tenant_id: actor.tenantId, residence_id: input.residenceId, person_id: input.personId, is_primary: input.isPrimary ?? false })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }
}
