import { BadRequestException, Injectable } from '@nestjs/common';
import type { RequestActor } from '../../common/auth.guard';
import { PolicyDeniedError, PolicyService } from '../../common/policy.service';
import { SupabaseService } from '../../common/supabase.service';
import { CommandCenterService } from '../command-center/command-center.service';

const AUDIT_EVENT_TEMPLATES: Partial<Record<string, (actorName: string, subjectName: string) => string>> = {
  RESPONSIBILITY_ASSIGNMENT_ACCEPTED: (actorName, subjectName) => `${actorName} aceitou cuidar de ${subjectName}.`,
  RESPONSIBILITY_ASSIGNMENT_DECLINED: (actorName) => `${actorName} recusou uma responsabilidade.`,
  HANDOFF_CONFIRMED: (actorName) => `${actorName} confirmou um Handoff.`,
  HANDOFF_COMPLETED: (actorName) => `${actorName} confirmou a entrega/busca.`,
  ADMINISTER_MEDICATION: (actorName, subjectName) => `${actorName} confirmou medicamento de ${subjectName}.`,
  REQUEST_ACCEPTED: (actorName) => `${actorName} aceitou uma solicitação.`,
  REQUEST_DECLINED: (actorName) => `${actorName} recusou uma solicitação.`,
  CARE_WINDOW_ACTIVATED: (actorName, subjectName) => `${actorName} começou a cuidar de ${subjectName}.`,
  CALENDAR_EVENT_CREATED: (actorName, subjectName) => `${actorName} adicionou um evento na agenda de ${subjectName}.`,
  TASK_CREATED: (actorName) => `${actorName} criou uma tarefa.`,
};

/**
 * Daily/Weekly Briefing (V3 §62-63 — "HOJE NA FAMÍLIA" / "SUA SEMANA") and
 * Activity Feed (§66 — "ATIVIDADE DA REDE"). Briefings are a family-wide
 * sweep across every member the actor shares a FamilyUnit with, reusing
 * `CommandCenterService.getToday` (and its Conflict Engine wiring, Task 3
 * of this delivery round) per person rather than re-implementing that
 * aggregation — a person the actor isn't authorized to see is silently
 * skipped (PolicyDeniedError), not surfaced as an error for the whole
 * briefing.
 */
@Injectable()
export class BriefingService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly policy: PolicyService,
    private readonly commandCenter: CommandCenterService,
  ) {}

  private db(actor: RequestActor) {
    return this.supabase.forUser(actor.bearerToken);
  }

  private async familyMembers(actor: RequestActor): Promise<Array<{ personId: string; displayName: string }>> {
    const db = this.db(actor);
    const { data: ownMemberships, error: ownError } = await db
      .from('family_memberships')
      .select('family_unit_id')
      .eq('person_id', actor.personId)
      .eq('is_active', true);
    if (ownError) throw new BadRequestException(ownError.message);
    const familyUnitIds = (ownMemberships ?? []).map((m) => m.family_unit_id as string);
    if (familyUnitIds.length === 0) return [];

    const { data: members, error } = await db
      .from('family_memberships')
      .select('person_id, persons(display_name)')
      .in('family_unit_id', familyUnitIds)
      .eq('is_active', true);
    if (error) throw new BadRequestException(error.message);

    const seen = new Set<string>();
    const result: Array<{ personId: string; displayName: string }> = [];
    for (const m of members ?? []) {
      const personId = m.person_id as string;
      if (seen.has(personId)) continue;
      seen.add(personId);
      const person = m.persons as unknown as { display_name: string } | { display_name: string }[];
      const displayName = (Array.isArray(person) ? person[0]?.display_name : person?.display_name) ?? 'Membro da família';
      result.push({ personId, displayName });
    }
    return result;
  }

  /** §62 — "HOJE NA FAMÍLIA": every family member's Today, in one call. */
  async getDailyBriefing(actor: RequestActor, dayIso: string) {
    const members = await this.familyMembers(actor);
    const people: Array<{ personId: string; displayName: string } & Awaited<ReturnType<CommandCenterService['getToday']>>> = [];

    for (const member of members) {
      try {
        const today = await this.commandCenter.getToday(actor, member.personId, dayIso);
        people.push({ ...member, ...today });
      } catch (err) {
        if (err instanceof PolicyDeniedError) continue; // not authorized for this member — skip, don't fail the whole briefing
        throw err;
      }
    }

    return { date: dayIso, people };
  }

  /** §63 — "SUA SEMANA": agenda + handoffs + active responsibilities for the next 7 days, per family member. */
  async getWeeklyBriefing(actor: RequestActor, weekStartIso: string) {
    const weekStart = `${weekStartIso}T00:00:00.000Z`;
    const weekEnd = new Date(new Date(weekStart).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const members = await this.familyMembers(actor);
    const db = this.db(actor);

    const people: Array<{
      personId: string;
      displayName: string;
      events: unknown[];
      handoffs: unknown[];
      responsibilities: unknown[];
    }> = [];

    for (const member of members) {
      const allowed = await this.policy
        .authorizeOrThrow(actor, 'VIEW', 'SCHEDULE', member.personId, { purpose: 'weekly_briefing' })
        .then(() => true)
        .catch((err) => {
          if (err instanceof PolicyDeniedError) return false;
          throw err;
        });
      if (!allowed) continue;

      const [eventsRes, handoffsRes, assignmentsRes] = await Promise.all([
        db
          .from('calendar_events')
          .select('*')
          .eq('subject_person_id', member.personId)
          .gte('starts_at', weekStart)
          .lte('starts_at', weekEnd)
          .order('starts_at'),
        db.from('handoffs').select('*').eq('child_person_id', member.personId).gte('scheduled_at', weekStart).lte('scheduled_at', weekEnd).order('scheduled_at'),
        db
          .from('responsibility_assignments')
          .select('*')
          .eq('subject_person_id', member.personId)
          .eq('status', 'ACTIVE')
          .gte('ends_at', weekStart)
          .lte('starts_at', weekEnd),
      ]);
      if (eventsRes.error) throw new BadRequestException(eventsRes.error.message);
      if (handoffsRes.error) throw new BadRequestException(handoffsRes.error.message);
      if (assignmentsRes.error) throw new BadRequestException(assignmentsRes.error.message);

      people.push({
        personId: member.personId,
        displayName: member.displayName,
        events: eventsRes.data ?? [],
        handoffs: handoffsRes.data ?? [],
        responsibilities: assignmentsRes.data ?? [],
      });
    }

    return { weekStart: weekStartIso, weekEnd: weekEnd.slice(0, 10), people };
  }

  /**
   * §66 — "ATIVIDADE DA REDE": recent AuditEvents rendered as a
   * human-readable feed, scoped to what the actor is authorized to see
   * (VIEW/AUDIT per subject, same as every other domain — §66 "Respeitar
   * autorização"). Events with no curated template still appear (an
   * activity feed that silently drops unrecognized event types would be
   * misleading), just with a generic fallback message.
   */
  async getActivityFeed(actor: RequestActor, limit = 30) {
    const db = this.db(actor);
    const { data: events, error } = await db
      .from('audit_events')
      .select('*')
      .eq('result', 'SUCCESS')
      .order('occurred_at', { ascending: false })
      .limit(limit * 2); // over-fetch; some will be filtered out by the per-subject authorization check below
    if (error) throw new BadRequestException(error.message);

    const personIds = new Set<string>();
    for (const e of events ?? []) {
      if (e.actor_person_id) personIds.add(e.actor_person_id as string);
      if (e.subject_person_id) personIds.add(e.subject_person_id as string);
    }
    const { data: persons, error: personsError } = personIds.size > 0 ? await db.from('persons').select('id, display_name').in('id', Array.from(personIds)) : { data: [], error: null };
    if (personsError) throw new BadRequestException(personsError.message);
    const nameById = new Map((persons ?? []).map((p) => [p.id as string, p.display_name as string]));

    const items: Array<{ occurredAt: string; message: string; eventType: string }> = [];
    for (const e of events ?? []) {
      if (items.length >= limit) break;
      const subjectPersonId = e.subject_person_id as string | null;
      if (subjectPersonId) {
        const allowed = await this.policy
          .authorizeOrThrow(actor, 'VIEW', 'AUDIT', subjectPersonId, { purpose: 'activity_feed' })
          .then(() => true)
          .catch((err) => {
            if (err instanceof PolicyDeniedError) return false;
            throw err;
          });
        if (!allowed) continue;
      }
      const actorName = nameById.get(e.actor_person_id as string) ?? 'Alguém';
      const subjectName = subjectPersonId ? (nameById.get(subjectPersonId) ?? 'um familiar') : '';
      const template = AUDIT_EVENT_TEMPLATES[e.event_type as string];
      items.push({
        occurredAt: e.occurred_at as string,
        eventType: e.event_type as string,
        message: template ? template(actorName, subjectName) : `${actorName}: ${e.event_type as string}`,
      });
    }
    return items;
  }
}
