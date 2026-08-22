'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { PageHeader, Input, Button, LoadingState, ErrorState, EmptyState, StatusBadge } from '@/components/ui';

interface Task {
  id: string;
  title: string;
  status: string;
  due_at: string | null;
  priority: string;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Task[]>('/tasks').then(setTasks).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function create() {
    if (!title.trim()) return;
    try {
      await apiFetch('/tasks', { method: 'POST', body: JSON.stringify({ title }) });
      setTitle('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro inesperado.');
    }
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
      <PageHeader title="Tarefas" />

      <div className="mt-6 flex gap-2">
        <Input
          className="flex-1"
          placeholder="Nova tarefa..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
        />
        <Button onClick={create}>Adicionar</Button>
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
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <input type="checkbox" checked={t.status === 'DONE'} onChange={() => toggle(t)} />
                <span className={t.status === 'DONE' ? 'flex-1 text-inkMuted line-through' : 'flex-1 text-ink'}>{t.title}</span>
                <StatusBadge domain="taskPriority" value={t.priority} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
