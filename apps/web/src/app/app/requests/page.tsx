'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { PageHeader, Button, LoadingState, ErrorState, EmptyState, StatusBadge } from '@/components/ui';

interface FamilyRequest {
  id: string;
  type: string;
  status: string;
  requested_by_person_id: string;
  requested_to_person_id: string;
  note: string | null;
  created_at: string;
}

/**
 * Family Request Engine (§30-37). Responsibility never changes silently
 * — a request must be created, sent, and explicitly accepted before its
 * effect (e.g. reassigning a pickup) applies.
 */
export default function RequestsPage() {
  const [incoming, setIncoming] = useState<FamilyRequest[] | null>(null);
  const [outgoing, setOutgoing] = useState<FamilyRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<FamilyRequest[]>('/requests/incoming').then(setIncoming).catch((err) => setError(err.message));
    apiFetch<FamilyRequest[]>('/requests/outgoing').then(setOutgoing).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function act(id: string, action: 'accept' | 'decline' | 'cancel') {
    setError(null);
    try {
      await apiFetch(`/requests/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro inesperado.');
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Solicitações" description="Pedidos entre responsáveis — nada muda até que a outra pessoa aceite." />

      {error && (
        <div className="mt-4">
          <ErrorState description={error} onRetry={load} />
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium text-inkMuted">Recebidas</h2>
        <div className="mt-3 space-y-3">
          {!error && incoming === null && <LoadingState label="Carregando solicitações recebidas…" />}
          {incoming?.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <StatusBadge domain="requestType" value={r.type} />
                <StatusBadge domain="request" value={r.status} />
              </div>
              {r.note && <p className="mt-2 text-sm text-inkMuted">{r.note}</p>}
              {r.status === 'SENT' || r.status === 'VIEWED' ? (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => act(r.id, 'accept')}>
                    Aceitar
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => act(r.id, 'decline')}>
                    Recusar
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          {incoming && incoming.length === 0 && <EmptyState title="Nenhuma solicitação recebida" />}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-inkMuted">Enviadas</h2>
        <div className="mt-3 space-y-3">
          {!error && outgoing === null && <LoadingState label="Carregando solicitações enviadas…" />}
          {outgoing?.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <StatusBadge domain="requestType" value={r.type} />
                <StatusBadge domain="request" value={r.status} />
              </div>
              {r.note && <p className="mt-2 text-sm text-inkMuted">{r.note}</p>}
              {r.status === 'SENT' && (
                <Button size="sm" variant="secondary" className="mt-3" onClick={() => act(r.id, 'cancel')}>
                  Cancelar
                </Button>
              )}
            </div>
          ))}
          {outgoing && outgoing.length === 0 && <EmptyState title="Nenhuma solicitação enviada" />}
        </div>
      </section>
    </div>
  );
}
