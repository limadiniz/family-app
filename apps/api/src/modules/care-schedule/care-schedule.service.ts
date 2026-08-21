import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { canTransitionHandoff, expandCareScheduleOccurrences, type HandoffStatus } from '@family-app/domain';
import type { RequestActor } from '../../common/auth.guard';
import { AuditService } from '../../common/audit.service';
import { PolicyService } from '../../common/policy.service';
import { SupabaseService } from '../../common/supabase.service';

const HANDOFF_AUDIT_EVENT: Record<HandoffStatus, string> = {
  EXPECTED: 'HANDOFF_CREATED',
  CONFIRMED: 'HANDOFF_CONFIRMED',
  COMPLETED: 'HANDOFF_COMPLETED',
  DELAYED: 'HANDOFF_DELAYED',
  CANCELLED: 'HANDOFF_CANCELLED',
  DISPUTED: 'HANDOFF_DISPUTED',
};

/**
 * Application layer for CareSchedule / CareWindow / Handoff (V3 §17-19,
 * §31-34). The domain schemas and migrated tables (with RLS) predate this
 * module — see gap-analysis-v3.md §9 for why this was the single largest
 * concrete gap going into V3: nothing before this exposed them through
 * the API.
 */
@Injectable()
export class CareScheduleService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
  ) {}

  private db(actor: RequestActor) {
    return this.supabase.forUser(actor.bearerToken);
  }

  // --------------------------------------------------------- CareSchedule

  async createSchedule(
    actor: RequestActor,
    input: {
      childPersonId: string;
      caregiverPersonId: string;
      residenceId?: string;
      rrule: string;
      startDate: string;
      endDate?: string;
      label?: string;
      exceptions?: string[];
      excludeBrNationalHolidays?: boolean;
    },
  ) {
    await this.policy.authorizeOrThrow(actor, 'CREATE', 'SCHEDULE', input.childPersonId, { purpose: 'create_care_schedule' });

    const { data, error } = await this.db(actor)
      .from('care_schedules')
      .insert({
        tenant_id: actor.tenantId,
        child_person_id: input.childPersonId,
        caregiver_person_id: input.caregiverPersonId,
        residence_id: input.residenceId ?? null,
        rrule: input.rrule,
        start_date: input.startDate,
        end_date: input.endDate ?? null,
        label: input.label ?? null,
        exceptions: input.exceptions ?? [],
        exclude_br_national_holidays: input.excludeBrNationalHolidays ?? false,
      })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    await this.audit.record(actor, {
      eventType: 'CARE_SCHEDULE_CREATED',
      subjectPersonId: input.childPersonId,
      resourceType: 'care_schedules',
      resourceId: data.id as string,
      result: 'SUCCESS',
    });
    return data;
  }

  async listSchedules(actor: RequestActor, childPersonId: string) {
    await this.policy.authorizeOrThrow(actor, 'VIEW', 'SCHEDULE', childPersonId, { purpose: 'list_care_schedules' });
    const { data, error } = await this.db(actor)
      .from('care_schedules')
      .select('*')
      .eq('child_person_id', childPersonId)
      .is('deleted_at', null)
      .order('start_date');
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async cancelSchedule(actor: RequestActor, id: string) {
    const schedule = await this.loadScheduleOrThrow(actor, id);
    await this.policy.authorizeOrThrow(actor, 'EDIT', 'SCHEDULE', schedule.child_person_id as string, { purpose: 'cancel_care_schedule' });

    const { data, error } = await this.db(actor)
      .from('care_schedules')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    await this.audit.record(actor, {
      eventType: 'CARE_SCHEDULE_CANCELLED',
      subjectPersonId: schedule.child_person_id as string,
      resourceType: 'care_schedules',
      resourceId: id,
      result: 'SUCCESS',
    });
    return data;
  }

  /**
   * §31 occurrence expansion — pure computation over `expandCareScheduleOccurrences`
   * (packages/domain), honoring exceptions/holidays. Returns dates only;
   * `materializeWindow` turns one occurrence into a concrete CareWindow.
   */
  async occurrences(actor: RequestActor, id: string, from: string, to: string): Promise<string[]> {
    const schedule = await this.loadScheduleOrThrow(actor, id);
    await this.policy.authorizeOrThrow(actor, 'VIEW', 'SCHEDULE', schedule.child_person_id as string, { purpose: 'care_schedule_occurrences' });

    return expandCareScheduleOccurrences(
      {
        rrule: schedule.rrule as string,
        startDate: schedule.start_date as string,
        endDate: (schedule.end_date as string | null) ?? null,
        exceptions: (schedule.exceptions as string[] | null) ?? [],
        excludeBrNationalHolidays: (schedule.exclude_br_national_holidays as boolean | null) ?? false,
      },
      from,
      to,
    );
  }

  private async loadScheduleOrThrow(actor: RequestActor, id: string) {
    const { data, error } = await this.db(actor).from('care_schedules').select('*').eq('id', id).maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('CareSchedule não encontrada.');
    return data;
  }

  // ----------------------------------------------------------- CareWindow

  async createAdHocWindow(
    actor: RequestActor,
    input: { childPersonId: string; caregiverPersonId: string; startsAt: string; endsAt: string; residenceId?: string },
  ) {
    return this.insertWindow(actor, { ...input, careScheduleId: null });
  }

  /** Materializes one occurrence of a CareSchedule into a concrete CareWindow (§17-18). */
  async materializeWindow(
    actor: RequestActor,
    scheduleId: string,
    input: { date: string; startTime?: string; endTime?: string },
  ) {
    const schedule = await this.loadScheduleOrThrow(actor, scheduleId);
    const [occurrence] = await this.occurrences(actor, scheduleId, input.date, input.date);
    if (!occurrence) {
      throw new BadRequestException('A data informada não é uma ocorrência válida desta CareSchedule (verifique exceções/feriados).');
    }

    const startsAt = `${input.date}T${input.startTime ?? '00:00:00'}.000Z`;
    const endsAt = `${input.date}T${input.endTime ?? '23:59:59'}.000Z`;

    return this.insertWindow(actor, {
      childPersonId: schedule.child_person_id as string,
      caregiverPersonId: schedule.caregiver_person_id as string,
      startsAt,
      endsAt,
      residenceId: (schedule.residence_id as string | null) ?? undefined,
      careScheduleId: scheduleId,
    });
  }

  private async insertWindow(
    actor: RequestActor,
    input: {
      childPersonId: string;
      caregiverPersonId: string;
      startsAt: string;
      endsAt: string;
      residenceId?: string;
      careScheduleId: string | null;
    },
  ) {
    await this.policy.authorizeOrThrow(actor, 'CREATE', 'SCHEDULE', input.childPersonId, { purpose: 'create_care_window' });

    const { data, error } = await this.db(actor)
      .from('care_windows')
      .insert({
        tenant_id: actor.tenantId,
        child_person_id: input.childPersonId,
        caregiver_person_id: input.caregiverPersonId,
        care_schedule_id: input.careScheduleId,
        residence_id: input.residenceId ?? null,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        status: 'SCHEDULED',
      })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    await this.audit.record(actor, {
      eventType: 'CARE_WINDOW_CREATED',
      subjectPersonId: input.childPersonId,
      resourceType: 'care_windows',
      resourceId: data.id as string,
      result: 'SUCCESS',
    });
    return data;
  }

  async listWindows(actor: RequestActor, childPersonId: string, opts: { from?: string; to?: string; status?: string } = {}) {
    await this.policy.authorizeOrThrow(actor, 'VIEW', 'SCHEDULE', childPersonId, { purpose: 'list_care_windows' });
    let query = this.db(actor).from('care_windows').select('*').eq('child_person_id', childPersonId).order('starts_at');
    if (opts.from) query = query.gte('ends_at', opts.from);
    if (opts.to) query = query.lte('starts_at', opts.to);
    if (opts.status) query = query.eq('status', opts.status);
    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async setWindowStatus(actor: RequestActor, id: string, status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED') {
    const { data: window, error: findError } = await this.db(actor).from('care_windows').select('*').eq('id', id).maybeSingle();
    if (findError) throw new BadRequestException(findError.message);
    if (!window) throw new NotFoundException('CareWindow não encontrada.');

    await this.policy.authorizeOrThrow(actor, 'EDIT', 'SCHEDULE', window.child_person_id as string, { purpose: 'update_care_window_status' });

    const { data, error } = await this.db(actor).from('care_windows').update({ status }).eq('id', id).select().single();
    if (error) throw new BadRequestException(error.message);

    await this.audit.record(actor, {
      eventType: status === 'ACTIVE' ? 'CARE_WINDOW_ACTIVATED' : status === 'COMPLETED' ? 'CARE_WINDOW_COMPLETED' : 'CARE_WINDOW_CANCELLED',
      subjectPersonId: window.child_person_id as string,
      resourceType: 'care_windows',
      resourceId: id,
      result: 'SUCCESS',
    });
    return data;
  }

  // ------------------------------------------------------------- Handoff

  async createHandoff(
    actor: RequestActor,
    input: {
      childPersonId: string;
      fromPersonId: string;
      toPersonId: string;
      careWindowId?: string;
      scheduledAt: string;
      locationResidenceId?: string;
      notes?: string;
    },
  ) {
    await this.policy.authorizeOrThrow(actor, 'CREATE', 'SCHEDULE', input.childPersonId, { purpose: 'create_handoff' });

    const { data, error } = await this.db(actor)
      .from('handoffs')
      .insert({
        tenant_id: actor.tenantId,
        child_person_id: input.childPersonId,
        from_person_id: input.fromPersonId,
        to_person_id: input.toPersonId,
        care_window_id: input.careWindowId ?? null,
        scheduled_at: input.scheduledAt,
        location_residence_id: input.locationResidenceId ?? null,
        status: 'EXPECTED',
        notes: input.notes ?? null,
      })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    await this.audit.record(actor, {
      eventType: 'HANDOFF_CREATED',
      subjectPersonId: input.childPersonId,
      resourceType: 'handoffs',
      resourceId: data.id as string,
      result: 'SUCCESS',
    });
    return data;
  }

  async listHandoffs(actor: RequestActor, childPersonId: string, opts: { from?: string; to?: string } = {}) {
    await this.policy.authorizeOrThrow(actor, 'VIEW', 'SCHEDULE', childPersonId, { purpose: 'list_handoffs' });
    let query = this.db(actor).from('handoffs').select('*').eq('child_person_id', childPersonId).order('scheduled_at');
    if (opts.from) query = query.gte('scheduled_at', opts.from);
    if (opts.to) query = query.lte('scheduled_at', opts.to);
    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  /**
   * Drives the Handoff state machine (`canTransitionHandoff`, packages/
   * domain). On a transition INTO `COMPLETED` for a Handoff that carries
   * a `care_window_id`, also activates that CareWindow — "the pickup
   * actually happened" is precisely the real-world event that should
   * flip custody from SCHEDULED to ACTIVE (§18, §29). This is what makes
   * the `hasActiveCareWindow` policy bugfix above actually observable
   * end-to-end instead of only fixed in isolation.
   */
  async transition(actor: RequestActor, id: string, to: HandoffStatus) {
    const { data: handoff, error: findError } = await this.db(actor).from('handoffs').select('*').eq('id', id).maybeSingle();
    if (findError) throw new BadRequestException(findError.message);
    if (!handoff) throw new NotFoundException('Handoff não encontrado.');

    const from = handoff.status as HandoffStatus;
    if (!canTransitionHandoff(from, to)) {
      throw new BadRequestException(`Transição inválida de Handoff: ${from} -> ${to}.`);
    }

    await this.policy.authorizeOrThrow(actor, 'EDIT', 'SCHEDULE', handoff.child_person_id as string, { purpose: 'handoff_transition' });

    const { data, error } = await this.db(actor)
      .from('handoffs')
      .update({ status: to, actual_at: to === 'COMPLETED' ? new Date().toISOString() : handoff.actual_at })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    await this.audit.record(actor, {
      eventType: HANDOFF_AUDIT_EVENT[to] as never,
      subjectPersonId: handoff.child_person_id as string,
      resourceType: 'handoffs',
      resourceId: id,
      result: 'SUCCESS',
    });

    if (to === 'COMPLETED' && handoff.care_window_id) {
      await this.setWindowStatus(actor, handoff.care_window_id as string, 'ACTIVE').catch(() => {
        // A missing/already-terminal CareWindow shouldn't fail the Handoff
        // completion that already succeeded and was already audited above.
      });
    }

    return data;
  }
}
