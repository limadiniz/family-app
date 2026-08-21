'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

interface FamilyUnit {
  family_unit_id: string;
  role: string;
  family_units: { id: string; name: string; kind: string };
}

export default function FamilyPage() {
  const [units, setUnits] = useState<FamilyUnit[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    apiFetch<FamilyUnit[]>('/family-units').then(setUnits).catch((err) => setError(err.message));
  }

  useEffect(refresh, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/family-units', { method: 'POST', body: JSON.stringify({ name }) });
      setName('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar unidade familiar.');
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-ink">Família</h1>

      <form onSubmit={handleCreate} className="mt-6 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da unidade familiar (ex: Família da Ana)"
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Criar
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-critical">{error}</p>}

      <ul className="mt-6 space-y-2">
        {units?.map((u) => (
          <li key={u.family_unit_id} className="rounded-lg border border-border bg-surface p-4">
            <p className="font-medium text-ink">{u.family_units?.name}</p>
            <p className="text-xs text-inkMuted">Seu papel: {u.role}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
