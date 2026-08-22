'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Input, Select, LoadingState, ErrorState, EmptyState, FormActions } from '@/components/ui';

interface FamilyUnitOption {
  family_unit_id: string;
  family_units: { id: string; name: string };
}

/** POST /dependents — mesma chamada já usada em /app/people; funciona tanto para dependentes quanto para outro adulto da família (sem data de nascimento → ADULTO). */
export function PessoaForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [units, setUnits] = useState<FamilyUnitOption[] | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [familyUnitId, setFamilyUnitId] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    setLoadError(null);
    apiFetch<FamilyUnitOption[]>('/family-units')
      .then((u) => {
        setUnits(u);
        if (u[0]) setFamilyUnitId(u[0].family_unit_id);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Erro ao carregar famílias.'));
  }

  useEffect(load, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!familyUnitId) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/dependents', {
        method: 'POST',
        body: JSON.stringify({ displayName, birthDate: birthDate || undefined, familyUnitId }),
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao adicionar pessoa.');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <ErrorState description={loadError} onRetry={load} />;
  if (units === null) return <LoadingState label="Carregando famílias…" />;
  if (units.length === 0) {
    return (
      <EmptyState
        title="Crie uma família primeiro"
        description="É preciso ter uma unidade familiar antes de adicionar uma pessoa a ela."
      />
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label="Nome" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Nome completo" />
        <Input
          type="date"
          label="Data de nascimento (opcional)"
          hint="Deixe em branco para cadastrar um adulto."
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
        />
        {units.length > 1 && (
          <Select label="Unidade familiar" value={familyUnitId} onChange={(e) => setFamilyUnitId(e.target.value)}>
            {units.map((u) => (
              <option key={u.family_unit_id} value={u.family_unit_id}>
                {u.family_units?.name}
              </option>
            ))}
          </Select>
        )}
        {error && <ErrorState description={error} />}
        <FormActions submitLabel="Adicionar pessoa" onCancel={onCancel} busy={busy} disabled={!displayName.trim()} />
      </form>
    </Card>
  );
}
