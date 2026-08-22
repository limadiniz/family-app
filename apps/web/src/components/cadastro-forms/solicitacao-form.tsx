'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Select, Textarea, LoadingState, ErrorState, EmptyState, FormActions, PersonPicker } from '@/components/ui';
import { translateStatus } from '@/lib/status-i18n';

interface Person {
  id: string;
  display_name: string;
}

const REQUEST_TYPES = [
  'RESPONSIBILITY_TRANSFER',
  'SCHEDULE_CHANGE',
  'PICKUP_REQUEST',
  'DROPOFF_REQUEST',
  'RESIDENCE_CHANGE',
  'EXPENSE_APPROVAL',
  'PERMISSION_REQUEST',
  'DOCUMENT_REQUEST',
  'INFORMATION_REQUEST',
  'OTHER',
];

/**
 * POST /requests. §30-37: nada muda até a outra pessoa aceitar — este
 * formulário só cria o pedido, exatamente como a Rede de Cuidado e a
 * página Solicitações já tratam o restante do ciclo de vida.
 */
export function SolicitacaoForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [type, setType] = useState('OTHER');
  const [requestedToPersonId, setRequestedToPersonId] = useState<string | null>(null);
  const [subjectPersonId, setSubjectPersonId] = useState<string | null>(null);
  const [note, setNote] = useState('');
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
    if (!requestedToPersonId) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/requests', {
        method: 'POST',
        body: JSON.stringify({
          type,
          requestedToPersonId,
          subjectPersonId: subjectPersonId || undefined,
          note: note || undefined,
        }),
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao criar solicitação.');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <ErrorState description={loadError} onRetry={load} />;
  if (people === null) return <LoadingState label="Carregando pessoas…" />;
  if (people.length < 2) {
    return (
      <EmptyState
        title="Cadastre mais uma pessoa primeiro"
        description="Uma solicitação sempre vai de você para outro responsável."
      />
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Select label="Tipo de solicitação" value={type} onChange={(e) => setType(e.target.value)}>
          {REQUEST_TYPES.map((t) => (
            <option key={t} value={t}>
              {translateStatus('requestType', t).label}
            </option>
          ))}
        </Select>
        <PersonPicker
          label="Pedir para quem?"
          people={people.map((p) => ({ id: p.id, displayName: p.display_name }))}
          value={requestedToPersonId}
          onChange={setRequestedToPersonId}
        />
        <PersonPicker
          label="Sobre quem é? (opcional)"
          people={people.map((p) => ({ id: p.id, displayName: p.display_name }))}
          value={subjectPersonId}
          onChange={(id) => setSubjectPersonId(id === subjectPersonId ? null : id)}
        />
        <Textarea label="Mensagem (opcional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        {error && <ErrorState description={error} />}
        <FormActions submitLabel="Enviar solicitação" onCancel={onCancel} busy={busy} disabled={!requestedToPersonId} />
      </form>
    </Card>
  );
}
