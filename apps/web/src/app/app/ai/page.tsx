'use client';

import { useEffect, useRef, useState } from 'react';
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

interface DecisionAlternative {
  id: string;
  title: string;
  impact: string;
  informationShared: string[];
  dependencies: string[];
  uncertainty?: string;
  proposedActionType?: string;
  subjectPersonId?: string;
  sourceEventId?: string;
  suggestedStartsAt?: string;
  suggestedEndsAt?: string;
}

interface StructuredDecision {
  situation: string;
  attention: Array<{ severity: 'INFO' | 'ATTENTION' | 'BLOCKING'; text: string; ruleId: string }>;
  alternatives: DecisionAlternative[];
  suggestion?: { text: string; criteria: string[]; uncertainty?: string };
  userActions: string[];
  sources: Array<{
    factId: string;
    label: string;
    sourceType: string;
    sourceId: string;
    updatedAt?: string;
    provenance: string;
    verificationStatus: string;
  }>;
  accessedScope: { subjectPersonIds: string[]; domains: string[]; deniedDomains: string[] };
  safetyNotice?: string;
}

interface AiAnswer {
  text: string;
  facts: Fact[];
  deniedDomains: string[];
  decision?: StructuredDecision;
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
  last_verified_at?: string;
  source_refs?: Array<{ type: string; id?: string }>;
  usage_count?: number;
  last_used_at?: string | null;
  verification_status?: string;
  created_at: string;
}

interface MemoryPreferences {
  memory_enabled: boolean;
  proactive_enabled: boolean;
  explanation_detail: 'CONCISE' | 'BALANCED' | 'DETAILED';
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

interface ProposalItem {
  id: string;
  proposal_type: string;
  status: string;
  version: number;
  expires_at: string;
  uncertain_fields: string[];
  expected_effects: string[];
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

const SOURCE_LABELS: Record<string, string> = {
  calendar_events: 'Agenda da família',
  tasks: 'Tarefas',
  documents: 'Documentos',
  health_profiles: 'Perfil de saúde',
  medications: 'Medicamentos',
  ai_memory_items: 'Memória confirmada da ZELII',
};

const DOMAIN_LABELS: Record<string, string> = {
  SCHEDULE: 'agenda',
  SCHOOL: 'escola',
  HEALTH: 'saúde',
  MEDICATION: 'medicamentos',
  DOCUMENTS: 'documentos',
  TRANSPORTATION: 'transporte',
  ACTIVITIES: 'atividades',
  AI: 'assistente',
};

const VERIFICATION_LABELS: Record<string, string> = {
  DECLARED: 'informação cadastrada',
  CONFIRMED: 'informação confirmada',
  EXTRACTED: 'extraída de documento',
  INFERRED: 'inferência a revisar',
  OUTDATED: 'pode estar desatualizada',
};

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

function speechRecognitionConstructor(): BrowserSpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function ruleLabel(ruleId: string): string {
  if (ruleId.endsWith(':MISSING_TRANSPORT')) return 'Transporte ainda não definido';
  if (ruleId.endsWith(':SIMULTANEOUS_EVENTS')) return 'Horários sobrepostos';
  if (ruleId === 'calendar:upcoming_health_event') return 'Compromisso de saúde próximo';
  if (ruleId === 'calendar:preparation_required') return 'Preparação recomendada';
  return 'Regra automática da ZELII';
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
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const [memoryPersonId, setMemoryPersonId] = useState<string | null>(null);
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
  const [memoryPreferences, setMemoryPreferences] = useState<MemoryPreferences | null>(null);
  const [usageByMemory, setUsageByMemory] = useState<Record<string, Array<{ purpose: string; used_at: string }>>>({});
  const [proposals, setProposals] = useState<ProposalItem[]>([]);
  const [proposalMessage, setProposalMessage] = useState<string | null>(null);
  const [activeAlternativeId, setActiveAlternativeId] = useState<string | null>(null);
  const [transportSubjectId, setTransportSubjectId] = useState('');
  const [transportAssigneeId, setTransportAssigneeId] = useState('');
  const [transportStartsAt, setTransportStartsAt] = useState('');
  const [transportEndsAt, setTransportEndsAt] = useState('');
  const [transportInstructions, setTransportInstructions] = useState('');
  const [transportError, setTransportError] = useState<string | null>(null);
  const [lastPreparedAlternativeId, setLastPreparedAlternativeId] = useState<string | null>(null);
  const [voiceSupported, setVoiceSupported] = useState<boolean | null>(null);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const selectedPersonId = memoryPersonId ?? selectedPersonIds[0] ?? null;

  useEffect(() => {
    apiFetch<Person[]>('/persons')
      .then((list) => {
        setPeople(list);
        setSelectedPersonIds(list.map((person) => person.id));
        if (list.length > 0) setMemoryPersonId(list[0].id);
      })
      .catch(() => setPeople([]));
  }, []);

  useEffect(() => {
    setVoiceSupported(Boolean(speechRecognitionConstructor()));
    return () => recognitionRef.current?.abort();
  }, []);

  useEffect(() => {
    apiFetch<MemoryPreferences>('/ai/memory-preferences').then(setMemoryPreferences).catch(() => undefined);
    reloadProposals();
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
    if (!question.trim() || selectedPersonIds.length === 0) return;
    const asked = question;
    setQuestion('');
    setLoading(true);
    setTurns((prev) => [...prev, { question: asked, answer: null, error: null }]);
    try {
      const answer = await apiFetch<AiAnswer>('/ai/ask', {
        method: 'POST',
        body: JSON.stringify({ question: asked }),
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

  function handleVoiceInput() {
    if (voiceListening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = speechRecognitionConstructor();
    if (!Recognition) {
      setVoiceMessage('A consulta por voz não está disponível neste navegador. Você pode continuar digitando.');
      return;
    }

    const recognition = new Recognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (transcript) {
        setQuestion((current) => `${current}${current.trim() ? ' ' : ''}${transcript}`.slice(0, 1000));
        setVoiceMessage('Pergunta reconhecida. Revise o texto e toque em Perguntar.');
      }
    };
    recognition.onerror = (event) => {
      const denied = event.error === 'not-allowed' || event.error === 'service-not-allowed';
      setVoiceMessage(
        denied
          ? 'O microfone não foi autorizado. Libere a permissão do navegador ou digite sua pergunta.'
          : 'Não consegui entender o áudio. Tente falar novamente ou digite sua pergunta.',
      );
    };
    recognition.onend = () => {
      setVoiceListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setVoiceMessage('Ouvindo… fale sua pergunta em português.');
    setVoiceListening(true);
    try {
      recognition.start();
    } catch {
      setVoiceListening(false);
      recognitionRef.current = null;
      setVoiceMessage('Não foi possível iniciar o microfone. Tente novamente ou digite sua pergunta.');
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

  async function handleCorrectMemory(memory: MemoryItem) {
    const corrected = window.prompt('Corrija a informação que a ZELII deve lembrar:', memory.summary);
    if (!corrected?.trim() || corrected.trim() === memory.summary) return;
    if (!window.confirm('Confirmar esta correção e substituir a memória anterior?')) return;
    setMemoryError(null);
    try {
      await apiFetch(`/ai/memory/${memory.id}/correct`, {
        method: 'POST',
        body: JSON.stringify({ summary: corrected.trim(), normalizedContent: {}, confirmed: true }),
      });
      setMemoryReloadKey((key) => key + 1);
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : 'Não foi possível corrigir esta memória.');
    }
  }

  async function handleShowUsage(memory: MemoryItem) {
    if (usageByMemory[memory.id]) {
      setUsageByMemory((current) => {
        const next = { ...current };
        delete next[memory.id];
        return next;
      });
      return;
    }
    try {
      const usage = await apiFetch<Array<{ purpose: string; used_at: string }>>(`/ai/memory/${memory.id}/usage`);
      setUsageByMemory((current) => ({ ...current, [memory.id]: usage }));
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : 'Não foi possível consultar o uso desta memória.');
    }
  }

  async function handlePreferenceChange(patch: Partial<MemoryPreferences>) {
    if (!memoryPreferences) return;
    const next = { ...memoryPreferences, ...patch };
    setMemoryPreferences(next);
    try {
      const saved = await apiFetch<MemoryPreferences>('/ai/memory-preferences', {
        method: 'PATCH',
        body: JSON.stringify({
          memoryEnabled: next.memory_enabled,
          proactiveEnabled: next.proactive_enabled,
          explanationDetail: next.explanation_detail,
          quietHoursStart: next.quiet_hours_start,
          quietHoursEnd: next.quiet_hours_end,
        }),
      });
      setMemoryPreferences(saved);
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : 'Não foi possível atualizar as preferências.');
    }
  }

  async function handleExportMemory() {
    if (!selectedPersonId) return;
    try {
      const exported = await apiFetch<Record<string, unknown>>(
        `/ai/memory-export?subjectPersonId=${encodeURIComponent(selectedPersonId)}`,
      );
      const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `zelii-memoria-${selectedPersonId}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : 'Não foi possível exportar a memória.');
    }
  }

  async function reloadProposals() {
    try {
      setProposals(await apiFetch<ProposalItem[]>('/ai/proposals'));
    } catch {
      setProposals([]);
    }
  }

  async function handlePrepareAction(alternative: DecisionAlternative, answer: AiAnswer) {
    if (!alternative.proposedActionType || !selectedPersonId) return;
    if (alternative.proposedActionType === 'PROPOSE_RESPONSIBILITY_ASSIGNMENT' || alternative.proposedActionType === 'PROPOSE_REQUEST') {
      setActiveAlternativeId((current) => current === alternative.id ? null : alternative.id);
      setTransportSubjectId(alternative.subjectPersonId ?? selectedPersonIds[0] ?? selectedPersonId);
      setTransportAssigneeId('');
      setTransportStartsAt(alternative.suggestedStartsAt?.slice(0, 16) ?? '');
      setTransportEndsAt(alternative.suggestedEndsAt?.slice(0, 16) ?? '');
      setTransportInstructions('');
      setTransportError(null);
      return;
    }
    await prepareSimpleAction(alternative, answer);
  }

  async function prepareSimpleAction(alternative: DecisionAlternative, answer: AiAnswer) {
    if (!alternative.proposedActionType || !selectedPersonId) return;
    setProposalMessage(null);
    const isTask = ['PROPOSE_TASK', 'PROPOSE_REMINDER', 'PROPOSE_PREPARATION_CHECKLIST'].includes(
      alternative.proposedActionType,
    );
    const proposedData = isTask
      ? { subjectPersonId: selectedPersonId, title: alternative.title, description: alternative.impact }
      : { subjectPersonId: selectedPersonId, note: alternative.title };
    const uncertainFields = isTask ? [] : ['pessoa destinatária', 'horário ou recurso relacionado'];
    try {
      await apiFetch('/ai/proposals', {
        method: 'POST',
        body: JSON.stringify({
          type: alternative.proposedActionType,
          subjectPersonIds: selectedPersonIds,
          proposedData,
          factIds: answer.decision?.sources.map((source) => source.factId) ?? [],
          uncertainFields,
          expectedEffects: [alternative.impact],
          informationToShare: alternative.informationShared,
          idempotencyKey: `${alternative.id}:${selectedPersonIds.join(':')}`.slice(0, 120),
        }),
      });
      setProposalMessage('Proposta preparada. Nada foi enviado ou executado.');
      await reloadProposals();
      setLastPreparedAlternativeId(alternative.id);
    } catch (err) {
      setProposalMessage(err instanceof Error ? err.message : 'Não foi possível preparar a proposta.');
    }
  }

  async function handlePrepareTransport(alternative: DecisionAlternative, answer: AiAnswer) {
    if (!alternative.proposedActionType || !transportSubjectId || !transportAssigneeId || !transportStartsAt || !transportEndsAt) {
      setTransportError('Escolha quem levará/buscará e informe o início e o fim da responsabilidade.');
      return;
    }
    if (transportAssigneeId === transportSubjectId) {
      setTransportError('A pessoa responsável precisa ser diferente da criança ou pessoa atendida.');
      return;
    }
    const startsAt = new Date(transportStartsAt).toISOString();
    const endsAt = new Date(transportEndsAt).toISOString();
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      setTransportError('O fim da responsabilidade deve ser depois do início.');
      return;
    }
    setTransportError(null);
    setProposalMessage(null);
    try {
      const proposedData = alternative.proposedActionType === 'PROPOSE_RESPONSIBILITY_ASSIGNMENT'
        ? {
            subjectPersonId: transportSubjectId,
            responsibilityType: 'PICKUP',
            assignedToPersonId: transportAssigneeId,
            startsAt,
            endsAt,
            instructions: transportInstructions.trim() || undefined,
          }
        : {
            type: 'PICKUP_REQUEST',
            requestedToPersonId: transportAssigneeId,
            subjectPersonId: transportSubjectId,
            payload: { startsAt, endsAt, sourceEventId: alternative.sourceEventId },
            note: transportInstructions.trim() || alternative.impact,
          };
      await apiFetch('/ai/proposals', {
        method: 'POST',
        body: JSON.stringify({
          type: alternative.proposedActionType,
          subjectPersonIds: [transportSubjectId],
          proposedData,
          factIds: answer.decision?.sources.map((source) => source.factId) ?? [],
          uncertainFields: [],
          expectedEffects: [alternative.impact],
          informationToShare: alternative.informationShared,
          idempotencyKey: `${alternative.id}:${transportSubjectId}:${transportAssigneeId}:${startsAt}`.slice(0, 120),
        }),
      });
      setProposalMessage('Proposta preparada. Revise abaixo; nenhum pedido foi enviado ainda.');
      setLastPreparedAlternativeId(alternative.id);
      setActiveAlternativeId(null);
      await reloadProposals();
    } catch (err) {
      setTransportError(err instanceof Error ? err.message : 'Não foi possível preparar a proposta.');
    }
  }

  async function handleProposalTransition(proposal: ProposalItem, action: 'confirm' | 'reject' | 'execute') {
    const confirmed = action !== 'reject';
    if (confirmed && !window.confirm(action === 'execute' ? 'Executar a ação confirmada agora?' : 'Confirmar esta proposta para revisão final?')) return;
    try {
      await apiFetch(`/ai/proposals/${proposal.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: proposal.version, confirmed }),
      });
      await reloadProposals();
    } catch (err) {
      setProposalMessage(err instanceof Error ? err.message : 'Não foi possível atualizar a proposta.');
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Pergunte à ZELII"
        description="Pergunte sobre a agenda, saúde ou escola. A ZELII considera automaticamente toda a família, respeitando suas permissões."
      />

      {people && people.length > 0 && (
        <div className="mt-5 rounded-xl border border-border bg-surface p-4" aria-label="Pessoas consideradas na resposta">
          <p className="text-sm font-semibold text-ink">Toda a família será considerada</p>
          <p className="mt-1 text-sm leading-relaxed text-inkMuted">
            {people.map((person) => person.display_name).join(', ')}. A resposta mostra apenas os assuntos que você tem autorização para acessar.
          </p>
        </div>
      )}

      <details className="mt-8 rounded-xl border border-border bg-surface p-4 open:shadow-sm">
        <summary className="cursor-pointer font-semibold text-ink">
          Memória da ZELII
          <span className="ml-2 text-sm font-normal text-inkMuted">
            {memories === null ? 'carregando…' : `${memories.length} ${memories.length === 1 ? 'memória ativa' : 'memórias ativas'}`}
          </span>
        </summary>
        <p className="mt-3 text-sm leading-relaxed text-inkMuted">
          A memória é usada nas próximas respostas somente quando você tem permissão para acessar a pessoa e o assunto.
          A conversa não é salva automaticamente: confirme abaixo apenas o que deve permanecer.
        </p>

        {memoryPreferences && (
          <div className="mt-4 grid gap-3 rounded-lg bg-background p-3 sm:grid-cols-2">
            {people && people.length > 1 && (
              <label className="text-sm text-ink">
                Memórias de
                <Select
                  value={selectedPersonId ?? ''}
                  onChange={(event) => setMemoryPersonId(event.target.value)}
                  className="mt-1 w-full"
                >
                  {people.map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}
                </Select>
              </label>
            )}
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={memoryPreferences.memory_enabled}
                onChange={(event) => handlePreferenceChange({ memory_enabled: event.target.checked })}
                className="h-4 w-4 accent-primary"
              />
              Usar memória personalizada
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={memoryPreferences.proactive_enabled}
                onChange={(event) => handlePreferenceChange({ proactive_enabled: event.target.checked })}
                className="h-4 w-4 accent-primary"
              />
              Permitir sugestões proativas
            </label>
            <label className="text-sm text-ink">
              Nível de explicação
              <Select
                value={memoryPreferences.explanation_detail}
                onChange={(event) => handlePreferenceChange({ explanation_detail: event.target.value as MemoryPreferences['explanation_detail'] })}
                className="mt-1 w-full"
              >
                <option value="CONCISE">Conciso</option>
                <option value="BALANCED">Equilibrado</option>
                <option value="DETAILED">Detalhado</option>
              </Select>
            </label>
            <div className="flex items-end">
              <Button type="button" size="sm" variant="secondary" onClick={handleExportMemory} disabled={!selectedPersonId}>
                Exportar memória autorizada
              </Button>
            </div>
          </div>
        )}

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
                    {memory.last_verified_at ? ` · verificada em ${new Date(memory.last_verified_at).toLocaleDateString('pt-BR')}` : ''}
                    {memory.usage_count ? ` · usada ${memory.usage_count}x` : ''}
                  </p>
                  {usageByMemory[memory.id] && (
                    <p className="mt-2 text-xs text-inkMuted">
                      {usageByMemory[memory.id].length === 0
                        ? 'Esta memória ainda não foi usada em respostas.'
                        : `Último uso: ${new Date(usageByMemory[memory.id][0].used_at).toLocaleString('pt-BR')} (${usageByMemory[memory.id][0].purpose}).`}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button type="button" size="sm" variant="ghost" onClick={() => handleShowUsage(memory)}>Por que foi usada?</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => handleCorrectMemory(memory)}>Corrigir</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => handleRevokeMemory(memory)}>Esquecer</Button>
                </div>
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
          <Button type="submit" size="sm" disabled={memorySaving || !memorySummary.trim() || !memoryConfirmed || !selectedPersonId || memoryPreferences?.memory_enabled === false}>
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
                {turn.answer.decision ? (
                  <div className="space-y-4">
                    <section>
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-inkMuted">Situação</h2>
                      <p className="mt-1 whitespace-pre-line text-sm text-ink">{turn.answer.decision.situation}</p>
                    </section>
                    {turn.answer.decision.attention.length > 0 && (
                      <section>
                        <h2 className="text-xs font-semibold uppercase tracking-wide text-inkMuted">Por que precisa de atenção</h2>
                        <ul className="mt-2 space-y-2">
                          {turn.answer.decision.attention.map((attention) => (
                            <li key={`${attention.ruleId}:${attention.text}`} className={`rounded-lg border p-3 text-sm ${attention.severity === 'BLOCKING' ? 'border-critical/30 bg-critical/5 text-critical' : 'border-warning/30 bg-warning/5 text-ink'}`}>
                              {attention.text}
                              <span className="mt-1 block text-xs text-inkMuted">Verificado pela ZELII: {ruleLabel(attention.ruleId)}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                    {turn.answer.decision.alternatives.length > 0 && (
                      <section>
                        <h2 className="text-xs font-semibold uppercase tracking-wide text-inkMuted">Alternativas</h2>
                        <div className="mt-2 space-y-2">
                          {turn.answer.decision.alternatives.map((alternative) => (
                            <div key={alternative.id} className="rounded-lg border border-border p-3">
                              <p className="text-sm font-semibold text-ink">{alternative.title}</p>
                              <p className="mt-1 text-sm text-inkMuted">{alternative.impact}</p>
                              {alternative.uncertainty && <p className="mt-1 text-xs text-warning">Incerteza: {alternative.uncertainty}</p>}
                              {alternative.proposedActionType && (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="mt-3"
                                    onClick={() => handlePrepareAction(alternative, turn.answer!)}
                                  >
                                    {activeAlternativeId === alternative.id ? 'Fechar preparação' : 'Preparar — não enviar'}
                                  </Button>
                                  {lastPreparedAlternativeId === alternative.id && proposalMessage && (
                                    <p className="mt-2 text-xs text-success" role="status">{proposalMessage}</p>
                                  )}
                                  {activeAlternativeId === alternative.id && (
                                    <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
                                      <p className="text-sm font-semibold text-ink">Complete a responsabilidade</p>
                                      <p className="mt-1 text-xs leading-relaxed text-inkMuted">
                                        Escolha quem levará ou buscará, informe a janela de cuidado e revise antes de confirmar. A ZELII não envia nada nesta etapa.
                                      </p>
                                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                        <Select
                                          label="Para quem é?"
                                          value={transportSubjectId}
                                          onChange={(event) => setTransportSubjectId(event.target.value)}
                                        >
                                          {(people ?? []).map((person) => (
                                            <option key={person.id} value={person.id}>{person.display_name}</option>
                                          ))}
                                        </Select>
                                        <Select
                                          label="Quem levará/buscará?"
                                          value={transportAssigneeId}
                                          onChange={(event) => setTransportAssigneeId(event.target.value)}
                                        >
                                          <option value="">Selecione uma pessoa autorizada</option>
                                          {(people ?? []).filter((person) => person.id !== transportSubjectId).map((person) => (
                                            <option key={person.id} value={person.id}>{person.display_name}</option>
                                          ))}
                                        </Select>
                                        <Input
                                          label="Início"
                                          type="datetime-local"
                                          value={transportStartsAt}
                                          onChange={(event) => setTransportStartsAt(event.target.value)}
                                        />
                                        <Input
                                          label="Fim"
                                          type="datetime-local"
                                          value={transportEndsAt}
                                          onChange={(event) => setTransportEndsAt(event.target.value)}
                                        />
                                      </div>
                                      <Input
                                        label="Instruções (opcional)"
                                        value={transportInstructions}
                                        onChange={(event) => setTransportInstructions(event.target.value)}
                                        placeholder="Ex.: buscar na portaria da escola"
                                        className="mt-3"
                                      />
                                      {transportError && <p className="mt-2 text-xs text-critical" role="alert">{transportError}</p>}
                                      <Button
                                        type="button"
                                        size="sm"
                                        className="mt-3"
                                        onClick={() => handlePrepareTransport(alternative, turn.answer!)}
                                      >
                                        Preparar para revisão
                                      </Button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                    {turn.answer.decision.suggestion && (
                      <section className="rounded-lg bg-primary/5 p-3">
                        <h2 className="text-xs font-semibold uppercase tracking-wide text-primary">Sugestão da ZELII</h2>
                        <p className="mt-1 text-sm text-ink">{turn.answer.decision.suggestion.text}</p>
                        <p className="mt-1 text-xs text-inkMuted">Critérios: {turn.answer.decision.suggestion.criteria.join(', ')}.</p>
                      </section>
                    )}
                    <section>
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-inkMuted">Você decide</h2>
                      <p className="mt-1 text-sm text-inkMuted">Nenhuma ação é enviada ou executada sem sua confirmação.</p>
                    </section>
                    <details className="rounded-lg border border-border p-3">
                      <summary className="cursor-pointer text-sm font-medium text-ink">Fontes e escopo acessado</summary>
                      <ul className="mt-2 space-y-2 text-xs text-inkMuted">
                        {turn.answer.decision.sources.map((source) => (
                          <li key={source.factId}>
                            {source.label} — {SOURCE_LABELS[source.sourceType] ?? 'Registro da família'}
                            {source.updatedAt ? `, atualizada em ${new Date(source.updatedAt).toLocaleString('pt-BR')}` : ''}
                            {` · ${VERIFICATION_LABELS[source.verificationStatus] ?? 'informação registrada'}`}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-inkMuted">Áreas consultadas: {turn.answer.decision.accessedScope.domains.map((domain) => DOMAIN_LABELS[domain] ?? domain.toLowerCase()).join(', ') || 'nenhuma'}.</p>
                    </details>
                    {turn.answer.decision.safetyNotice && <p className="text-xs text-warning">{turn.answer.decision.safetyNotice}</p>}
                  </div>
                ) : (
                  <p className="whitespace-pre-line text-sm text-inkMuted">{turn.answer.text}</p>
                )}
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

      {(proposalMessage || proposals.length > 0) && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-ink">Propostas preparadas</h2>
          {proposalMessage && <p className="mt-2 text-sm text-inkMuted" role="status">{proposalMessage}</p>}
          <div className="mt-3 space-y-2">
            {proposals.map((proposal) => (
              <Card key={proposal.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink">{proposal.proposal_type}</p>
                    <p className="text-xs text-inkMuted">Estado: {proposal.status} · expira em {new Date(proposal.expires_at).toLocaleString('pt-BR')}</p>
                    {proposal.uncertain_fields.length > 0 && <p className="mt-1 text-xs text-warning">Complete antes de executar: {proposal.uncertain_fields.join(', ')}.</p>}
                  </div>
                  <div className="flex gap-2">
                    {proposal.status === 'READY_FOR_REVIEW' && (
                      <>
                        <Button type="button" size="sm" variant="secondary" onClick={() => handleProposalTransition(proposal, 'reject')}>Rejeitar</Button>
                        <Button type="button" size="sm" onClick={() => handleProposalTransition(proposal, 'confirm')}>Confirmar</Button>
                      </>
                    )}
                    {proposal.status === 'CONFIRMED' && proposal.uncertain_fields.length === 0 && (
                      <Button type="button" size="sm" onClick={() => handleProposalTransition(proposal, 'execute')}>Executar ação confirmada</Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <form onSubmit={handleAsk} className="mt-6">
        <div className="flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Pergunte à ZELII..."
          className="flex-1"
          disabled={loading || selectedPersonIds.length === 0}
          aria-label="Sua pergunta para a ZELII"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={handleVoiceInput}
          disabled={loading || voiceSupported !== true}
          aria-pressed={voiceListening}
          aria-label={voiceListening ? 'Parar gravação de voz' : 'Fazer pergunta por voz'}
          title={voiceSupported === false ? 'Reconhecimento de voz indisponível neste navegador' : undefined}
        >
          {voiceListening ? 'Parar' : voiceSupported === false ? 'Voz indisponível' : 'Falar'}
        </Button>
        <Button type="submit" disabled={loading || !question.trim() || selectedPersonIds.length === 0}>
          Perguntar
        </Button>
        </div>
        {voiceSupported === false && !voiceMessage && (
          <p className="mt-2 text-xs text-inkMuted">Seu navegador não oferece ditado por voz. A consulta por texto continua disponível.</p>
        )}
        {voiceMessage && <p className="mt-2 text-xs text-inkMuted" role="status" aria-live="polite">{voiceMessage}</p>}
      </form>
    </div>
  );
}
