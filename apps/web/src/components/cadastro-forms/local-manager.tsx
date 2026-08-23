'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Button, Card, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { LocalForm, PLACE_TYPE_LABELS, type ResidenceRecord } from './local-form';

export function LocalManager({ onCancel }: { onCancel: () => void }) {
  const [places, setPlaces] = useState<ResidenceRecord[] | null>(null);
  const [editing, setEditing] = useState<ResidenceRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setPlaces(await apiFetch<ResidenceRecord[]>('/residences'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os locais.');
    }
  }

  useEffect(() => { void load(); }, []);

  function openNew() {
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(place: ResidenceRecord) {
    setEditing(place);
    setShowForm(true);
  }

  if (showForm) {
    return (
      <div className="flex flex-col gap-3">
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setShowForm(false)}>
          ← Voltar para locais
        </Button>
        <LocalForm
          key={editing?.id ?? 'new'}
          initialResidence={editing}
          onSuccess={() => { setShowForm(false); setEditing(null); void load(); }}
          onCancel={() => setShowForm(false)}
        />
      </div>
    );
  }

  if (places === null) return <LoadingState label="Carregando locais da família…" />;
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium text-ink">Locais da família</p>
          <p className="mt-1 text-sm text-inkMuted">Cadastre uma vez e selecione o local em compromissos, tarefas e rotinas.</p>
        </div>
        <Button type="button" size="sm" onClick={openNew}>+ Novo local</Button>
      </Card>
      {places.length === 0 ? (
        <EmptyState title="Nenhum local cadastrado" description="Comece pela casa, escola ou outro lugar que faça parte da rotina." action={{ label: 'Cadastrar primeiro local', onClick: openNew }} />
      ) : (
        <div className="grid gap-3">
          {places.map((place) => (
            <Card key={place.id} className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-medium text-ink">{place.label}</p>
                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-primary">{PLACE_TYPE_LABELS[place.place_type] ?? 'Outro'}</p>
                <p className="mt-1 text-sm text-inkMuted">{[place.address_line, place.city, place.state].filter(Boolean).join(' · ') || 'Endereço ainda não informado'}</p>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={() => openEdit(place)}>Editar</Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
