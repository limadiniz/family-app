import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
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
    if (!data || data.deleted_at) throw new NotFoundException('Pessoa não encontrada.');
    return data;
  }

  /**
   * `roles` (added for the Pessoas page's filters — §5 of the redesign
   * prompt: Todos/Dependentes/Responsáveis/Cuidadores/Profissionais) is
   * every ACTIVE role this person holds in any FamilyUnit — not just the
   * actor's own. This is a read-only, additive field on an already
   * policy-filtered response: it doesn't change what's returned, only
   * what's now attached to each already-approved row, and it's a single
   * extra batched query (not N+1) fetched after the policy filter, using
   * only the ids that already passed VIEW/PROFILE.
   */
  async listPersonsInMyFamilies(actor: RequestActor) {
    // RLS already scopes this to the actor's tenant; we additionally filter
    // per-row through the Policy Engine so a recomposed family sharing one
    // tenant never leaks a person the actor has no relationship to.
    const { data, error } = await this.db(actor).from('persons').select('*').order('display_name');
    if (error) throw new BadRequestException(error.message);
    const results: Array<Record<string, unknown>> = [];
    for (const person of (data ?? []).filter((item) => !item.deleted_at)) {
      const decision = await this.policy
        .authorizeOrThrow(actor, 'VIEW', 'PROFILE', person.id as string)
        .then(() => true)
        .catch(() => false);
      if (decision) results.push(person);
    }
    if (results.length === 0) return results;

    const personIds = results.map((p) => p.id as string);
    const { data: memberships, error: membershipsError } = await this.db(actor)
      .from('family_memberships')
      .select('person_id, role')
      .eq('is_active', true)
      .in('person_id', personIds);
    if (membershipsError) throw new BadRequestException(membershipsError.message);

    const rolesByPerson = new Map<string, string[]>();
    for (const m of memberships ?? []) {
      const list = rolesByPerson.get(m.person_id as string) ?? [];
      list.push(m.role as string);
      rolesByPerson.set(m.person_id as string, list);
    }
    return results.map((person) => ({ ...person, roles: rolesByPerson.get(person.id as string) ?? [] }));
  }

  async updatePerson(actor: RequestActor, personId: string, patch: Record<string, unknown>) {
    await this.policy.authorizeOrThrow(actor, 'EDIT', 'PROFILE', personId, { purpose: 'update_person' });
    const { data, error } = await this.db(actor).from('persons').update(patch).eq('id', personId).select().maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data || data.deleted_at) throw new NotFoundException('Pessoa não encontrada.');
    return data;
  }

  async deletePerson(actor: RequestActor, personId: string) {
    await this.policy.authorizeOrThrow(actor, 'EDIT', 'PROFILE', personId, { purpose: 'delete_person' });
    const { data: memberships, error: membershipsError } = await this.db(actor)
      .from('family_memberships')
      .select('role')
      .eq('person_id', personId)
      .eq('is_active', true);
    if (membershipsError) throw new BadRequestException(membershipsError.message);
    if ((memberships ?? []).some((membership) => membership.role === 'FAMILY_OWNER')) {
      throw new BadRequestException('O responsável principal não pode ser excluído. Transfira a titularidade da família antes.');
    }
    const { data, error } = await this.db(actor)
      .from('persons')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', personId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Pessoa não encontrada ou já excluída.');
    return { id: data.id, deleted: true };
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

  async listResidences(actor: RequestActor) {
    const { data, error } = await this.db(actor)
      .from('residences')
      .select('*')
      .is('deleted_at', null)
      .order('label');
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async createResidence(
    actor: RequestActor,
    input: {
      label: string;
      placeType?: string;
      addressLine?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      googlePlaceId?: string;
      latitude?: number;
      longitude?: number;
    },
  ) {
    if (!actor.tenantId) throw new BadRequestException('Conclua o cadastro inicial primeiro.');
    const { data, error } = await this.db(actor)
      .from('residences')
      .insert({
        tenant_id: actor.tenantId,
        label: input.label,
        place_type: input.placeType ?? 'OTHER',
        address_line: input.addressLine ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        postal_code: input.postalCode ?? null,
        google_place_id: input.googlePlaceId ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
      })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async updateResidence(
    actor: RequestActor,
    residenceId: string,
    input: Partial<{
      label: string;
      placeType: string;
      addressLine: string;
      city: string;
      state: string;
      postalCode: string;
      googlePlaceId: string;
      latitude: number;
      longitude: number;
    }>,
  ) {
    const patch: Record<string, unknown> = {};
    const fields: Array<[keyof typeof input, string]> = [
      ['label', 'label'], ['placeType', 'place_type'], ['addressLine', 'address_line'],
      ['city', 'city'], ['state', 'state'], ['postalCode', 'postal_code'],
      ['googlePlaceId', 'google_place_id'], ['latitude', 'latitude'], ['longitude', 'longitude'],
    ];
    for (const [source, target] of fields) if (input[source] !== undefined) patch[target] = input[source];
    const { data, error } = await this.db(actor).from('residences').update(patch).eq('id', residenceId).is('deleted_at', null).select().maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Local não encontrado.');
    return data;
  }

  async deleteResidence(actor: RequestActor, residenceId: string) {
    const { data, error } = await this.db(actor)
      .from('residences')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', residenceId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Local não encontrado ou já excluído.');
    return { id: data.id, deleted: true };
  }

  // ------------------------------------------------------------ Google Places

  private googleMapsApiKey() {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException('A busca de locais do Google ainda não está configurada. Você pode preencher o endereço manualmente.');
    }
    return apiKey;
  }

  async searchPlaces(_actor: RequestActor, input: { query: string }) {
    const query = String(input.query ?? '').trim().slice(0, 200);
    if (query.length < 3) return { suggestions: [] };

    const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': this.googleMapsApiKey(),
        'x-goog-fieldmask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
      },
      body: JSON.stringify({ input: query, languageCode: 'pt-BR', regionCode: 'BR' }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      suggestions?: Array<{ placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
      } }>;
      error?: { message?: string };
    };
    if (!response.ok) throw new BadRequestException(body.error?.message ?? 'O Google não conseguiu buscar esse local.');

    return {
      suggestions: (body.suggestions ?? []).flatMap((item) => {
        const prediction = item.placePrediction;
        if (!prediction?.placeId) return [];
        return [{
          placeId: prediction.placeId,
          description: prediction.text?.text ?? '',
          mainText: prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? '',
          secondaryText: prediction.structuredFormat?.secondaryText?.text ?? '',
        }];
      }),
    };
  }

  async getPlaceDetails(_actor: RequestActor, placeId: string) {
    if (!/^[A-Za-z0-9:_-]{5,200}$/.test(placeId)) throw new BadRequestException('Referência de local inválida.');
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        'x-goog-api-key': this.googleMapsApiKey(),
        'x-goog-fieldmask': 'id,displayName,formattedAddress,addressComponents,location,googleMapsUri',
      },
    });
    const body = (await response.json().catch(() => ({}))) as {
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      addressComponents?: Array<{ types?: string[]; longText?: string; shortText?: string }>;
      location?: { latitude?: number; longitude?: number };
      googleMapsUri?: string;
      error?: { message?: string };
    };
    if (!response.ok) throw new BadRequestException(body.error?.message ?? 'O Google não conseguiu carregar os detalhes desse local.');

    const component = (type: string) => body.addressComponents?.find((item) => item.types?.includes(type));
    const route = component('route')?.longText;
    const streetNumber = component('street_number')?.longText;
    const city = component('locality')?.longText ?? component('administrative_area_level_2')?.longText;
    const state = component('administrative_area_level_1')?.shortText ?? component('administrative_area_level_1')?.longText;
    const postalCode = component('postal_code')?.longText;

    return {
      placeId: body.id ?? placeId,
      label: body.displayName?.text ?? body.formattedAddress ?? 'Local selecionado',
      formattedAddress: body.formattedAddress ?? '',
      addressLine: [route, streetNumber].filter(Boolean).join(', '),
      city: city ?? '',
      state: state ?? '',
      postalCode: postalCode ?? '',
      latitude: body.location?.latitude ?? null,
      longitude: body.location?.longitude ?? null,
      mapsUri: body.googleMapsUri ?? `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(placeId)}`,
    };
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

  async listRoutines(actor: RequestActor, personId: string) {
    await this.policy.authorizeOrThrow(actor, 'VIEW', 'PROFILE', personId, { purpose: 'list_family_routines' });
    const { data, error } = await this.db(actor)
      .from('family_routines')
      .select('*')
      .eq('person_id', personId)
      .is('deleted_at', null)
      .order('starts_at');
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async createRoutine(
    actor: RequestActor,
    personId: string,
    input: {
      label: string;
      routineType?: string;
      weekdays?: number[];
      startsAt: string;
      endsAt?: string;
      arrivalBufferMinutes?: number;
      residenceId?: string;
      notes?: string;
    },
  ) {
    await this.policy.authorizeOrThrow(actor, 'EDIT', 'PROFILE', personId, { purpose: 'create_family_routine' });
    const weekdays = [...new Set((input.weekdays ?? [1, 2, 3, 4, 5]).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];
    if (weekdays.length === 0) throw new BadRequestException('Selecione ao menos um dia da semana.');
    const { data, error } = await this.db(actor)
      .from('family_routines')
      .insert({
        tenant_id: actor.tenantId,
        person_id: personId,
        label: input.label,
        routine_type: input.routineType ?? 'OTHER',
        weekdays,
        starts_at: input.startsAt,
        ends_at: input.endsAt ?? null,
        arrival_buffer_minutes: input.arrivalBufferMinutes ?? 0,
        residence_id: input.residenceId ?? null,
        notes: input.notes ?? null,
      })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async updateRoutine(actor: RequestActor, routineId: string, input: Partial<{
    label: string; routineType: string; weekdays: number[]; startsAt: string; endsAt: string;
    arrivalBufferMinutes: number; residenceId: string; notes: string; isActive: boolean;
  }>) {
    const { data: current, error: currentError } = await this.db(actor).from('family_routines').select('person_id').eq('id', routineId).maybeSingle();
    if (currentError) throw new BadRequestException(currentError.message);
    if (!current) throw new NotFoundException('Rotina não encontrada.');
    await this.policy.authorizeOrThrow(actor, 'EDIT', 'PROFILE', current.person_id as string, { purpose: 'update_family_routine' });
    const patch: Record<string, unknown> = {};
    const fields: Array<[string, string]> = [
      ['label', 'label'], ['routineType', 'routine_type'], ['startsAt', 'starts_at'], ['endsAt', 'ends_at'],
      ['arrivalBufferMinutes', 'arrival_buffer_minutes'], ['residenceId', 'residence_id'], ['notes', 'notes'], ['isActive', 'is_active'],
    ];
    for (const [source, target] of fields) if (input[source as keyof typeof input] !== undefined) patch[target] = input[source as keyof typeof input];
    if (input.weekdays) patch.weekdays = [...new Set(input.weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];
    const { data, error } = await this.db(actor).from('family_routines').update(patch).eq('id', routineId).is('deleted_at', null).select().maybeSingle();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async estimateTravelTime(actor: RequestActor, input: { originResidenceId: string; destinationResidenceId: string; departureAt?: string }) {
    const ids = [input.originResidenceId, input.destinationResidenceId];
    const { data, error } = await this.db(actor).from('residences').select('*').in('id', ids).is('deleted_at', null);
    if (error) throw new BadRequestException(error.message);
    const origin = data?.find((item) => item.id === input.originResidenceId) as Record<string, unknown> | undefined;
    const destination = data?.find((item) => item.id === input.destinationResidenceId) as Record<string, unknown> | undefined;
    if (!origin || !destination) throw new NotFoundException('Os dois locais precisam estar cadastrados.');
    const address = (place: Record<string, unknown>) => [place.address_line, place.city, place.state, place.postal_code].filter(Boolean).join(', ');
    const originText = address(origin) || String(origin.label);
    const destinationText = address(destination) || String(destination.label);
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originText)}&destination=${encodeURIComponent(destinationText)}${input.departureAt ? `&travelmode=driving` : ''}`;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return { provider: 'google_maps_link', durationSeconds: null, distanceMeters: null, mapsUrl, requiresConfiguration: true };

    try {
      const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
          'x-goog-fieldmask': 'routes.duration,routes.distanceMeters,routes.localizedValues',
        },
        body: JSON.stringify({
          origin: { address: originText },
          destination: { address: destinationText },
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
          ...(input.departureAt ? { departureTime: new Date(input.departureAt).toISOString() } : {}),
        }),
      });
      if (!response.ok) return { provider: 'google_maps_link', durationSeconds: null, distanceMeters: null, mapsUrl, requiresConfiguration: false };
      const body = (await response.json()) as { routes?: Array<{ duration?: string; distanceMeters?: number }> };
      const route = body.routes?.[0];
      const durationSeconds = route?.duration ? Number.parseFloat(route.duration.replace('s', '')) : null;
      return { provider: 'google_routes', durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null, distanceMeters: route?.distanceMeters ?? null, mapsUrl, requiresConfiguration: false };
    } catch {
      return { provider: 'google_maps_link', durationSeconds: null, distanceMeters: null, mapsUrl, requiresConfiguration: false };
    }
  }
}
