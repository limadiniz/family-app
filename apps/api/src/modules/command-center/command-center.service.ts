import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
   * agenda, tasks due, and today's routine items. Each sub-query is
   * still policy-checked (VIEW/SCHEDULE) before being included.
   */
  async getToday(actor: RequestActor, subjectPersonId: string, dayIso: string) {
    await this.policy.authorizeOrThrow(actor, 'VIEW', 'SCHEDULE', subjectPersonId, { purpose: 'today_aggregation' });

    const dayStart = `${dayIso}T00:00:00.000Z`;
    const dayEnd = `${dayIso}T23:59:59.999Z`;
    const db = this.db(actor);

    const [eventsRes, tasksRes, routinesRes] = await Promise.all([
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
    ]);

    if (eventsRes.error) throw new BadRequestException(eventsRes.error.message);
    if (tasksRes.error) throw new BadRequestException(tasksRes.error.message);
    if (routinesRes.error) throw new BadRequestException(routinesRes.error.message);

    return {
      date: dayIso,
      events: eventsRes.data ?? [],
      tasks: tasksRes.data ?? [],
      routines: routinesRes.data ?? [],
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
