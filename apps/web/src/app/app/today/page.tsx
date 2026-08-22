'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { PageHeader, PersonPicker, PersonAvatar, StatusBadge, Card, EmptyState, LoadingState, ErrorState, type PersonSummary } from '@/components/ui';

interface Person {
  id: string;
  display_name: string;
  person_type: string;
}

interface Conflict {
  type: string;
  severity: 'ATTENTION' | 'BLOCKING';
  message: string;
}

interface TodayEvent {
  id: string;
  title: string;
  starts_at: string;
  category: string;
  responsible_person_id: string | null;
}

interface TodayTask {
  id: string;
  title: string;
  status: string;
  due_at: string | null;
  responsible_person_id: string | null;
}

interface TodayResponse {
  date: string;
  events: TodayEvent[];
  tasks: TodayTask[];
  routines: Array<{ id: string; title: string; routine_items: Array<{ id: string; title: string; completed_at: string | null }> }>;
  conflicts: Conflict[];
}

interface ActivityItem {
  occurredAt: string;
  message: string;
  eventType: string;
}

/**
 * "Hoje" — a central de decisões (§7): não é uma lista de dados, é a
 * resposta a três perguntas — o que chegou, o que precisa acontecer
 * hoje, e quem está cuidando de cada coisa. Agrega agenda + tarefas +
 * rotinas via GET /api/v1/today, mais o feed de atividade da rede.
 */
export default function TodayPage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadPeople = useCallback(() => {
    setError(null);
    apiFetch<Person[]>('/persons')
      .then((list) => {
        setPeople(list);
        if (list.length > 0) setSelectedPersonId((current) => current ?? list[0].id);
      })
      .catch((err) => setError(err.message));
    apiFetch<ActivityItem[]>('/activity-feed?limit=10')
      .then(setActivity)
      .catch(() => setActivity([])); // widget não crítico — falha em silêncio (§7)
  }, []);

  useEffect(loadPeople, [loadPeople, reloadKey]);

  useEffect(() => {
    if (!selectedPersonId) return;
    setToday(null);
    apiFetch<TodayResponse>(`/today?subjectPersonId=${selectedPersonId}`)
      .then((res) => {
        // A malformed response (wrong shape — an unexpected backend change, a
        // proxy mangling the body, ...) must not reach the render below as if
        // it were valid data: `today.conflicts.length` etc. would throw
        // during render, an uncaught crash with no boundary above this page
        // to contain it (§7: an error here must stay an error HERE, never
        // take down the whole shell).
        const valid =
          res && Array.isArray(res.events) && Array.isArray(res.tasks) && Array.isArray(res.routines) && Array.isArray(res.conflicts);
        if (!valid) throw new Error('Resposta inesperada do servidor.');
        setToday(res);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro inesperado.'));
  }, [selectedPersonId, reloadKey]);

  // "quem está cuidando" — resolve responsible_person_id pro nome real,
  // usando a mesma lista já carregada. Nunca mostra um id cru.
  function responsibleName(personId: string | null): string | null {
    if (!personId) return null;
    if (personId === selectedPersonId) return null; // a própria pessoa selecionada — redundante mostrar
    return people?.find((p) => p.id === personId)?.display_name ?? null;
  }

  const personSummaries: PersonSummary[] = (people ?? []).map((p) => ({
    id: p.id,
    displayName: p.display_name,
    isMinor: p.person_type !== 'ADULT',
  }));

  const loading = people === null || (selectedPersonId !== null && today === null && !error);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Hoje"
        description={new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date())}
        actions={
          people && people.length > 1 ? (
            <PersonPicker people={personSummaries} value={selectedPersonId} onChange={setSelectedPersonId} />
          ) : undefined
        }
      />

      {error && (
        <div className="mt-8">
          <ErrorState title="Não foi possível carregar o seu Hoje" description={error} onRetry={() => setReloadKey((k) => k + 1)} />
        </div>
      )}

      {!error && people && people.length === 0 && (
        <div className="mt-8">
          <EmptyState
            title="Sua família ainda não tem ninguém cadastrado"
            description="Cadastre ao menos uma pessoa para a ZELII começar a organizar o dia a dia dela."
          />
          <Link href="/app/onboarding" className="mt-3 inline-block text-sm text-primary underline">
            Continuar cadastro
          </Link>
        </div>
      )}

      {!error && loading && people && people.length > 0 && <LoadingState label="Carregando o seu Hoje…" />}

      {!error && today && (
        <div className="mt-8 space-y-6">
          {today.conflicts.length > 0 && (
            <div role="alert" className="rounded-lg border border-critical/40 bg-critical/5 p-6">
              <h2 className="text-sm font-medium text-critical">Precisa da sua decisão</h2>
              <ul className="mt-3 space-y-2">
                {today.conflicts.map((c, i) => (
                  <li key={i} className="text-sm text-ink">
                    {c.severity === 'BLOCKING' ? '⚠ ' : '· '}
                    {c.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Card>
            <h2 className="text-sm font-medium text-inkMuted">Agenda de hoje</h2>
            {today.events.length === 0 ? (
              <p className="mt-3 text-sm text-inkMuted">Nada na agenda para hoje.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {today.events.map((ev) => {
                  const who = responsibleName(ev.responsible_person_id);
                  return (
                    <li key={ev.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-inkMuted">
                          {new Date(ev.starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-ink">{ev.title}</span>
                        <StatusBadge domain="calendarCategory" value={ev.category} />
                      </div>
                      {who && (
                        <span className="flex shrink-0 items-center gap-1.5 text-xs text-inkMuted">
                          <PersonAvatar person={{ id: ev.responsible_person_id!, displayName: who }} size="sm" />
                          {who}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="text-sm font-medium text-inkMuted">Pendências</h2>
            {today.tasks.length === 0 ? (
              <p className="mt-3 text-sm text-inkMuted">Nenhuma tarefa pendente.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {today.tasks.map((t) => {
                  const who = responsibleName(t.responsible_person_id);
                  return (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="text-ink">{t.title}</span>
                      <div className="flex shrink-0 items-center gap-3">
                        {who && <span className="text-xs text-inkMuted">com {who}</span>}
                        <StatusBadge domain="task" value={t.status} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {today.routines.length > 0 && (
            <Card>
              <h2 className="text-sm font-medium text-inkMuted">Rotinas</h2>
              {today.routines.map((r) => (
                <div key={r.id} className="mt-3">
                  <p className="text-sm font-medium text-ink">{r.title}</p>
                  <ul className="mt-1 divide-y divide-border">
                    {r.routine_items.map((item) => (
                      <li key={item.id} className="flex items-center justify-between py-1.5 text-sm">
                        <span className={item.completed_at ? 'text-inkMuted line-through' : 'text-ink'}>{item.title}</span>
                        {item.completed_at && <span className="text-xs text-inkMuted">concluído</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Card>
          )}

          {activity && activity.length > 0 && (
            <Card>
              <h2 className="text-sm font-medium text-inkMuted">Atividade da rede</h2>
              <ul className="mt-3 space-y-2">
                {activity.map((item, i) => (
                  <li key={i} className="text-sm text-ink">
                    <span className="mr-2 text-xs text-inkMuted">
                      {new Date(item.occurredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {item.message}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {!error && !loading && people && people.length > 0 && !today && (
        <p className="mt-8 text-sm text-inkMuted">
          Selecione uma pessoa acima, ou vá para a{' '}
          <Link href="/app/capture" className="text-primary underline">
            Caixa de Entrada
          </Link>{' '}
          para revisar o que chegou.
        </p>
      )}
    </div>
  );
}
