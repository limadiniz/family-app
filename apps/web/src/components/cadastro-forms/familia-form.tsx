'use client';

import { useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Input, ErrorState, FormActions } from '@/components/ui';

/** POST /family-units — mesma chamada já usada em /app/family. */
export function FamiliaForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/family-units', { method: 'POST', body: JSON.stringify({ name }) });
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao criar unidade familiar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Nome da unidade familiar"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Família da Ana"
          hint="Útil quando há mais de uma casa — ex.: pais separados, cada um com sua unidade."
        />
        {error && <ErrorState description={error} />}
        <FormActions submitLabel="Criar família" onCancel={onCancel} busy={busy} disabled={!name.trim()} />
      </form>
    </Card>
  );
}
