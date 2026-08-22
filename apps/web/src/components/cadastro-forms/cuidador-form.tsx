'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Textarea, LoadingState, ErrorState, EmptyState, FormActions, PersonPicker } from '@/components/ui';
import { translateStatus } from '@/lib/status-i18n';

interface Person {
  id: string;
  display_name: string;
}

const CAPABILITY_KEYS = [
  'CAN_PICKUP',
  'CAN_TRANSPORT',
  'CAN_STAY_OVERNIGHT',
  'CAN_ATTEND_MEDICAL_APPOINTMENT',
  'CAN_ADMINISTER_REGISTERED_MEDICATION',
  'CAN_RECEIVE_SCHOOL_INFORMATION',
  'CAN_MAKE_PURCHASES',
  'CAN_HANDLE_DOCUMENTS',
  'CAN_VIEW_EMERGENCY_PROFILE',
];

/**
 * POST /care-network/members. Só concede acesso a alguém que JÁ é
 * pessoa cadastrada na família (§ "cuidador" nunca é criado do zero
 * aqui — não existe endpoint pra isso) e começa como PENDING, não ACTIVE
 * — a Rede de Cuidado é quem ativa (mesmo comportamento de sempre).
 */
export function CuidadorForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [subjectPersonId, setSubjectPersonId] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
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

  function toggleCapability(key: string) {
    setCapabilities((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subjectPersonId || !personId) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/care-network/members', {
        method: 'POST',
        body: JSON.stringify({
          subjectPersonId,
          personId,
          capabilities,
          note: note || undefined,
          validFrom: validFrom ? new Date(validFrom).toISOString() : undefined,
          validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
        }),
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao adicionar cuidador.');
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
        description="É preciso ter pelo menos duas pessoas na família: quem recebe o cuidado e quem cuida."
      />
    );
  }

  const caregiverOptions = people.filter((p) => p.id !== subjectPersonId);

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <PersonPicker
          label="Quem recebe o cuidado?"
          people={people.map((p) => ({ id: p.id, displayName: p.display_name }))}
          value={subjectPersonId}
          onChange={(id) => {
            setSubjectPersonId(id);
            if (id === personId) setPersonId(null);
          }}
        />
        <PersonPicker
          label="Quem vai cuidar?"
          people={caregiverOptions.map((p) => ({ id: p.id, displayName: p.display_name }))}
          value={personId}
          onChange={setPersonId}
        />
        <div>
          <p className="mb-2 text-sm font-medium text-ink">O que essa pessoa pode fazer?</p>
          <div className="flex flex-col gap-2">
            {CAPABILITY_KEYS.map((key) => (
              <label key={key} className="flex min-h-touch items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={capabilities.includes(key)} onChange={() => toggleCapability(key)} />
                {translateStatus('capability', key).label}
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="valid-from">
              Válido a partir de (opcional)
            </label>
            <input
              id="valid-from"
              type="datetime-local"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              className="min-h-touch w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-ink"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="valid-until">
              Válido até (opcional)
            </label>
            <input
              id="valid-until"
              type="datetime-local"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="min-h-touch w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-ink"
            />
          </div>
        </div>
        <Textarea label="Observações (opcional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        {error && <ErrorState description={error} />}
        <FormActions submitLabel="Adicionar cuidador" onCancel={onCancel} busy={busy} disabled={!subjectPersonId || !personId} />
      </form>
    </Card>
  );
}
