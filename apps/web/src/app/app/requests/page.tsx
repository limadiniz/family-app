'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';

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
      <h1 className="text-2xl font-semibold text-ink">Solicitações</h1>
      <p className="mt-1 text-sm text-inkMuted">Pedidos entre responsáveis — nada muda até que a outra pessoa aceite.</p>

      {error && <p className="mt-4 text-sm text-critical">{error}</p>}

      <section className="mt-8">
        <h2 className="text-sm font-medium text-inkMuted">Recebidas</h2>
        <div className="mt-3 space-y-3">
          {(incoming ?? []).map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">{r.type}</span>
                <span className="text-xs text-inkMuted">{r.status}</span>
              </div>
              {r.note && <p className="mt-1 text-sm text-inkMuted">{r.note}</p>}
              {r.status === 'SENT' || r.status === 'VIEWED' ? (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => act(r.id, 'accept')} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white">
                    Aceitar
                  </button>
                  <button onClick={() => act(r.id, 'decline')} className="rounded-md border border-border px-3 py-1.5 text-xs text-ink">
                    Recusar
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {incoming && incoming.length === 0 && <p className="text-sm text-inkMuted">Nenhuma solicitação recebida.</p>}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-inkMuted">Enviadas</h2>
        <div className="mt-3 space-y-3">
          {(outgoing ?? []).map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">{r.type}</span>
                <span className="text-xs text-inkMuted">{r.status}</span>
              </div>
              {r.note && <p className="mt-1 text-sm text-inkMuted">{r.note}</p>}
              {r.status === 'SENT' && (
                <button onClick={() => act(r.id, 'cancel')} className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs text-ink">
                  Cancelar
                </button>
              )}
            </div>
          ))}
          {outgoing && outgoing.length === 0 && <p className="text-sm text-inkMuted">Nenhuma solicitação enviada.</p>}
        </div>
      </section>
    </div>
  );
}
