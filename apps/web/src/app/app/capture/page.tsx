'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { translateStatus } from '@/lib/status-i18n';
import { PageHeader, StatusBadge, Card, EmptyState, PersonPicker, SensitiveDataNotice, Input, Button, type PersonSummary } from '@/components/ui';

interface Person {
  id: string;
  display_name: string;
  person_type: string;
}

interface CaptureProposal {
  id: string;
  target_type: string;
  proposed_fields: { title?: string; category?: string; date?: string; time?: string; [key: string]: unknown };
  status: string;
  confidence: number | null;
}

interface CaptureItem {
  id: string;
  status: string;
  category: string | null;
  raw_text: string | null;
  subject_person_id: string | null;
  created_at: string;
  capture_proposals: CaptureProposal[];
}

/** Edição local do cartão de revisão, indexada por proposal.id — nada disso é enviado até "Confirmar". */
interface ReviewEdits {
  title: string;
  date: string;
  time: string;
  subjectPersonId: string;
}

const MEDICAL_CATEGORIES = new Set(['MEDICAL_PRESCRIPTION', 'MEDICAL_EXAM', 'MEDICAL_APPOINTMENT']);

/**
 * Universal Family Inbox (§13-23, §8 do prompt mestre — "cartão de
 * revisão humano"). MVP capture surface: cole um texto (mensagem
 * encaminhada, comunicado da escola, etc.) — o Capture Engine
 * heurístico (packages/capture-engine) classifica e propõe um evento ou
 * tarefa. Nada é salvo na agenda sem confirmação — e a confirmação é um
 * cartão editável, não um JSON cru: title/date/time/subjectPersonId
 * viram exatamente o corpo que POST /capture/proposals/:id/confirm já
 * aceita como `edits` (apps/api/.../capture.service.ts:157 já faz
 * `{ ...proposed_fields, ...edits }` — nenhum endpoint novo, só a UI
 * para usar o que a API já suporta).
 */
export default function CapturePage() {
  const [text, setText] = useState('');
  const [items, setItems] = useState<CaptureItem[] | null>(null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyProposalId, setBusyProposalId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, ReviewEdits>>({});

  function load() {
    apiFetch<CaptureItem[]>('/capture/items')
      .then((list) => {
        setItems(list);
        // Semeia o estado de edição com o que a extração já propôs, pra
        // cada proposta pendente que ainda não tem edição local.
        setEdits((current) => {
          const next = { ...current };
          for (const item of list) {
            for (const p of item.capture_proposals ?? []) {
              if (p.status !== 'PENDING' || next[p.id]) continue;
              next[p.id] = {
                title: p.proposed_fields.title ?? '',
                date: p.proposed_fields.date ?? '',
                time: p.proposed_fields.time ?? '',
                subjectPersonId: item.subject_person_id ?? '',
              };
            }
          }
          return next;
        });
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    apiFetch<Person[]>('/persons')
      .then(setPeople)
      .catch(() => setPeople([])); // seletor de pessoa é um reforço, não bloqueia a captura em si
  }, []);

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
    const edit = edits[proposalId];
    setBusyProposalId(proposalId);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (edit?.title.trim()) body.title = edit.title.trim();
      if (edit?.date) body.date = edit.date;
      if (edit?.time) body.time = edit.time;
      if (edit?.subjectPersonId) body.subjectPersonId = edit.subjectPersonId;
      await apiFetch(`/capture/proposals/${proposalId}/confirm`, { method: 'POST', body: JSON.stringify(body) });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro inesperado.');
    } finally {
      setBusyProposalId(null);
    }
  }

  async function reject(proposalId: string) {
    setBusyProposalId(proposalId);
    setError(null);
    try {
      await apiFetch(`/capture/proposals/${proposalId}/reject`, { method: 'POST' });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro inesperado.');
    } finally {
      setBusyProposalId(null);
    }
  }

  function updateEdit(proposalId: string, patch: Partial<ReviewEdits>) {
    setEdits((current) => ({ ...current, [proposalId]: { ...current[proposalId], ...patch } as ReviewEdits }));
  }

  const personSummaries: PersonSummary[] = (people ?? []).map((p) => ({
    id: p.id,
    displayName: p.display_name,
    isMinor: p.person_type !== 'ADULT',
  }));

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Caixa de Entrada"
        description="Jogue aqui um texto, comunicado ou mensagem — a ZELII tenta entender e monta um cartão pra você revisar. Nada é salvo na agenda sem sua confirmação."
      />

      <Card className="mt-6">
        <textarea
          className="w-full resize-none rounded-md border border-border p-3 text-sm text-ink"
          rows={3}
          placeholder="Ex.: Reunião de pais dia 25/08 às 19h."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button onClick={submit} disabled={busy || !text.trim()} className="mt-2" size="sm">
          Enviar
        </Button>
      </Card>

      {error && <p className="mt-4 text-sm text-critical">{error}</p>}

      <div className="mt-8 space-y-4">
        {(items ?? []).map((item) => (
          <Card key={item.id}>
            <div className="flex items-center justify-between gap-2">
              <StatusBadge domain="capture" value={item.status} />
              {item.category && <StatusBadge domain="captureCategory" value={item.category} />}
            </div>
            {item.raw_text && <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{item.raw_text}</p>}

            {item.capture_proposals?.map((p) => {
              if (p.status !== 'PENDING') {
                return (
                  <p key={p.id} className="mt-3 text-xs text-inkMuted">
                    {translateStatus('captureProposal', p.status).label}
                  </p>
                );
              }
              const edit = edits[p.id] ?? { title: '', date: '', time: '', subjectPersonId: '' };
              const proposedCategory = p.proposed_fields.category;
              const isMedical = proposedCategory != null && MEDICAL_CATEGORIES.has(proposedCategory);
              const confidencePct = p.confidence != null ? Math.round(p.confidence * 100) : null;
              const confirmDisabled =
                busyProposalId === p.id || (p.target_type === 'CALENDAR_EVENT' && !edit.date) || !edit.title.trim();

              return (
                <div key={p.id} className="mt-4 rounded-md border border-border bg-surfaceMuted/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-ink">{translateStatus('captureProposalTarget', p.target_type).label}</span>
                    {confidencePct != null && (
                      <span className={`text-xs ${confidencePct < 50 ? 'text-warning' : 'text-inkMuted'}`}>
                        Confiança da leitura: {confidencePct}%{confidencePct < 50 ? ' — vale conferir com atenção' : ''}
                      </span>
                    )}
                  </div>

                  {isMedical && <SensitiveDataNotice className="mt-3" label="esta proposta envolve saúde" />}

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Input
                      label="Título"
                      className="col-span-2"
                      value={edit.title}
                      onChange={(e) => updateEdit(p.id, { title: e.target.value })}
                    />
                    <Input
                      label="Data"
                      type="date"
                      value={edit.date}
                      onChange={(e) => updateEdit(p.id, { date: e.target.value })}
                      error={p.target_type === 'CALENDAR_EVENT' && !edit.date ? 'Obrigatória para virar evento' : undefined}
                    />
                    <Input label="Hora" type="time" value={edit.time} onChange={(e) => updateEdit(p.id, { time: e.target.value })} />
                  </div>

                  {personSummaries.length > 1 && (
                    <div className="mt-3">
                      <PersonPicker
                        label="Sobre quem é isso?"
                        people={personSummaries}
                        value={edit.subjectPersonId || null}
                        onChange={(id) => updateEdit(p.id, { subjectPersonId: id })}
                      />
                    </div>
                  )}

                  <div className="mt-4 flex gap-2">
                    <Button size="sm" onClick={() => confirm(p.id)} disabled={confirmDisabled}>
                      Confirmar
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => reject(p.id)} disabled={busyProposalId === p.id}>
                      Descartar
                    </Button>
                  </div>
                </div>
              );
            })}
          </Card>
        ))}
        {items && items.length === 0 && (
          <EmptyState
            title="Sua caixa de entrada está vazia"
            description="Cole acima um comunicado, mensagem ou lembrete — a ZELII propõe o que fazer com ele."
          />
        )}
      </div>
    </div>
  );
}
