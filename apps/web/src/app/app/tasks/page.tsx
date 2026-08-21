'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';

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
      <h1 className="text-2xl font-semibold text-ink">Tarefas</h1>

      <div className="mt-6 flex gap-2">
        <input
          className="flex-1 rounded-md border border-border p-2 text-sm text-ink"
          placeholder="Nova tarefa..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
        />
        <button onClick={create} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white">
          Adicionar
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-critical">{error}</p>}

      <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface">
        {(tasks ?? []).map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-3">
            <input type="checkbox" checked={t.status === 'DONE'} onChange={() => toggle(t)} />
            <span className={t.status === 'DONE' ? 'flex-1 text-inkMuted line-through' : 'flex-1 text-ink'}>{t.title}</span>
            <span className="text-xs text-inkMuted">{t.priority}</span>
          </li>
        ))}
        {tasks && tasks.length === 0 && <li className="px-4 py-3 text-sm text-inkMuted">Nenhuma tarefa ainda.</li>}
      </ul>
    </div>
  );
}
