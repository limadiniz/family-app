import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { expandCareScheduleOccurrences } from '@family-app/domain';
import type { RequestActor } from '../../common/auth.guard';
import { AuditService } from '../../common/audit.service';
import { PolicyDeniedError, PolicyRequiresConfirmationError, PolicyService } from '../../common/policy.service';
import { SupabaseService } from '../../common/supabase.service';

export interface BriefItem {
  label: string;
  status: 'OK' | 'ATTENTION' | 'INFO';
}

export interface BriefSection {
  title: string;
  items: BriefItem[];
  /** true if this section was omitted entirely because the actor lacks the domain's VIEW permission (§33-34: "mostrar apenas informações autorizadas"). */
  omittedForPermissions: boolean;
}

/**
 * Handoff Brief + Care Brief (V3 §33-34) — the two Family Copilot outputs
 * that turn "everything we know about this child" into "what THIS person,
 * right now, is authorized to see and needs to know". Every section is
 * gated behind its own domain check so a partial-authority caregiver
 * (e.g. PICKUP-only, no HEALTH) still gets a useful brief with the
 * unauthorized sections silently omitted rather than a hard 403 for the
 * whole thing.
 */
@Injectable()
export class CareBriefService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
  ) {}

  private db(actor: RequestActor) {
    return this.supabase.forUser(actor.bearerToken);
  }

  private async tryAuthorize(actor: RequestActor, action: 'VIEW', domain: 'SCHEDULE' | 'MEDICATION' | 'HEALTH' | 'EMERGENCY' | 'CONTACTS', subjectPersonId: string): Promise<boolean> {
    try {
      await this.policy.authorizeOrThrow(actor, action, domain, subjectPersonId, { purpose: 'brief_generation' });
      return true;
    } catch (err) {
      // A brief is a passive, non-interactive read — never treat
      // REQUIRE_CONFIRMATION as an implicit yes; omit the section instead
      // of surfacing a dialog for something the user didn't explicitly ask to view.
      if (err instanceof PolicyDeniedError || err instanceof PolicyRequiresConfirmationError) return false;
      throw err;
    }
  }

  // ---------------------------------------------------------- Care Brief

  /** §34 — daily brief for one child: AGENDA, SAÚDE, ATENÇÃO, TRANSPORTE, CONTATOS. */
  async getCareBrief(actor: RequestActor, childPersonId: string, dayIso: string) {
    const db = this.db(actor);
    const dayStart = `${dayIso}T00:00:00.000Z`;
    const dayEnd = `${dayIso}T23:59:59.999Z`;

    const sections: BriefSection[] = [];

    // AGENDA
    if (await this.tryAuthorize(actor, 'VIEW', 'SCHEDULE', childPersonId)) {
      const { data, error } = await db
        .from('calendar_events')
        .select('*')
        .eq('subject_person_id', childPersonId)
        .gte('starts_at', dayStart)
        .lte('starts_at', dayEnd)
        .order('starts_at');
      if (error) throw new BadRequestException(error.message);
      sections.push({
        title: 'AGENDA',
        items: (data ?? []).map((e) => ({ label: `${formatTime(e.starts_at as string)} ${e.title as string}`, status: 'INFO' as const })),
        omittedForPermissions: false,
      });

      // TRANSPORTE
      const transportEvents = (data ?? []).filter((e) => e.transportation_person_id);
      sections.push({
        title: 'TRANSPORTE',
        items: transportEvents.map((e) => ({
          label: `${formatTime(e.starts_at as string)} ${e.title as string}`,
          status: 'INFO' as const,
        })),
        omittedForPermissions: false,
      });
    } else {
      sections.push({ title: 'AGENDA', items: [], omittedForPermissions: true });
      sections.push({ title: 'TRANSPORTE', items: [], omittedForPermissions: true });
    }

    // SAÚDE (medication doses expected today, taken vs pending)
    if (await this.tryAuthorize(actor, 'VIEW', 'MEDICATION', childPersonId)) {
      sections.push({ title: 'SAÚDE', items: await this.medicationItemsForDay(actor, childPersonId, dayIso), omittedForPermissions: false });
    } else {
      sections.push({ title: 'SAÚDE', items: [], omittedForPermissions: true });
    }

    // ATENÇÃO (allergy/condition flags — Emergency Profile)
    if (await this.tryAuthorize(actor, 'VIEW', 'EMERGENCY', childPersonId)) {
      const { data, error } = await db.from('emergency_profiles').select('allergies, conditions').eq('subject_person_id', childPersonId).maybeSingle();
      if (error) throw new BadRequestException(error.message);
      const items: BriefItem[] = [];
      for (const allergy of (data?.allergies as string[] | null) ?? []) items.push({ label: `Alergia registrada: ${allergy}`, status: 'ATTENTION' });
      for (const condition of (data?.conditions as string[] | null) ?? []) items.push({ label: `Condição registrada: ${condition}`, status: 'ATTENTION' });
      sections.push({ title: 'ATENÇÃO', items, omittedForPermissions: false });
    } else {
      sections.push({ title: 'ATENÇÃO', items: [], omittedForPermissions: true });
    }

    // CONTATOS (accountable guardians)
    if (await this.tryAuthorize(actor, 'VIEW', 'CONTACTS', childPersonId)) {
      sections.push({ title: 'CONTATOS', items: await this.guardianContactItems(actor, childPersonId), omittedForPermissions: false });
    } else {
      sections.push({ title: 'CONTATOS', items: [], omittedForPermissions: true });
    }

    await this.audit.record(actor, {
      eventType: 'CARE_BRIEF_VIEWED',
      subjectPersonId: childPersonId,
      resourceType: 'care_brief',
      result: 'SUCCESS',
      context: { date: dayIso },
    });

    return { childPersonId, date: dayIso, sections };
  }

  // ------------------------------------------------------- Handoff Brief

  /** §33 — brief generated before a specific Handoff. */
  async getHandoffBrief(actor: RequestActor, handoffId: string) {
    const { data: handoff, error } = await this.db(actor).from('handoffs').select('*').eq('id', handoffId).maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!handoff) throw new NotFoundException('Handoff não encontrado.');

    const childPersonId = handoff.child_person_id as string;
    const scheduledAt = handoff.scheduled_at as string;
    const dayIso = scheduledAt.slice(0, 10);

    const sections: BriefSection[] = [];

    if (await this.tryAuthorize(actor, 'VIEW', 'MEDICATION', childPersonId)) {
      sections.push({ title: 'MEDICAMENTOS', items: await this.medicationItemsForDay(actor, childPersonId, dayIso), omittedForPermissions: false });
    } else {
      sections.push({ title: 'MEDICAMENTOS', items: [], omittedForPermissions: true });
    }

    if (await this.tryAuthorize(actor, 'VIEW', 'SCHEDULE', childPersonId)) {
      const { data: tasks, error: tasksError } = await this.db(actor)
        .from('tasks')
        .select('*')
        .eq('subject_person_id', childPersonId)
        .neq('status', 'CANCELLED')
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(10);
      if (tasksError) throw new BadRequestException(tasksError.message);
      sections.push({
        title: 'PENDÊNCIAS',
        items: (tasks ?? []).map((t) => ({
          label: t.status === 'DONE' ? `${t.title as string} concluído` : `${t.title as string}${t.due_at ? ` — até ${formatTime(t.due_at as string)}` : ''}`,
          status: t.status === 'DONE' ? ('OK' as const) : ('ATTENTION' as const),
        })),
        omittedForPermissions: false,
      });

      const { data: nextAppointment, error: apptError } = await this.db(actor)
        .from('calendar_events')
        .select('*')
        .eq('subject_person_id', childPersonId)
        .eq('category', 'HEALTH')
        .gte('starts_at', scheduledAt)
        .order('starts_at')
        .limit(1);
      if (apptError) throw new BadRequestException(apptError.message);
      const appt = (nextAppointment ?? [])[0];
      sections.push({
        title: 'PRÓXIMA CONSULTA',
        items: appt ? [{ label: `${appt.title as string} — ${formatDateTime(appt.starts_at as string)}`, status: 'INFO' as const }] : [],
        omittedForPermissions: false,
      });
    } else {
      sections.push({ title: 'PENDÊNCIAS', items: [], omittedForPermissions: true });
      sections.push({ title: 'PRÓXIMA CONSULTA', items: [], omittedForPermissions: true });
    }

    await this.audit.record(actor, {
      eventType: 'HANDOFF_BRIEF_VIEWED',
      subjectPersonId: childPersonId,
      resourceType: 'handoffs',
      resourceId: handoffId,
      result: 'SUCCESS',
    });

    return { handoffId, childPersonId, scheduledAt, sections };
  }

  // ------------------------------------------------------------- helpers

  /**
   * For each active medication with a schedule, expands today's expected
   * dose times (reusing `expandCareScheduleOccurrences` — same RRULE
   * shape, medication_schedules just doesn't model exceptions/holidays)
   * and cross-references `medication_administrations` to say whether
   * each expected dose was actually taken.
   */
  private async medicationItemsForDay(actor: RequestActor, childPersonId: string, dayIso: string): Promise<BriefItem[]> {
    const db = this.db(actor);
    const { data: medications, error } = await db
      .from('medications')
      .select('id, name, medication_schedules(rrule, start_date, end_date)')
      .eq('subject_person_id', childPersonId)
      .eq('active', true);
    if (error) throw new BadRequestException(error.message);

    const items: BriefItem[] = [];
    for (const med of medications ?? []) {
      const schedules = (med.medication_schedules as Array<{ rrule: string; start_date: string; end_date: string | null }>) ?? [];
      const hasDoseToday = schedules.some(
        (s) => expandCareScheduleOccurrences({ rrule: s.rrule, startDate: s.start_date, endDate: s.end_date, exceptions: [], excludeBrNationalHolidays: false }, dayIso, dayIso).length > 0,
      );
      if (!hasDoseToday) continue;

      const { data: administrations, error: adminError } = await db
        .from('medication_administrations')
        .select('*')
        .eq('medication_id', med.id as string)
        .gte('scheduled_at', `${dayIso}T00:00:00.000Z`)
        .lte('scheduled_at', `${dayIso}T23:59:59.999Z`)
        .order('scheduled_at');
      if (adminError) throw new BadRequestException(adminError.message);

      if ((administrations ?? []).length === 0) {
        items.push({ label: `${med.name as string}: dose prevista hoje, nada registrado ainda`, status: 'ATTENTION' });
        continue;
      }
      for (const admin of administrations ?? []) {
        if (admin.status === 'TAKEN') {
          items.push({ label: `${med.name as string} administrado ${formatTime(admin.administered_at as string)}`, status: 'OK' });
        } else {
          items.push({ label: `${med.name as string}: próxima dose ${formatTime(admin.scheduled_at as string)}`, status: 'ATTENTION' });
        }
      }
    }
    return items;
  }

  private async guardianContactItems(actor: RequestActor, childPersonId: string): Promise<BriefItem[]> {
    const db = this.db(actor);
    const { data: childMemberships, error: membershipError } = await db
      .from('family_memberships')
      .select('family_unit_id')
      .eq('person_id', childPersonId)
      .eq('is_active', true);
    if (membershipError) throw new BadRequestException(membershipError.message);
    const familyUnitIds = (childMemberships ?? []).map((m) => m.family_unit_id as string);
    if (familyUnitIds.length === 0) return [];

    const { data: guardians, error } = await db
      .from('family_memberships')
      .select('person_id, role, persons(display_name)')
      .in('family_unit_id', familyUnitIds)
      .in('role', ['FAMILY_OWNER', 'GUARDIAN', 'CO_GUARDIAN'])
      .eq('is_active', true);
    if (error) throw new BadRequestException(error.message);

    return (guardians ?? []).map((g) => {
      const person = g.persons as unknown as { display_name: string } | { display_name: string }[];
      const name = Array.isArray(person) ? person[0]?.display_name : person?.display_name;
      return { label: name ?? 'Responsável', status: 'INFO' as const };
    });
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toISOString().slice(11, 16);
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
}
