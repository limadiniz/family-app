'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';

interface Person {
  id: string;
  display_name: string;
  person_type: string;
}

interface TodayResponse {
  date: string;
  events: Array<{ id: string; title: string; starts_at: string; category: string }>;
  tasks: Array<{ id: string; title: string; status: string; due_at: string | null }>;
  routines: Array<{ id: string; title: string; routine_items: Array<{ id: string; title: string; completed_at: string | null }> }>;
}

/**
 * "Hoje" — Family Command Center home (§24-29). Aggregates agenda +
 * tasks + routines for the selected family member via GET /api/v1/today.
 */
export default function TodayPage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Person[]>('/persons')
      .then((list) => {
        setPeople(list);
        if (list.length > 0) setSelectedPersonId(list[0].id);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedPersonId) return;
    setToday(null);
    apiFetch<TodayResponse>(`/today?subjectPersonId=${selectedPersonId}`)
      .then(setToday)
      .catch((err) => setError(err.message));
  }, [selectedPersonId]);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Hoje</h1>
          <p className="mt-1 text-sm text-inkMuted">
            {new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date())}
          </p>
        </div>
        {people && people.length > 1 && (
          <select
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
            value={selectedPersonId ?? ''}
            onChange={(e) => setSelectedPersonId(e.target.value)}
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="mt-6 text-sm text-critical">{error}</p>}

      {people && people.length === 0 && (
        <div className="mt-8 rounded-lg border border-border bg-surface p-6">
          <p className="text-ink">Sua família ainda não tem ninguém cadastrado.</p>
          <Link href="/app/onboarding" className="mt-3 inline-block text-sm text-primary underline">
            Continuar cadastro
          </Link>
        </div>
      )}

      {today && (
        <div className="mt-8 space-y-6">
          <section className="rounded-lg border border-border bg-surface p-6">
            <h2 className="text-sm font-medium text-inkMuted">Agenda de hoje</h2>
            {today.events.length === 0 ? (
              <p className="mt-3 text-sm text-inkMuted">Nada na agenda para hoje.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {today.events.map((ev) => (
                  <li key={ev.id} className="py-2">
                    <span className="mr-3 text-xs text-inkMuted">
                      {new Date(ev.starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-ink">{ev.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-border bg-surface p-6">
            <h2 className="text-sm font-medium text-inkMuted">Pendências</h2>
            {today.tasks.length === 0 ? (
              <p className="mt-3 text-sm text-inkMuted">Nenhuma tarefa pendente.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {today.tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-2">
                    <span className="text-ink">{t.title}</span>
                    <span className="text-xs text-inkMuted">{t.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {today.routines.length > 0 && (
            <section className="rounded-lg border border-border bg-surface p-6">
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
            </section>
          )}
        </div>
      )}
    </div>
  );
}
