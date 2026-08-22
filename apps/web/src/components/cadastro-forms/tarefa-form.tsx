'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Input, Select, Textarea, LoadingState, ErrorState, FormActions, PersonPicker } from '@/components/ui';

interface Person {
  id: string;
  display_name: string;
}

/** POST /tasks — mesmo endpoint de /app/tasks, aqui com os campos opcionais que a lista rápida daquela página não expunha. */
export function TarefaForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [subjectPersonId, setSubjectPersonId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    setLoadError(null);
    apiFetch<Person[]>('/persons')
      .then(setPeople)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Erro ao carregar pessoas.'));
  }

  useEffect(load, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description: description || undefined,
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          priority,
          subjectPersonId: subjectPersonId || undefined,
        }),
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao criar tarefa.');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <ErrorState description={loadError} onRetry={load} />;
  if (people === null) return <LoadingState label="Carregando pessoas…" />;

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label="O que precisa ser feito?" required value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea label="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="due-at">
              Prazo (opcional)
            </label>
            <input
              id="due-at"
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="min-h-touch w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-ink"
            />
          </div>
          <Select label="Prioridade" className="flex-1" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="LOW">Baixa</option>
            <option value="MEDIUM">Média</option>
            <option value="HIGH">Alta</option>
          </Select>
        </div>
        {people.length > 0 && (
          <PersonPicker
            label="Sobre quem é? (opcional)"
            people={people.map((p) => ({ id: p.id, displayName: p.display_name }))}
            value={subjectPersonId}
            onChange={(id) => setSubjectPersonId(id === subjectPersonId ? null : id)}
          />
        )}
        {error && <ErrorState description={error} />}
        <FormActions submitLabel="Criar tarefa" onCancel={onCancel} busy={busy} disabled={!title.trim()} />
      </form>
    </Card>
  );
}
