'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';

interface CaptureProposal {
  id: string;
  target_type: string;
  proposed_fields: Record<string, unknown>;
  status: string;
  confidence: number | null;
}

interface CaptureItem {
  id: string;
  status: string;
  category: string | null;
  raw_text: string | null;
  created_at: string;
  capture_proposals: CaptureProposal[];
}

/**
 * Universal Family Inbox (§13-23). MVP capture surface: paste text
 * (a forwarded message, a school announcement typed in, etc.) — the
 * heuristic Capture Engine (packages/capture-engine; see ADR/gap
 * analysis for why it's heuristic and not a real OCR/LLM provider yet)
 * classifies it and proposes a calendar event or task. Nothing is saved
 * to your agenda until you confirm.
 */
export default function CapturePage() {
  const [text, setText] = useState('');
  const [items, setItems] = useState<CaptureItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<CaptureItem[]>('/capture/items')
      .then(setItems)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/capture/items', { method: 'POST', body: JSON.stringify({ source: 'TEXT', rawText: text }) });
      setText('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro inesperado.');
    } finally {
      setBusy(false);
    }
  }

  async function confirm(proposalId: string) {
    setError(null);
    try {
      await apiFetch(`/capture/proposals/${proposalId}/confirm`, { method: 'POST', body: JSON.stringify({}) });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro inesperado.');
    }
  }

  async function reject(proposalId: string) {
    setError(null);
    try {
      await apiFetch(`/capture/proposals/${proposalId}/reject`, { method: 'POST' });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro inesperado.');
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-ink">Caixa de Entrada</h1>
      <p className="mt-1 text-sm text-inkMuted">
        Jogue aqui um texto, comunicado ou mensagem — a plataforma tenta entender e propõe um evento ou tarefa, mas nada é
        salvo na agenda sem sua confirmação.
      </p>

      <div className="mt-6 rounded-lg border border-border bg-surface p-4">
        <textarea
          className="w-full resize-none rounded-md border border-border p-3 text-sm text-ink"
          rows={3}
          placeholder="Ex.: Reunião de pais dia 25/08 às 19h."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          onClick={submit}
          disabled={busy || !text.trim()}
          className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Enviar
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-critical">{error}</p>}

      <div className="mt-8 space-y-4">
        {(items ?? []).map((item) => (
          <div key={item.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-inkMuted">{item.status}</span>
              {item.category && <span className="text-xs text-inkMuted">{item.category}</span>}
            </div>
            {item.raw_text && <p className="mt-2 text-sm text-ink">{item.raw_text}</p>}

            {item.capture_proposals?.map((p) =>
              p.status === 'PENDING' ? (
                <div key={p.id} className="mt-3 rounded-md bg-surfaceMuted p-3">
                  <p className="text-xs text-inkMuted">
                    Proposta ({p.target_type}) — confiança {p.confidence != null ? Math.round(p.confidence * 100) : '?'}%
                  </p>
                  <pre className="mt-1 whitespace-pre-wrap text-xs text-ink">{JSON.stringify(p.proposed_fields, null, 2)}</pre>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => confirm(p.id)} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white">
                      Confirmar
                    </button>
                    <button onClick={() => reject(p.id)} className="rounded-md border border-border px-3 py-1.5 text-xs text-ink">
                      Descartar
                    </button>
                  </div>
                </div>
              ) : null,
            )}
          </div>
        ))}
        {items && items.length === 0 && <p className="text-sm text-inkMuted">Sua caixa de entrada está vazia.</p>}
      </div>
    </div>
  );
}
