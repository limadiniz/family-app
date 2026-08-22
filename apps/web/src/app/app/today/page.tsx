'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, PersonAvatar, StatusBadge } from '@/components/ui';

interface PlanPerson {
  id: string;
  displayName: string;
  personType: string;
}

interface PlannedEvent {
  id: string;
  title: string;
  starts_at: string;
  category: string;
  responsible_person_id: string | null;
  transportation_person_id: string | null;
  person: PlanPerson;
}

interface PlannedTask {
  id: string;
  title: string;
  status: string;
  due_at: string | null;
  responsible_person_id: string | null;
  person: PlanPerson;
}

interface PlanConflict {
  type: string;
  severity: 'ATTENTION' | 'BLOCKING';
  message: string;
  involvedPersonIds: string[];
  involvedResourceIds: string[];
}

interface PreparationItem {
  id: string;
  eventId: string;
  subjectPersonId: string;
  person: PlanPerson;
  title: string;
  startsAt: string;
  category: string;
  source: 'CALENDAR_EVENT';
  requiresConfirmation: boolean;
}

interface FamilyPlanResponse {
  date: string;
  tomorrowDate: string;
  people: PlanPerson[];
  subjects: PlanPerson[];
  needsAttention: { conflicts: PlanConflict[]; tasks: PlannedTask[] };
  today: { events: PlannedEvent[]; tasks: PlannedTask[]; routines: Array<Record<string, unknown>> };
  tomorrow: { events: PlannedEvent[]; tasks: PlannedTask[]; preparations: PreparationItem[] };
  confirmed: PlannedEvent[];
}

interface ActivityItem {
  occurredAt: string;
  message: string;
  eventType: string;
}

interface ProactiveInsight {
  id: string;
  insight_type: string;
  severity: 'INFO' | 'ATTENTION' | 'BLOCKING';
  title: string;
  summary: string;
  rule_id: string;
  proposed_action_type: string | null;
}

interface InsightsResponse {
  enabled: boolean;
  suppressedReason: 'DISABLED' | 'QUIET_HOURS' | null;
  insights: ProactiveInsight[];
}

function localDayIso(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function personSummary(person: PlanPerson) {
  return { id: person.id, displayName: person.displayName, isMinor: person.personType !== 'ADULT' };
}

/**
 * Plano da Família — visão unificada de todas as pessoas autorizadas.
 * A composição acontece no backend para que conflitos entre irmãos e a
 * filtragem do Policy Engine não sejam reimplementados no navegador.
 */
export default function TodayPage() {
  const [plan, setPlan] = useState<FamilyPlanResponse | null>(null);
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [createdPreparationIds, setCreatedPreparationIds] = useState<Set<string>>(new Set());
  const [preparationError, setPreparationError] = useState<string | null>(null);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);

  const load = useCallback(() => {
    setError(null);
    setPlan(null);
    const date = localDayIso();
    apiFetch<FamilyPlanResponse>(`/family-plan?date=${date}`)
      .then((response) => {
        const valid =
          response &&
          Array.isArray(response.people) &&
          Array.isArray(response.subjects) &&
          Array.isArray(response.today?.events) &&
          Array.isArray(response.tomorrow?.preparations) &&
          Array.isArray(response.needsAttention?.conflicts);
        if (!valid) throw new Error('Resposta inesperada do servidor.');
        setPlan(response);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro inesperado.'));

    apiFetch<ActivityItem[]>('/activity-feed?limit=8')
      .then(setActivity)
      .catch(() => setActivity([]));

    apiFetch<InsightsResponse>(`/ai/insights?date=${date}`)
      .then(setInsights)
      .catch(() => setInsights(null));
  }, []);

  useEffect(load, [load, reloadKey]);

  const peopleById = useMemo(() => new Map((plan?.people ?? []).map((person) => [person.id, person])), [plan]);

  function responsibleLabel(event: PlannedEvent): string | null {
    const responsibleId = event.transportation_person_id ?? event.responsible_person_id;
    if (!responsibleId) return null;
    return peopleById.get(responsibleId)?.displayName ?? 'Responsável definido';
  }

  async function createPreparationTask(item: PreparationItem) {
    if (!window.confirm(`Criar esta tarefa para ${item.person.displayName}?\n\n${item.title}`)) return;
    setPreparationError(null);
    try {
      await apiFetch('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          subjectPersonId: item.subjectPersonId,
          title: item.title,
          description: `Criada a partir do compromisso de ${item.person.displayName}.`,
          dueAt: item.startsAt,
          priority: 'MEDIUM',
        }),
      });
      setCreatedPreparationIds((ids) => new Set(ids).add(item.id));
    } catch (err) {
      setPreparationError(err instanceof Error ? err.message : 'Não foi possível criar a tarefa.');
    }
  }

  async function dismissInsight(id: string) {
    await apiFetch(`/ai/insights/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'DISMISSED' }),
    });
    setInsights((current) => current ? { ...current, insights: current.insights.filter((item) => item.id !== id) } : current);
  }

  const needsAttentionCount =
    (plan?.needsAttention.conflicts.length ?? 0) + (plan?.needsAttention.tasks.length ?? 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Plano da Família"
        description={new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date())}
        actions={
          <Link
            href="/app/cadastros"
            className="inline-flex min-h-touch items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white hover:opacity-90"
          >
            + Cadastrar
          </Link>
        }
      />

      {error && (
        <div className="mt-8">
          <ErrorState title="Não foi possível montar o Plano da Família" description={error} onRetry={() => setReloadKey((key) => key + 1)} />
        </div>
      )}

      {!error && !plan && <LoadingState label="Organizando o plano da família…" />}

      {!error && plan && plan.subjects.length === 0 && (
        <div className="mt-8">
          <EmptyState
            title="Adicione quem faz parte da sua rotina"
            description="A ZELII precisa de ao menos uma pessoa para organizar compromissos, tarefas e responsabilidades."
          />
          <Link href="/app/cadastros/pessoa" className="mt-3 inline-block text-sm font-medium text-primary underline">
            Adicionar pessoa
          </Link>
        </div>
      )}

      {!error && plan && plan.subjects.length > 0 && (
        <div className="mt-8 space-y-8">
          <div className="flex flex-wrap items-center gap-2" aria-label="Pessoas incluídas no plano">
            {plan.subjects.map((person) => (
              <span key={person.id} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3 text-sm text-ink">
                <PersonAvatar person={personSummary(person)} size="sm" />
                {person.displayName}
              </span>
            ))}
          </div>

          {insights?.enabled && insights.insights.length > 0 && (
            <section aria-labelledby="zelii-insights-heading">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 id="zelii-insights-heading" className="text-xl font-semibold text-ink">A ZELII percebeu</h2>
                  <p className="mt-1 text-sm text-inkMuted">Avisos criados por regras da agenda — você continua no controle.</p>
                </div>
                <Link href="/app/ai" className="text-sm font-medium text-primary underline">Perguntar à ZELII</Link>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {insights.insights.map((insight) => (
                  <Card key={insight.id} className={insight.severity === 'BLOCKING' ? 'border-critical/30 bg-critical/5' : 'border-info/25 bg-info/5'}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-info">Sugestão revisável</p>
                    <h3 className="mt-2 font-semibold text-ink">{insight.title}</h3>
                    <p className="mt-1 text-sm text-ink">{insight.summary}</p>
                    <p className="mt-2 text-xs text-inkMuted">Origem: regra determinística da ZELII · {insight.rule_id}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {insight.proposed_action_type && (
                        <Link href="/app/ai" className="inline-flex min-h-touch items-center rounded-md bg-primary px-3 text-sm font-semibold text-white">
                          Preparar ação
                        </Link>
                      )}
                      <Button type="button" size="sm" variant="secondary" onClick={() => void dismissInsight(insight.id)}>
                        Agora não
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {insights?.enabled && insights.suppressedReason === 'QUIET_HOURS' && (
            <p className="text-sm text-inkMuted">Os avisos da ZELII estão pausados durante o horário silencioso.</p>
          )}

          <section aria-labelledby="attention-heading">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="attention-heading" className="text-xl font-semibold text-ink">Precisa de você</h2>
                <p className="mt-1 text-sm text-inkMuted">Decisões e pendências que merecem atenção agora.</p>
              </div>
              {needsAttentionCount > 0 && (
                <span className="rounded-full bg-warning/15 px-3 py-1 text-sm font-medium text-warning">
                  {needsAttentionCount} {needsAttentionCount === 1 ? 'item' : 'itens'}
                </span>
              )}
            </div>

            {needsAttentionCount === 0 ? (
              <Card className="mt-4 border-success/30 bg-success/5">
                <p className="font-medium text-ink">Tudo em ordem por enquanto</p>
                <p className="mt-1 text-sm text-inkMuted">Nenhum conflito ou tarefa urgente foi encontrado para hoje.</p>
              </Card>
            ) : (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {plan.needsAttention.conflicts.map((conflict, index) => (
                  <Card key={`${conflict.type}-${index}`} className={conflict.severity === 'BLOCKING' ? 'border-critical/30 bg-critical/5' : 'border-warning/30 bg-warning/5'}>
                    <p className={`text-sm font-semibold ${conflict.severity === 'BLOCKING' ? 'text-critical' : 'text-warning'}`}>
                      {conflict.severity === 'BLOCKING' ? 'Conflito para resolver' : 'Vale conferir'}
                    </p>
                    <p className="mt-2 text-sm text-ink">{conflict.message}</p>
                    <Link href="/app/calendar" className="mt-3 inline-block text-sm font-medium text-primary underline">
                      Ver na agenda
                    </Link>
                  </Card>
                ))}
                {plan.needsAttention.tasks.map((task) => (
                  <Card key={task.id} className="border-warning/30 bg-warning/5">
                    <div className="flex items-center gap-2">
                      <PersonAvatar person={personSummary(task.person)} size="sm" />
                      <p className="text-sm font-semibold text-ink">{task.person.displayName}</p>
                    </div>
                    <p className="mt-3 text-sm text-ink">{task.title}</p>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <StatusBadge domain="task" value={task.status} />
                      <Link href="/app/tasks" className="text-sm font-medium text-primary underline">Ver tarefa</Link>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="next-heading">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 id="next-heading" className="text-xl font-semibold text-ink">Próximas horas</h2>
                <p className="mt-1 text-sm text-inkMuted">Horários, pessoas e responsáveis do dia.</p>
              </div>
              <Link href="/app/calendar" className="text-sm font-medium text-primary underline">Ver agenda completa</Link>
            </div>

            {plan.today.events.length === 0 ? (
              <div className="mt-4">
                <EmptyState title="Nada na agenda para hoje" description="Você pode aproveitar o espaço livre ou adicionar um compromisso." />
              </div>
            ) : (
              <Card className="mt-4 p-0">
                <ol className="divide-y divide-border">
                  {[...plan.today.events]
                    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
                    .map((event) => {
                      const responsible = responsibleLabel(event);
                      return (
                        <li key={event.id} className="grid gap-3 p-4 sm:grid-cols-[72px_1fr_auto] sm:items-center">
                          <time className="text-lg font-semibold text-ink" dateTime={event.starts_at}>{formatTime(event.starts_at)}</time>
                          <div className="flex min-w-0 items-center gap-3">
                            <PersonAvatar person={personSummary(event.person)} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-ink">{event.title}</p>
                              <p className="text-sm text-inkMuted">{event.person.displayName}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                            <StatusBadge domain="calendarCategory" value={event.category} />
                            <span className={`text-xs ${responsible ? 'text-success' : 'text-warning'}`}>
                              {responsible ? `Com ${responsible}` : 'Responsável não definido'}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                </ol>
              </Card>
            )}
          </section>

          <section aria-labelledby="tomorrow-heading">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 id="tomorrow-heading" className="text-xl font-semibold text-ink">Para amanhã</h2>
                <p className="mt-1 text-sm text-inkMuted">Antecipe o que precisa ser revisado ou preparado.</p>
              </div>
              <span className="text-sm text-inkMuted">{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${plan.tomorrowDate}T12:00:00`))}</span>
            </div>

            {preparationError && <p className="mt-3 text-sm text-critical" role="alert">{preparationError}</p>}

            {plan.tomorrow.preparations.length === 0 && plan.tomorrow.tasks.length === 0 ? (
              <Card className="mt-4">
                <p className="font-medium text-ink">Nada para preparar ainda</p>
                <p className="mt-1 text-sm text-inkMuted">A ZELII usará os compromissos e tarefas cadastrados para montar esta lista.</p>
              </Card>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {plan.tomorrow.preparations.map((item) => (
                  <Card key={item.id}>
                    <div className="flex items-start gap-3">
                      <PersonAvatar person={personSummary(item.person)} size="sm" />
                      <div>
                        <p className="font-medium text-ink">{item.title}</p>
                        <p className="mt-1 text-sm text-inkMuted">{item.person.displayName} · {formatTime(item.startsAt)}</p>
                        <p className="mt-2 text-xs text-info">Sugestão baseada no compromisso — revise antes de confirmar.</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="mt-3"
                          disabled={createdPreparationIds.has(item.id)}
                          onClick={() => createPreparationTask(item)}
                        >
                          {createdPreparationIds.has(item.id) ? 'Tarefa criada' : 'Criar tarefa'}
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
                {plan.tomorrow.tasks.map((task) => (
                  <Card key={task.id}>
                    <div className="flex items-center gap-3">
                      <PersonAvatar person={personSummary(task.person)} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{task.title}</p>
                        <p className="text-sm text-inkMuted">{task.person.displayName}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="confirmed-heading">
            <h2 id="confirmed-heading" className="text-xl font-semibold text-ink">Está combinado</h2>
            <p className="mt-1 text-sm text-inkMuted">Compromissos que já têm alguém responsável.</p>
            <Card className="mt-4">
              {plan.confirmed.length === 0 ? (
                <p className="text-sm text-inkMuted">Nenhuma responsabilidade foi confirmada nos compromissos de hoje.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {plan.confirmed.map((event) => (
                    <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div>
                        <p className="text-sm font-medium text-ink">{event.title}</p>
                        <p className="text-xs text-inkMuted">{event.person.displayName} · {formatTime(event.starts_at)}</p>
                      </div>
                      <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
                        {responsibleLabel(event) ?? 'Responsável definido'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          {activity && activity.length > 0 && (
            <section aria-labelledby="activity-heading">
              <h2 id="activity-heading" className="text-xl font-semibold text-ink">Atividade da rede</h2>
              <Card className="mt-4">
                <ul className="space-y-3">
                  {activity.map((item, index) => (
                    <li key={`${item.occurredAt}-${index}`} className="text-sm text-ink">
                      <span className="mr-2 text-xs text-inkMuted">{formatTime(item.occurredAt)}</span>
                      {item.message}
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
