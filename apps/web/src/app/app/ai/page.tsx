'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { PageHeader, Select, Input, Button, Card } from '@/components/ui';

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
      <PageHeader
        title="Pergunte à ZELII"
        description="Pergunte sobre a agenda, saúde ou escola — só o que você tem autorização para ver."
        actions={
          people && people.length > 1 ? (
            <Select className="w-auto" value={selectedPersonId ?? ''} onChange={(e) => setSelectedPersonId(e.target.value)}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />

      <div className="mt-8 space-y-6">
        {turns.length === 0 && (
          <Card className="text-sm text-inkMuted">
            Experimente: <span className="text-ink">&ldquo;O que tenho amanhã?&rdquo;</span>,{' '}
            <span className="text-ink">&ldquo;Quando é a próxima consulta?&rdquo;</span>
          </Card>
        )}
        {turns.map((turn, i) => (
          <Card key={i}>
            <p className="text-sm font-medium text-ink">{turn.question}</p>
            {turn.error && <p className="mt-3 text-sm text-critical" role="alert">{turn.error}</p>}
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
            {!turn.answer && !turn.error && (
              <p className="mt-3 flex items-center gap-2 text-sm text-inkMuted" role="status">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-primary" aria-hidden="true" />
                Pensando…
              </p>
            )}
          </Card>
        ))}
      </div>

      <form onSubmit={handleAsk} className="mt-6 flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Pergunte à ZELII..."
          className="flex-1"
          disabled={loading || !selectedPersonId}
        />
        <Button type="submit" disabled={loading || !question.trim() || !selectedPersonId}>
          Perguntar
        </Button>
      </form>
    </div>
  );
}
