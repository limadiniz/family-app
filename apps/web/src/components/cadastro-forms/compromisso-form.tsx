'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Input, Select, Textarea, LoadingState, ErrorState, EmptyState, FormActions, PersonPicker } from '@/components/ui';
import { translateStatus } from '@/lib/status-i18n';

interface Person {
  id: string;
  display_name: string;
}

const CATEGORIES = ['SCHOOL', 'HEALTH', 'SPORT', 'FAMILY', 'MEDICATION', 'DOCUMENT', 'FINANCE', 'OTHER'];

/**
 * POST /calendar-events. O endpoint já existia (usado por outras partes
 * do sistema), mas não tinha nenhum formulário — /app/calendar em si
 * ainda é só um placeholder (visualização de agenda é um recurso maior,
 * fora do escopo deste formulário de criação).
 */
export function CompromissoForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [subjectPersonId, setSubjectPersonId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('OTHER');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [responsiblePersonId, setResponsiblePersonId] = useState('');
  const [notes, setNotes] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    setLoadError(null);
    apiFetch<Person[]>('/persons')
      .then((list) => {
        setPeople(list);
        if (list.length > 0) setSubjectPersonId(list[0].id);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Erro ao carregar pessoas.'));
  }

  useEffect(load, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subjectPersonId || !startsAt) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/calendar-events', {
        method: 'POST',
        body: JSON.stringify({
          subjectPersonId,
          title,
          category,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
          responsiblePersonId: responsiblePersonId || undefined,
          notes: notes || undefined,
        }),
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao criar compromisso.');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <ErrorState description={loadError} onRetry={load} />;
  if (people === null) return <LoadingState label="Carregando pessoas…" />;
  if (people.length === 0) {
    return <EmptyState title="Cadastre uma pessoa primeiro" description="Todo compromisso pertence a alguém da família." />;
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label="Título" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Consulta com o pediatra" />
        <PersonPicker
          label="Sobre quem é?"
          people={people.map((p) => ({ id: p.id, displayName: p.display_name }))}
          value={subjectPersonId}
          onChange={setSubjectPersonId}
        />
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="starts-at">
              Início
            </label>
            <input
              id="starts-at"
              type="datetime-local"
              required
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="min-h-touch w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-ink"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="ends-at">
              Fim (opcional)
            </label>
            <input
              id="ends-at"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="min-h-touch w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-ink"
            />
          </div>
        </div>
        <Select label="Categoria" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {translateStatus('calendarCategory', c).label}
            </option>
          ))}
        </Select>
        {people.length > 1 && (
          <Select label="Responsável (opcional)" value={responsiblePersonId} onChange={(e) => setResponsiblePersonId(e.target.value)}>
            <option value="">Ninguém definido</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </Select>
        )}
        <Textarea label="Notas (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        {error && <ErrorState description={error} />}
        <FormActions submitLabel="Criar compromisso" onCancel={onCancel} busy={busy} disabled={!title.trim() || !startsAt} />
      </form>
    </Card>
  );
}
