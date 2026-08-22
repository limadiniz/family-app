'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { PageHeader, Input, Select, Button, LoadingState, ErrorState, EmptyState, StatusBadge } from '@/components/ui';

interface Task {
  id: string;
  title: string;
  status: string;
  due_at: string | null;
  priority: string;
  subject_person_id: string | null;
  responsible_person_id: string | null;
}

interface Person {
  id: string;
  display_name: string;
  person_type: string;
  is_minor: boolean;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [title, setTitle] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [subjectPersonId, setSubjectPersonId] = useState('');
  const [responsiblePersonId, setResponsiblePersonId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    Promise.all([apiFetch<Task[]>('/tasks'), apiFetch<Person[]>('/persons')])
      .then(([taskList, familyPeople]) => {
        setTasks(taskList);
        setPeople(familyPeople);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function create() {
    if (!title.trim()) return;
    try {
      await apiFetch('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title,
          subjectPersonId: subjectPersonId || undefined,
          responsiblePersonId: responsiblePersonId || undefined,
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          priority,
        }),
      });
      setTitle('');
      setDueAt('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro inesperado.');
    }
  }

  function personName(personId: string | null): string | null {
    if (!personId) return null;
    return people.find((person) => person.id === personId)?.display_name ?? 'Pessoa da família';
  }

  async function toggle(task: Task) {
    const nextStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
    try {
      await apiFetch(`/tasks/${task.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro inesperado.');
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Tarefas" description="Divida o que precisa ser feito e deixe claro quem está cuidando." />

      <div className="mt-6 grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2">
        <Input
          className="sm:col-span-2"
          label="O que precisa ser feito?"
          placeholder="Ex.: Separar documentos da consulta"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <label className="text-sm text-ink">
          Para quem é
          <Select className="mt-1 w-full" value={subjectPersonId} onChange={(event) => setSubjectPersonId(event.target.value)}>
            <option value="">Família / geral</option>
            {people.map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}
          </Select>
        </label>
        <label className="text-sm text-ink">
          Quem vai cuidar
          <Select className="mt-1 w-full" value={responsiblePersonId} onChange={(event) => setResponsiblePersonId(event.target.value)}>
            <option value="">Ainda não definido</option>
            {people.filter((person) => !person.is_minor && person.person_type === 'ADULT').map((person) => (
              <option key={person.id} value={person.id}>{person.display_name}</option>
            ))}
          </Select>
        </label>
        <Input type="datetime-local" label="Prazo (opcional)" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
        <label className="text-sm text-ink">
          Prioridade
          <Select className="mt-1 w-full" value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option value="LOW">Baixa</option>
            <option value="MEDIUM">Média</option>
            <option value="HIGH">Alta</option>
          </Select>
        </label>
        <Button className="sm:col-span-2 sm:w-fit" onClick={create} disabled={!title.trim()}>Compartilhar tarefa</Button>
      </div>

      <div className="mt-6">
        {error && <ErrorState description={error} onRetry={load} />}

        {!error && tasks === null && <LoadingState label="Carregando tarefas…" />}

        {!error && tasks && tasks.length === 0 && (
          <EmptyState title="Nenhuma tarefa ainda" description="Adicione a primeira tarefa acima." />
        )}

        {!error && tasks && tasks.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                <input type="checkbox" checked={t.status === 'DONE'} onChange={() => toggle(t)} />
                <div className="min-w-0 flex-1">
                  <p className={t.status === 'DONE' ? 'text-inkMuted line-through' : 'text-ink'}>{t.title}</p>
                  <p className="mt-1 text-xs text-inkMuted">
                    {personName(t.subject_person_id) && `Para ${personName(t.subject_person_id)}`}
                    {personName(t.subject_person_id) && personName(t.responsible_person_id) && ' · '}
                    {personName(t.responsible_person_id) && `${personName(t.responsible_person_id)} cuida`}
                    {t.due_at && `${personName(t.subject_person_id) || personName(t.responsible_person_id) ? ' · ' : ''}${new Date(t.due_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                  </p>
                </div>
                <StatusBadge domain="taskPriority" value={t.priority} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
