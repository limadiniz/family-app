'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import {
  PageHeader,
  PersonPicker,
  PersonAvatar,
  StatusBadge,
  Card,
  Select,
  Button,
  EmptyState,
  LoadingState,
  ErrorState,
  type PersonSummary,
} from '@/components/ui';

interface Person {
  id: string;
  display_name: string;
  person_type: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  category: string;
  starts_at: string;
  ends_at: string | null;
  subject_person_id: string;
  responsible_person_id: string | null;
  notes: string | null;
}

const RANGE_OPTIONS = [
  { value: '7', label: 'Próximos 7 dias' },
  { value: '30', label: 'Próximos 30 dias' },
  { value: '90', label: 'Próximos 3 meses' },
];

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function formatDayLabel(key: string): string {
  const date = new Date(`${key}T00:00:00`);
  const today = startOfToday();
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(date);
  const full = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' }).format(date);
  if (diffDays === 0) return `Hoje · ${full}`;
  if (diffDays === 1) return `Amanhã · ${full}`;
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} · ${full}`;
}

/**
 * "Agenda" (§6.4, área Agenda): visão de lista dos próximos compromissos,
 * agrupados por dia — não um grid de calendário completo (mês/semana),
 * um investimento maior que o proporcional a este passo do P1 quando o
 * que as famílias precisam primeiro é responder "o que vem por aí". A
 * criação continua pela Central de Cadastros (Compromisso), que já
 * grava em GET /calendar-events — esta página é a primeira tela que lê
 * esse dado de volta.
 */
export default function CalendarPage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState('7');
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadPeople = useCallback(() => {
    apiFetch<Person[]>('/persons')
      .then((list) => {
        setPeople(list);
        if (list.length > 0) setSelectedPersonId((current) => current ?? list[0].id);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(loadPeople, [loadPeople, reloadKey]);

  const loadEvents = useCallback(() => {
    if (!selectedPersonId) return;
    setError(null);
    setEvents(null);
    const from = startOfToday();
    const to = new Date(from.getTime() + Number(rangeDays) * 86400000);
    const params = new URLSearchParams({
      subjectPersonId: selectedPersonId,
      from: from.toISOString(),
      to: to.toISOString(),
    });
    apiFetch<CalendarEvent[]>(`/calendar-events?${params.toString()}`)
      .then((res) => {
        if (!Array.isArray(res)) throw new Error('Resposta inesperada do servidor.');
        setEvents(res);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro inesperado.'));
  }, [selectedPersonId, rangeDays]);

  useEffect(loadEvents, [loadEvents, reloadKey]);

  function responsibleName(personId: string | null): string | null {
    if (!personId) return null;
    if (personId === selectedPersonId) return null;
    return people?.find((p) => p.id === personId)?.display_name ?? null;
  }

  const personSummaries: PersonSummary[] = (people ?? []).map((p) => ({
    id: p.id,
    displayName: p.display_name,
    isMinor: p.person_type !== 'ADULT',
  }));

  const groups = useMemo(() => {
    if (!events) return [];
    const byDay = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = dayKey(ev.starts_at);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(ev);
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({
        key,
        items: [...items].sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
      }));
  }, [events]);

  const loading = people === null || (selectedPersonId !== null && events === null && !error);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Agenda"
        description="O que vem por aí, dia a dia."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {people && people.length > 1 && (
              <PersonPicker people={personSummaries} value={selectedPersonId} onChange={setSelectedPersonId} />
            )}
            <Select value={rangeDays} onChange={(e) => setRangeDays(e.target.value)}>
              {RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
            <Link href="/app/cadastros/compromisso">
              <Button variant="secondary">+ Compromisso</Button>
            </Link>
          </div>
        }
      />

      {error && (
        <div className="mt-8">
          <ErrorState title="Não foi possível carregar a agenda" description={error} onRetry={() => setReloadKey((k) => k + 1)} />
        </div>
      )}

      {!error && people && people.length === 0 && (
        <div className="mt-8">
          <EmptyState
            title="Sua família ainda não tem ninguém cadastrado"
            description="Cadastre ao menos uma pessoa para começar a organizar a agenda dela."
          />
          <Link href="/app/onboarding" className="mt-3 inline-block text-sm text-primary underline">
            Continuar cadastro
          </Link>
        </div>
      )}

      {!error && loading && people && people.length > 0 && <LoadingState label="Carregando a agenda…" />}

      {!error && !loading && events && groups.length === 0 && (
        <div className="mt-8">
          <EmptyState title="Nada na agenda para este período" description="Adicione um compromisso para começar a preencher a agenda." />
          <Link href="/app/cadastros/compromisso" className="mt-3 inline-block text-sm text-primary underline">
            + Compromisso
          </Link>
        </div>
      )}

      {!error && !loading && groups.length > 0 && (
        <div className="mt-8 space-y-6">
          {groups.map((group) => (
            <Card key={group.key}>
              <h2 className="text-sm font-medium text-inkMuted">{formatDayLabel(group.key)}</h2>
              <ul className="mt-3 divide-y divide-border">
                {group.items.map((ev) => {
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
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
