import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { RequestActor } from '../../common/auth.guard';
import { SupabaseService } from '../../common/supabase.service';
import { CommandCenterService } from '../command-center/command-center.service';
import { AuthorizedMemoryService } from './authorized-memory.service';
import { AiMetricsService } from './ai-metrics.service';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const statusSchema = z.enum(['ACKNOWLEDGED', 'DISMISSED']);

type InsightDraft = {
  insightType: string;
  severity: 'INFO' | 'ATTENTION' | 'BLOCKING';
  title: string;
  summary: string;
  subjectPersonIds: string[];
  sourceRefs: Array<{ type: string; id: string }>;
  proposedActionType?: string;
  proposedData?: Record<string, unknown>;
  ruleId: string;
  dedupeKey: string;
};

@Injectable()
export class AiInsightsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly commandCenter: CommandCenterService,
    private readonly memory: AuthorizedMemoryService,
    private readonly metrics: AiMetricsService,
  ) {}

  private db(actor: RequestActor) {
    return this.supabase.forUser(actor.bearerToken);
  }

  async getForDay(actor: RequestActor, day: string) {
    if (!dateSchema.safeParse(day).success) throw new BadRequestException('Data inválida. Use AAAA-MM-DD.');
    const preferences = await this.memory.getPreferences(actor);
    if (!preferences.proactive_enabled) {
      return { enabled: false, suppressedReason: 'DISABLED', insights: [] };
    }
    if (isQuietHours(preferences.quiet_hours_start, preferences.quiet_hours_end)) {
      return { enabled: true, suppressedReason: 'QUIET_HOURS', insights: [] };
    }

    const plan = await this.commandCenter.getFamilyPlan(actor, day);
    const drafts = buildInsightDrafts(plan as unknown as FamilyPlanShape, day);
    const expiresAt = new Date(`${day}T23:59:59.999Z`);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + 1);
    const rows = drafts.map((draft) => ({
      tenant_id: actor.tenantId,
      actor_person_id: actor.personId,
      insight_type: draft.insightType,
      severity: draft.severity,
      title: draft.title,
      summary: draft.summary,
      subject_person_ids: draft.subjectPersonIds,
      source_refs: draft.sourceRefs,
      proposed_action_type: draft.proposedActionType ?? null,
      proposed_data: draft.proposedData ?? {},
      rule_id: draft.ruleId,
      dedupe_key: draft.dedupeKey,
      expires_at: expiresAt.toISOString(),
    }));
    if (rows.length === 0) return { enabled: true, suppressedReason: null, insights: [] };

    const { data, error } = await this.db(actor)
      .from('ai_proactive_insights')
      .upsert(rows, { onConflict: 'tenant_id,actor_person_id,dedupe_key', ignoreDuplicates: false })
      .select('*');
    if (error) throw new BadRequestException(error.message);
    const active = (data ?? []).filter((row) => row.status === 'ACTIVE');
    await Promise.all(
      active.map((row) =>
        this.metrics.record(
          actor,
          'INSIGHT_DISPLAYED',
          { insightType: row.insight_type as string, severity: row.severity as string },
          `${day}:${row.dedupe_key as string}`,
        ),
      ),
    );
    return { enabled: true, suppressedReason: null, insights: active };
  }

  async updateStatus(actor: RequestActor, id: string, status: string) {
    const parsed = statusSchema.safeParse(status);
    if (!parsed.success) throw new BadRequestException('Estado inválido.');
    const { data, error } = await this.db(actor)
      .from('ai_proactive_insights')
      .update({ status: parsed.data })
      .eq('id', id)
      .eq('status', 'ACTIVE')
      .select('*')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new BadRequestException('O aviso já foi atualizado ou expirou.');
    return data;
  }
}

type Person = { id: string; displayName: string };
type FamilyPlanShape = {
  needsAttention: {
    conflicts: Array<{ type: string; severity: 'ATTENTION' | 'BLOCKING'; message: string; involvedPersonIds: string[]; involvedResourceIds: string[] }>;
    tasks: Array<{ id: string; title: string; subject_person_id: string; person: Person }>;
  };
  today: { events: Array<{ id: string; title: string; subject_person_id: string; responsible_person_id?: string | null; transportation_person_id?: string | null; person: Person }> };
  tomorrow: { preparations: Array<{ id: string; eventId: string; subjectPersonId: string; title: string; startsAt: string }> };
};

export function buildInsightDrafts(plan: FamilyPlanShape, day: string): InsightDraft[] {
  const drafts: InsightDraft[] = [];
  for (const conflict of plan.needsAttention.conflicts) {
    drafts.push({
      insightType: 'SCHEDULE_CONFLICT_DETECTED',
      severity: conflict.severity,
      title: 'Conflito de agenda para revisar',
      summary: conflict.message,
      subjectPersonIds: conflict.involvedPersonIds,
      sourceRefs: conflict.involvedResourceIds.map((id) => ({ type: 'calendar_events', id })),
      proposedActionType: 'PROPOSE_REQUEST',
      ruleId: `conflict_engine:${conflict.type}`,
      dedupeKey: `${day}:conflict:${conflict.type}:${[...conflict.involvedResourceIds].sort().join(':')}`,
    });
  }
  for (const task of plan.needsAttention.tasks) {
    drafts.push({
      insightType: 'TASK_OVERDUE',
      severity: 'ATTENTION',
      title: 'Tarefa pendente hoje',
      summary: task.title,
      subjectPersonIds: [task.subject_person_id],
      sourceRefs: [{ type: 'tasks', id: task.id }],
      proposedActionType: 'PROPOSE_REMINDER',
      ruleId: 'task:due_or_overdue',
      dedupeKey: `${day}:task:${task.id}`,
    });
  }
  for (const event of plan.today.events.filter((item) => !item.responsible_person_id && !item.transportation_person_id)) {
    drafts.push({
      insightType: 'RESPONSIBILITY_UNCONFIRMED',
      severity: 'ATTENTION',
      title: 'Responsável ainda não definido',
      summary: `“${event.title}” ainda precisa de uma pessoa responsável.`,
      subjectPersonIds: [event.subject_person_id],
      sourceRefs: [{ type: 'calendar_events', id: event.id }],
      proposedActionType: 'PROPOSE_RESPONSIBILITY_ASSIGNMENT',
      ruleId: 'calendar:responsibility_missing',
      dedupeKey: `${day}:responsibility:${event.id}`,
    });
  }
  for (const item of plan.tomorrow.preparations) {
    drafts.push({
      insightType: 'PREPARATION_INCOMPLETE',
      severity: 'INFO',
      title: 'Preparar para amanhã',
      summary: item.title,
      subjectPersonIds: [item.subjectPersonId],
      sourceRefs: [{ type: 'calendar_events', id: item.eventId }],
      proposedActionType: 'PROPOSE_PREPARATION_CHECKLIST',
      proposedData: { subjectPersonId: item.subjectPersonId, title: item.title, dueAt: item.startsAt, priority: 'MEDIUM' },
      ruleId: 'calendar:tomorrow_preparation',
      dedupeKey: `${day}:preparation:${item.eventId}`,
    });
  }
  return drafts.slice(0, 20);
}

function isQuietHours(start: string | null | undefined, end: string | null | undefined, now = new Date()): boolean {
  if (!start || !end || start === end) return false;
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: process.env.APP_TIMEZONE ?? 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const current = formatter.format(now);
  return start < end ? current >= start && current < end : current >= start || current < end;
}
