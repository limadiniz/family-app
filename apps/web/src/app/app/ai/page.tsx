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

interface MemoryItem {
  id: string;
  domain: string;
  memory_type: string;
  summary: string;
  valid_until: string | null;
  created_at: string;
}

const MEMORY_DOMAINS = [
  ['SCHEDULE', 'Agenda'],
  ['SCHOOL', 'Escola'],
  ['HEALTH', 'Saúde'],
  ['MEDICATION', 'Medicamentos'],
  ['ACTIVITIES', 'Atividades'],
  ['TRANSPORTATION', 'Transporte'],
  ['DOCUMENTS', 'Documentos'],
  ['NOTES', 'Observações'],
] as const;

const MEMORY_TYPES = [
  ['PREFERENCE', 'Preferência'],
  ['ROUTINE', 'Rotina'],
  ['CONSTRAINT', 'Restrição'],
  ['DECISION', 'Decisão da família'],
  ['CONTEXT', 'Contexto importante'],
] as const;

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
  const [memories, setMemories] = useState<MemoryItem[] | null>(null);
  const [memoryReloadKey, setMemoryReloadKey] = useState(0);
  const [memorySummary, setMemorySummary] = useState('');
  const [memoryDomain, setMemoryDomain] = useState('SCHEDULE');
  const [memoryType, setMemoryType] = useState('CONTEXT');
  const [memoryValidUntil, setMemoryValidUntil] = useState('');
  const [memoryConfirmed, setMemoryConfirmed] = useState(false);
  const [memorySaving, setMemorySaving] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Person[]>('/persons')
      .then((list) => {
        setPeople(list);
        if (list.length > 0) setSelectedPersonId(list[0].id);
      })
      .catch(() => setPeople([]));
  }, []);

  useEffect(() => {
    if (!selectedPersonId) {
      setMemories([]);
      return;
    }
    setMemories(null);
    setMemoryError(null);
    apiFetch<MemoryItem[]>(`/ai/memory?subjectPersonId=${encodeURIComponent(selectedPersonId)}`)
      .then(setMemories)
      .catch((err) => {
        setMemories([]);
        setMemoryError(err instanceof Error ? err.message : 'Não foi possível carregar as memórias.');
      });
  }, [selectedPersonId, memoryReloadKey]);

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

  async function handleCreateMemory(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPersonId || !memorySummary.trim() || !memoryConfirmed) return;
    setMemorySaving(true);
    setMemoryError(null);
    try {
      await apiFetch('/ai/memory', {
        method: 'POST',
        body: JSON.stringify({
          subjectPersonId: selectedPersonId,
          domain: memoryDomain,
          memoryType,
          summary: memorySummary.trim(),
          sourceRefs: [{ type: 'user_confirmation' }],
          validUntil: memoryValidUntil ? new Date(`${memoryValidUntil}T23:59:59`).toISOString() : null,
          confirmed: true,
        }),
      });
      setMemorySummary('');
      setMemoryValidUntil('');
      setMemoryConfirmed(false);
      setMemoryReloadKey((key) => key + 1);
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : 'Não foi possível salvar a memória.');
    } finally {
      setMemorySaving(false);
    }
  }

  async function handleRevokeMemory(memory: MemoryItem) {
    if (!window.confirm(`Esquecer esta informação?\n\n${memory.summary}`)) return;
    setMemoryError(null);
    try {
      await apiFetch(`/ai/memory/${memory.id}/revoke`, { method: 'PATCH' });
      setMemoryReloadKey((key) => key + 1);
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : 'Não foi possível esquecer esta memória.');
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

      <details className="mt-8 rounded-xl border border-border bg-surface p-4 open:shadow-sm">
        <summary className="cursor-pointer font-semibold text-ink">
          O que a ZELII pode lembrar
          <span className="ml-2 text-sm font-normal text-inkMuted">
            {memories === null ? 'carregando…' : `${memories.length} ${memories.length === 1 ? 'memória ativa' : 'memórias ativas'}`}
          </span>
        </summary>
        <p className="mt-3 text-sm leading-relaxed text-inkMuted">
          A memória é usada nas próximas respostas somente quando você tem permissão para acessar a pessoa e o assunto.
          A conversa não é salva automaticamente: confirme abaixo apenas o que deve permanecer.
        </p>

        {memoryError && <p className="mt-3 text-sm text-critical" role="alert">{memoryError}</p>}

        {memories && memories.length > 0 && (
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
            {memories.map((memory) => (
              <li key={memory.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-ink">{memory.summary}</p>
                  <p className="mt-1 text-xs text-inkMuted">
                    {MEMORY_DOMAINS.find(([value]) => value === memory.domain)?.[1] ?? memory.domain}
                    {memory.valid_until ? ` · válida até ${new Date(memory.valid_until).toLocaleDateString('pt-BR')}` : ' · sem prazo definido'}
                  </p>
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={() => handleRevokeMemory(memory)}>
                  Esquecer
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleCreateMemory} className="mt-5 space-y-4 border-t border-border pt-5">
          <div>
            <label htmlFor="memory-summary" className="text-sm font-medium text-ink">Informação a lembrar</label>
            <Input
              id="memory-summary"
              value={memorySummary}
              onChange={(event) => setMemorySummary(event.target.value)}
              maxLength={500}
              placeholder="Ex.: Às sextas, evitar compromissos antes das 9h."
              className="mt-1 w-full"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="memory-domain" className="text-sm font-medium text-ink">Assunto</label>
              <Select id="memory-domain" value={memoryDomain} onChange={(event) => setMemoryDomain(event.target.value)} className="mt-1 w-full">
                {MEMORY_DOMAINS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </div>
            <div>
              <label htmlFor="memory-type" className="text-sm font-medium text-ink">Tipo</label>
              <Select id="memory-type" value={memoryType} onChange={(event) => setMemoryType(event.target.value)} className="mt-1 w-full">
                {MEMORY_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </div>
            <div>
              <label htmlFor="memory-validity" className="text-sm font-medium text-ink">Válida até (opcional)</label>
              <Input id="memory-validity" type="date" value={memoryValidUntil} onChange={(event) => setMemoryValidUntil(event.target.value)} className="mt-1 w-full" />
            </div>
          </div>
          <label className="flex items-start gap-3 text-sm text-ink">
            <input
              type="checkbox"
              checked={memoryConfirmed}
              onChange={(event) => setMemoryConfirmed(event.target.checked)}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span>Confirmo que esta informação está correta e autorizo a ZELII a usá-la para auxiliar futuras decisões.</span>
          </label>
          <Button type="submit" size="sm" disabled={memorySaving || !memorySummary.trim() || !memoryConfirmed || !selectedPersonId}>
            {memorySaving ? 'Salvando…' : 'Guardar na memória'}
          </Button>
        </form>
      </details>

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
