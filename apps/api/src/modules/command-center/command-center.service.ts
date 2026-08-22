import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { detectConflicts, type ConflictCalendarEvent, type ConflictCareWindow, type ConflictHandoff, type ConflictResponsibilityAssignment } from '@family-app/domain';
import type { RequestActor } from '../../common/auth.guard';
import { AuditService } from '../../common/audit.service';
import { PolicyService } from '../../common/policy.service';
import { SupabaseService } from '../../common/supabase.service';

/**
 * Family Command Center (Prompt Mestre V2 §24-29): CalendarEvent, Task,
 * Routine/RoutineItem, Checklist/ChecklistItem CRUD plus the "Hoje"
 * aggregation. Every read/write of another person's schedule goes
 * through the Policy Engine's SCHEDULE domain — completing a
 * RoutineItem is deliberately scoped to EDIT on that one item, never
 * MANAGE/ADMIN, so a child marking their own routine done can never
 * escalate into administrative capability (§29).
 */
@Injectable()
export class CommandCenterService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
  ) {}

  private db(actor: RequestActor) {
    return this.supabase.forUser(actor.bearerToken);
  }

  // ------------------------------------------------------------ calendar

  async createCalendarEvent(
    actor: RequestActor,
    input: {
      subjectPersonId: string;
      title: string;
      category?: string;
      startsAt: string;
      endsAt?: string;
      residenceId?: string;
      responsiblePersonId?: string;
      transportationPersonId?: string;
      notes?: string;
    },
  ) {
    await this.policy.authorizeOrThrow(actor, 'CREATE', 'SCHEDULE', input.subjectPersonId, { purpose: 'create_calendar_event' });
    const { data, error } = await this.db(actor)
      .from('calendar_events')
      .insert({
        tenant_id: actor.tenantId,
        subject_person_id: input.subjectPersonId,
        title: input.title,
        category: input.category ?? 'OTHER',
        starts_at: input.startsAt,
        ends_at: input.endsAt ?? null,
        residence_id: input.residenceId ?? null,
        responsible_person_id: input.responsiblePersonId ?? null,
        transportation_person_id: input.transportationPersonId ?? null,
        notes: input.notes ?? null,
      })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    await this.audit.record(actor, {
      eventType: 'CALENDAR_EVENT_CREATED',
      subjectPersonId: input.subjectPersonId,
      resourceType: 'calendar_events',
      resourceId: data.id as string,
      result: 'SUCCESS',
    });
    return data;
  }

  async listCalendarEvents(actor: RequestActor, opts: { subjectPersonId?: string; from?: string; to?: string } = {}) {
    let query = this.db(actor).from('calendar_events').select('*').order('starts_at');
    if (opts.subjectPersonId) query = query.eq('subject_person_id', opts.subjectPersonId);
    if (opts.from) query = query.gte('starts_at', opts.from);
    if (opts.to) query = query.lte('starts_at', opts.to);
    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return this.filterViewable(actor, data ?? [], (row) => row.subject_person_id as string);
  }

  // --------------------------------------------------------------- tasks

  async createTask(
    actor: RequestActor,
    input: {
      subjectPersonId?: string;
      responsiblePersonId?: string;
      title: string;
      description?: string;
      dueAt?: string;
      priority?: string;
    },
  ) {
    const scopePersonId = input.subjectPersonId ?? input.responsiblePersonId ?? actor.personId!;
    await this.policy.authorizeOrThrow(actor, 'CREATE', 'SCHEDULE', scopePersonId, { purpose: 'create_task' });
    const { data, error } = await this.db(actor)
      .from('tasks')
      .insert({
        tenant_id: actor.tenantId,
        subject_person_id: input.subjectPersonId ?? null,
        responsible_person_id: input.responsiblePersonId ?? null,
        title: input.title,
        description: input.description ?? null,
        due_at: input.dueAt ?? null,
        priority: input.priority ?? 'MEDIUM',
      })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    await this.audit.record(actor, {
      eventType: 'TASK_CREATED',
      subjectPersonId: scopePersonId,
      resourceType: 'tasks',
      resourceId: data.id as string,
      result: 'SUCCESS',
    });
    return data;
  }

  async listTasks(actor: RequestActor, opts: { responsiblePersonId?: string; status?: string } = {}) {
    let query = this.db(actor).from('tasks').select('*').order('due_at', { ascending: true, nullsFirst: false });
    if (opts.responsiblePersonId) query = query.eq('responsible_person_id', opts.responsiblePersonId);
    if (opts.status) query = query.eq('status', opts.status);
    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async updateTaskStatus(actor: RequestActor, taskId: string, status: string) {
    const { data: task, error: findError } = await this.db(actor).from('tasks').select('*').eq('id', taskId).maybeSingle();
    if (findError) throw new BadRequestException(findError.message);
    if (!task) throw new NotFoundException('Tarefa não encontrada.');

    const scopePersonId = (task.subject_person_id as string | null) ?? (task.responsible_person_id as string | null) ?? actor.personId!;
    await this.policy.authorizeOrThrow(actor, 'EDIT', 'SCHEDULE', scopePersonId, { purpose: 'update_task_status' });

    const { data, error } = await this.db(actor).from('tasks').update({ status }).eq('id', taskId).select().single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  // ------------------------------------------------------------ routines

  async createRoutine(actor: RequestActor, input: { subjectPersonId: string; title: string; category?: string; rrule?: string }) {
    await this.policy.authorizeOrThrow(actor, 'CREATE', 'SCHEDULE', input.subjectPersonId, { purpose: 'create_routine' });
    const { data, error } = await this.db(actor)
      .from('routines')
      .insert({
        tenant_id: actor.tenantId,
        subject_person_id: input.subjectPersonId,
        title: input.title,
        category: input.category ?? 'OTHER',
        rrule: input.rrule ?? null,
      })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async addRoutineItem(actor: RequestActor, routineId: string, input: { title: string; sortOrder?: number }) {
    const { data: routine, error: findError } = await this.db(actor).from('routines').select('subject_person_id').eq('id', routineId).maybeSingle();
    if (findError) throw new BadRequestException(findError.message);
    if (!routine) throw new NotFoundException('Rotina não encontrada.');
    await this.policy.authorizeOrThrow(actor, 'EDIT', 'SCHEDULE', routine.subject_person_id as string, { purpose: 'add_routine_item' });

    const { data, error } = await this.db(actor)
      .from('routine_items')
      .insert({ tenant_id: actor.tenantId, routine_id: routineId, title: input.title, sort_order: input.sortOrder ?? 0 })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async listRoutines(actor: RequestActor, subjectPersonId: string) {
    await this.policy.authorizeOrThrow(actor, 'VIEW', 'SCHEDULE', subjectPersonId, { purpose: 'list_routines' });
    const { data, error } = await this.db(actor)
      .from('routines')
      .select('*, routine_items(*)')
      .eq('subject_person_id', subjectPersonId)
      .eq('active', true);
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  /**
   * Completing a routine item is intentionally scoped to EDIT on the
   * item's own subject — a child completing their own morning routine
   * needs nothing more than this (§29: "participar não significa
   * administrar").
   */
  async completeRoutineItem(actor: RequestActor, routineItemId: string) {
    const { data: item, error: findError } = await this.db(actor)
      .from('routine_items')
      .select('id, routine_id, routines!inner(subject_person_id)')
      .eq('id', routineItemId)
      .maybeSingle();
    if (findError) throw new BadRequestException(findError.message);
    if (!item) throw new NotFoundException('Item de rotina não encontrado.');

    const routineRelation = item.routines as unknown as { subject_person_id: string } | { subject_person_id: string }[];
    const subjectPersonId = Array.isArray(routineRelation) ? routineRelation[0]?.subject_person_id : routineRelation?.subject_person_id;
    if (!subjectPersonId) throw new BadRequestException('Rotina inválida.');

    await this.policy.authorizeOrThrow(actor, 'EDIT', 'SCHEDULE', subjectPersonId, { purpose: 'complete_routine_item' });

    const { data, error } = await this.db(actor)
      .from('routine_items')
      .update({ completed_at: new Date().toISOString(), completed_by_person_id: actor.personId })
      .eq('id', routineItemId)
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  // -------------------------------------------------------------- "hoje"

  /**
   * Family Command Center home aggregation (§24-26): everything relevant
   * to `subjectPersonId` for the given local calendar day, in one call —
   * agenda, tasks due, today's routine items, and Conflict Engine
   * results (§43, packages/domain's `detectConflicts` — pure logic, this
   * method only fetches the day's slice of each relevant table and hands
   * it over). Each sub-query is still policy-checked (VIEW/SCHEDULE)
   * before being included.
   */
  async getToday(actor: RequestActor, subjectPersonId: string, dayIso: string) {
    await this.policy.authorizeOrThrow(actor, 'VIEW', 'SCHEDULE', subjectPersonId, { purpose: 'today_aggregation' });

    const dayStart = `${dayIso}T00:00:00.000Z`;
    const dayEnd = `${dayIso}T23:59:59.999Z`;
    const db = this.db(actor);

    const [eventsRes, tasksRes, routinesRes, careWindowsRes, assignmentsRes, handoffsRes] = await Promise.all([
      db
        .from('calendar_events')
        .select('*')
        .eq('subject_person_id', subjectPersonId)
        .gte('starts_at', dayStart)
        .lte('starts_at', dayEnd)
        .order('starts_at'),
      db
        .from('tasks')
        .select('*')
        .or(`subject_person_id.eq.${subjectPersonId},responsible_person_id.eq.${subjectPersonId}`)
        .neq('status', 'DONE')
        .neq('status', 'CANCELLED'),
      db.from('routines').select('*, routine_items(*)').eq('subject_person_id', subjectPersonId).eq('active', true),
      db.from('care_windows').select('*').eq('child_person_id', subjectPersonId).gte('ends_at', dayStart).lte('starts_at', dayEnd),
      db.from('responsibility_assignments').select('*').eq('subject_person_id', subjectPersonId).gte('ends_at', dayStart).lte('starts_at', dayEnd),
      db.from('handoffs').select('*').eq('child_person_id', subjectPersonId).gte('scheduled_at', dayStart).lte('scheduled_at', dayEnd),
    ]);

    if (eventsRes.error) throw new BadRequestException(eventsRes.error.message);
    if (tasksRes.error) throw new BadRequestException(tasksRes.error.message);
    if (routinesRes.error) throw new BadRequestException(routinesRes.error.message);
    if (careWindowsRes.error) throw new BadRequestException(careWindowsRes.error.message);
    if (assignmentsRes.error) throw new BadRequestException(assignmentsRes.error.message);
    if (handoffsRes.error) throw new BadRequestException(handoffsRes.error.message);

    const events: ConflictCalendarEvent[] = (eventsRes.data ?? []).map((e) => ({
      id: e.id as string,
      subjectPersonId: e.subject_person_id as string,
      title: e.title as string,
      category: e.category as string,
      startsAt: e.starts_at as string,
      endsAt: (e.ends_at as string | null) ?? null,
      responsiblePersonId: (e.responsible_person_id as string | null) ?? null,
      transportationPersonId: (e.transportation_person_id as string | null) ?? null,
    }));
    const careWindows: ConflictCareWindow[] = (careWindowsRes.data ?? []).map((w) => ({
      id: w.id as string,
      childPersonId: w.child_person_id as string,
      caregiverPersonId: w.caregiver_person_id as string,
      residenceId: (w.residence_id as string | null) ?? null,
      startsAt: w.starts_at as string,
      endsAt: w.ends_at as string,
      status: w.status as ConflictCareWindow['status'],
    }));
    const responsibilityAssignments: ConflictResponsibilityAssignment[] = (assignmentsRes.data ?? []).map((r) => ({
      id: r.id as string,
      subjectPersonId: r.subject_person_id as string,
      assignedToPersonId: r.assigned_to_person_id as string,
      startsAt: r.starts_at as string,
      endsAt: r.ends_at as string,
      status: r.status as string,
    }));
    const handoffs: ConflictHandoff[] = (handoffsRes.data ?? []).map((h) => ({
      id: h.id as string,
      childPersonId: h.child_person_id as string,
      fromPersonId: h.from_person_id as string,
      toPersonId: h.to_person_id as string,
      scheduledAt: h.scheduled_at as string,
      status: h.status as string,
    }));

    const conflicts = detectConflicts({ events, careWindows, responsibilityAssignments, handoffs });

    return {
      date: dayIso,
      events: eventsRes.data ?? [],
      tasks: tasksRes.data ?? [],
      routines: routinesRes.data ?? [],
      conflicts,
    };
  }

  /**
   * Plano da Família — compõe, em uma única resposta de produto, o dia
   * de todas as pessoas cujo SCHEDULE o ator pode visualizar. A fonte de
   * verdade continua sendo `getToday`: cada pessoa passa pela mesma
   * autorização e pelas mesmas regras já testadas. Depois da composição,
   * rodamos o Conflict Engine novamente sobre os eventos combinados para
   * capturar conflitos que atravessam irmãos/responsáveis — algo que uma
   * consulta isolada por pessoa não consegue enxergar.
   */
  async getFamilyPlan(actor: RequestActor, dayIso: string) {
    const { data: peopleRows, error } = await this.db(actor)
      .from('persons')
      .select('id, display_name, person_type')
      .order('display_name');
    if (error) throw new BadRequestException(error.message);

    const visiblePeople: Array<{ id: string; displayName: string; personType: string }> = [];
    for (const row of peopleRows ?? []) {
      const id = row.id as string;
      const allowed = await this.policy
        .authorizeOrThrow(actor, 'VIEW', 'SCHEDULE', id, { purpose: 'family_plan' })
        .then(() => true)
        .catch(() => false);
      if (allowed) {
        visiblePeople.push({
          id,
          displayName: row.display_name as string,
          personType: row.person_type as string,
        });
      }
    }

    // Dependentes são o foco natural do plano. Se o tenant ainda não
    // possui nenhum, mantemos os adultos visíveis para não produzir uma
    // tela vazia durante a ativação inicial.
    const dependents = visiblePeople.filter((person) => person.personType !== 'ADULT');
    const planPeople = dependents.length > 0 ? dependents : visiblePeople;
    const tomorrowIso = addIsoDays(dayIso, 1);

    const [todayPlans, tomorrowPlans] = await Promise.all([
      Promise.all(planPeople.map(async (person) => ({ person, plan: await this.getToday(actor, person.id, dayIso) }))),
      Promise.all(planPeople.map(async (person) => ({ person, plan: await this.getToday(actor, person.id, tomorrowIso) }))),
    ]);

    type PlanPerson = (typeof planPeople)[number];
    type PlanResource = Record<string, unknown> & { person: PlanPerson };
    const withPerson = (rows: unknown[], person: PlanPerson): PlanResource[] =>
      rows.map((row) => ({ ...(row as Record<string, unknown>), person }));

    const todayEvents: PlanResource[] = todayPlans.flatMap(({ person, plan }) => withPerson(plan.events, person));
    const todayTasks: PlanResource[] = todayPlans.flatMap(({ person, plan }) => withPerson(plan.tasks, person));
    const tomorrowEvents: PlanResource[] = tomorrowPlans.flatMap(({ person, plan }) =>
      withPerson(plan.events, person),
    );
    const tomorrowTasks: PlanResource[] = tomorrowPlans.flatMap(({ person, plan }) =>
      withPerson(plan.tasks, person),
    );

    const crossPersonConflicts = detectConflicts({
      events: todayEvents.map((event) => ({
        id: event.id as string,
        subjectPersonId: event.subject_person_id as string,
        title: event.title as string,
        category: event.category as string,
        startsAt: event.starts_at as string,
        endsAt: (event.ends_at as string | null) ?? null,
        responsiblePersonId: (event.responsible_person_id as string | null) ?? null,
        transportationPersonId: (event.transportation_person_id as string | null) ?? null,
      })),
      careWindows: [],
      responsibilityAssignments: [],
      handoffs: [],
    });

    const conflictsByKey = new Map<string, (typeof crossPersonConflicts)[number]>();
    for (const conflict of [
      ...todayPlans.flatMap(({ plan }) => plan.conflicts),
      ...crossPersonConflicts,
    ]) {
      const key = `${conflict.type}:${[...conflict.involvedResourceIds].sort().join(',')}`;
      conflictsByKey.set(key, conflict);
    }

    const dayEnd = `${dayIso}T23:59:59.999Z`;
    const attentionTasks = todayTasks.filter((task) => {
      const dueAt = task.due_at as string | null;
      return !!dueAt && dueAt <= dayEnd && !['DONE', 'CANCELLED'].includes(task.status as string);
    });

    const preparations = tomorrowEvents.map((event) => ({
      id: `event:${event.id as string}`,
      eventId: event.id as string,
      subjectPersonId: event.subject_person_id as string,
      person: event.person,
      title: `Revisar o que precisa levar para “${event.title as string}”`,
      startsAt: event.starts_at as string,
      category: event.category as string,
      source: 'CALENDAR_EVENT' as const,
      requiresConfirmation: true,
    }));

    const confirmed = todayEvents.filter(
      (event) => !!event.responsible_person_id || !!event.transportation_person_id,
    );

    return {
      date: dayIso,
      tomorrowDate: tomorrowIso,
      people: visiblePeople,
      subjects: planPeople,
      needsAttention: {
        conflicts: Array.from(conflictsByKey.values()),
        tasks: attentionTasks,
      },
      today: {
        events: todayEvents,
        tasks: todayTasks,
        routines: todayPlans.flatMap(({ person, plan }) => withPerson(plan.routines, person)),
      },
      tomorrow: {
        events: tomorrowEvents,
        tasks: tomorrowTasks,
        preparations,
      },
      confirmed,
    };
  }

  // ------------------------------------------------------------- helpers

  private async filterViewable<T>(actor: RequestActor, rows: T[], subjectOf: (row: T) => string): Promise<T[]> {
    const results: T[] = [];
    for (const row of rows) {
      const allowed = await this.policy
        .authorizeOrThrow(actor, 'VIEW', 'SCHEDULE', subjectOf(row))
        .then(() => true)
        .catch(() => false);
      if (allowed) results.push(row);
    }
    return results;
  }
}

function addIsoDays(dayIso: string, days: number): string {
  const date = new Date(`${dayIso}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
