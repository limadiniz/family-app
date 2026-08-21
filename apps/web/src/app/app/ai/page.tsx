'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

interface Person {
  id: string;
  display_name: string;
}

interface Fact {
  domain: string;
  summary: string;
}

interface AiAnswer {
  text: string;
  facts: Fact[];
  deniedDomains: string[];
  suggestedAction?: { type: string; payload: Record<string, unknown> };
}

interface ChatTurn {
  question: string;
  answer: AiAnswer | null;
  error: string | null;
}

/**
 * Family Copilot (V3 §57-63). Talks ONLY to POST /api/v1/ai/ask —
 * apps/web never holds an LLM key and never queries the Family Care
 * Graph directly (§54, §58): every answer here already passed through
 * the Family Policy Engine and the Context Engine (apps/api's
 * AiService, packages/ai's AiGateway) before it reached the browser.
 */
export default function AiPage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<Person[]>('/persons')
      .then((list) => {
        setPeople(list);
        if (list.length > 0) setSelectedPersonId(list[0].id);
      })
      .catch(() => setPeople([]));
  }, []);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || !selectedPersonId) return;
    const asked = question;
    setQuestion('');
    setLoading(true);
    setTurns((prev) => [...prev, { question: asked, answer: null, error: null }]);
    try {
      const answer = await apiFetch<AiAnswer>('/ai/ask', {
        method: 'POST',
        body: JSON.stringify({ question: asked, subjectPersonIds: [selectedPersonId] }),
      });
      setTurns((prev) => prev.map((t, i) => (i === prev.length - 1 ? { ...t, answer } : t)));
    } catch (err) {
      setTurns((prev) =>
        prev.map((t, i) => (i === prev.length - 1 ? { ...t, error: err instanceof Error ? err.message : 'Erro inesperado.' } : t)),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Pergunte à ZELII</h1>
          <p className="mt-1 text-sm text-inkMuted">Pergunte sobre a agenda, saúde ou escola — só o que você tem autorização para ver.</p>
        </div>
        {people && people.length > 1 && (
          <select
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
            value={selectedPersonId ?? ''}
            onChange={(e) => setSelectedPersonId(e.target.value)}
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="mt-8 space-y-6">
        {turns.length === 0 && (
          <div className="rounded-lg border border-border bg-surface p-6 text-sm text-inkMuted">
            Experimente: <span className="text-ink">&ldquo;O que tenho amanhã?&rdquo;</span>,{' '}
            <span className="text-ink">&ldquo;Quando é a próxima consulta?&rdquo;</span>
          </div>
        )}
        {turns.map((turn, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface p-6">
            <p className="text-sm font-medium text-ink">{turn.question}</p>
            {turn.error && <p className="mt-3 text-sm text-critical">{turn.error}</p>}
            {turn.answer && (
              <div className="mt-3 space-y-3">
                <p className="whitespace-pre-line text-sm text-inkMuted">{turn.answer.text}</p>
                {turn.answer.suggestedAction && (
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-ink">
                    Sugestão: {turn.answer.suggestedAction.type === 'PROPOSE_RESPONSIBILITY_ASSIGNMENT' ? 'criar uma solicitação de responsabilidade' : turn.answer.suggestedAction.type}
                    <span className="ml-2 text-xs text-inkMuted">— confirme em Rede de Cuidado antes de enviar.</span>
                  </div>
                )}
                {turn.answer.deniedDomains.length > 0 && (
                  <p className="text-xs text-inkMuted">Sem permissão para: {turn.answer.deniedDomains.join(', ')}</p>
                )}
              </div>
            )}
            {!turn.answer && !turn.error && <p className="mt-3 text-sm text-inkMuted">Pensando…</p>}
          </div>
        ))}
      </div>

      <form onSubmit={handleAsk} className="mt-6 flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Pergunte à ZELII..."
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
          disabled={loading || !selectedPersonId}
        />
        <button
          type="submit"
          disabled={loading || !question.trim() || !selectedPersonId}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Perguntar
        </button>
      </form>
    </div>
  );
}
