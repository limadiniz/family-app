'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

interface FamilyUnitOption {
  family_unit_id: string;
  family_units: { id: string; name: string };
}
interface Person {
  id: string;
  display_name: string;
  is_minor: boolean;
  person_type: string;
}

export default function ChildrenPage() {
  const [units, setUnits] = useState<FamilyUnitOption[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [familyUnitId, setFamilyUnitId] = useState('');
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    apiFetch<FamilyUnitOption[]>('/family-units').then((u) => {
      setUnits(u);
      if (u[0]) setFamilyUnitId(u[0].family_unit_id);
    });
    apiFetch<Person[]>('/persons').then((p) => setPeople(p.filter((x) => x.is_minor)));
  }

  useEffect(refresh, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!familyUnitId) {
      setError('Crie uma unidade familiar antes de adicionar um dependente.');
      return;
    }
    try {
      await apiFetch('/dependents', {
        method: 'POST',
        body: JSON.stringify({ displayName, birthDate: birthDate || undefined, familyUnitId }),
      });
      setDisplayName('');
      setBirthDate('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar dependente.');
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-ink">Filhos</h1>

      <form onSubmit={handleCreate} className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex gap-2">
          <input
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Nome"
            className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm"
          />
        </div>
        <select
          value={familyUnitId}
          onChange={(e) => setFamilyUnitId(e.target.value)}
          className="rounded-md border border-border bg-bg px-3 py-2 text-sm"
        >
          {units.map((u) => (
            <option key={u.family_unit_id} value={u.family_unit_id}>
              {u.family_units?.name}
            </option>
          ))}
        </select>
        <button type="submit" className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Adicionar dependente
        </button>
        {error && <p className="text-sm text-critical">{error}</p>}
      </form>

      <ul className="mt-6 space-y-2">
        {people.map((p) => (
          <li key={p.id} className="rounded-lg border border-border bg-surface p-4">
            <p className="font-medium text-ink">{p.display_name}</p>
            <p className="text-xs text-inkMuted">{p.person_type}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
