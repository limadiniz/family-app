'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { PageHeader, Input, Button, LoadingState, ErrorState, EmptyState, StatusBadge } from '@/components/ui';

interface FamilyUnit {
  family_unit_id: string;
  role: string;
  family_units: { id: string; name: string; kind: string };
}

/**
 * Unidades familiares (§10/§68) — distinto da página Pessoas: aqui é
 * sobre as FamilyUnits em si (o "onde" — pode haver mais de uma, ex.
 * pais separados), não sobre as pessoas dentro delas.
 */
export default function FamilyPage() {
  const [units, setUnits] = useState<FamilyUnit[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setError(null);
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
      <PageHeader title="Família" description="Unidades familiares — cada uma pode ter seu próprio conjunto de pessoas e residências." />

      <form onSubmit={handleCreate} className="mt-6 flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da unidade familiar (ex: Família da Ana)"
          className="flex-1"
        />
        <Button type="submit" disabled={!name.trim()}>
          Criar
        </Button>
      </form>

      <div className="mt-6">
        {error && <ErrorState description={error} onRetry={refresh} />}

        {!error && units === null && <LoadingState label="Carregando famílias…" />}

        {!error && units && units.length === 0 && (
          <EmptyState title="Nenhuma unidade familiar ainda" description="Crie a primeira acima." />
        )}

        {!error && units && units.length > 0 && (
          <ul className="space-y-2">
            {units.map((u) => (
              <li key={u.family_unit_id} className="rounded-lg border border-border bg-surface p-4">
                <p className="font-medium text-ink">{u.family_units?.name}</p>
                <div className="mt-1">
                  <StatusBadge domain="role" value={u.role} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
