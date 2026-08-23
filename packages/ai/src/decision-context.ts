import { FamilyPolicyEngine, type PolicyActor, type PolicyEngineInput } from '@family-app/policy-engine';
import type { PermissionDomain } from '@family-app/domain';
import { buildRetrievalRequests, resolveIntentDomains, resolveTimeWindow } from './intent';
import type {
  AuthorizedFact,
  DecisionAlternative,
  DecisionContext,
  DecisionSignal,
  FactProvenance,
  ProposedActionType,
  RetrievalFn,
  StructuredDecision,
  VerificationStatus,
} from './types';

export interface DecisionContextBuilderDeps {
  retrieve: RetrievalFn;
  loadPolicyInput: (actor: PolicyActor, subjectPersonId: string) => Promise<PolicyEngineInput>;
  loadSignals?: (input: {
    actor: PolicyActor;
    subjectPersonIds: string[];
    allowedDomains: PermissionDomain[];
    authorizedScopes: Array<{ subjectPersonId: string; domain: PermissionDomain; decisionRule: string }>;
    facts: AuthorizedFact[];
    timeWindow?: { startsAt: string; endsAt: string };
  }) => Promise<DecisionSignal[]>;
  now?: () => Date;
  timeZone?: string;
}

export class DecisionContextBuilder {
  private readonly policyEngine = new FamilyPolicyEngine();

  constructor(private readonly deps: DecisionContextBuilderDeps) {}

  async build(actor: PolicyActor, question: string, subjectPersonIds: string[]): Promise<DecisionContext> {
    const timeWindow = resolveTimeWindow(question, this.deps.now?.() ?? new Date(), this.deps.timeZone);
    const requests = buildRetrievalRequests(question, [...new Set(subjectPersonIds)], timeWindow);
    const authorizedFacts: AuthorizedFact[] = [];
    const allowedDomains = new Set<PermissionDomain>();
    const deniedDomains = new Set<PermissionDomain>();
    const authorizedScopes: Array<{ subjectPersonId: string; domain: PermissionDomain; decisionRule: string }> = [];

    for (const request of requests) {
      const policyInput = await this.deps.loadPolicyInput(actor, request.subjectPersonId);
      const decision = this.policyEngine.authorize(
        {
          actor,
          action: 'VIEW',
          domain: request.domain,
          subjectPersonId: request.subjectPersonId,
          subjectTenantId: actor.tenantId,
          // Static purpose: the raw question must never leak into policy/audit metadata.
          context: { purpose: 'ai_decision_context' },
        },
        policyInput,
      );

      if (decision.decision !== 'ALLOW') {
        deniedDomains.add(request.domain);
        continue;
      }

      allowedDomains.add(request.domain);
      authorizedScopes.push({
        subjectPersonId: request.subjectPersonId,
        domain: request.domain,
        decisionRule: decision.rule,
      });
      const retrieved = await this.deps.retrieve(request);
      const remainingBudget = 60 - authorizedFacts.length;
      if (remainingBudget > 0) {
        authorizedFacts.push(
          ...retrieved.slice(0, Math.min(12, remainingBudget)).map((fact) => normalizeFact(fact, decision.rule)),
        );
      }
    }

    const allowed = [...allowedDomains];
    const deterministicSignals = this.deps.loadSignals
      ? await this.deps.loadSignals({
          actor,
          subjectPersonIds,
          allowedDomains: allowed,
          authorizedScopes,
          facts: authorizedFacts,
          timeWindow,
        })
      : [];

    return {
      actor: { personId: actor.personId, tenantId: actor.tenantId },
      questionIntent: resolveIntentDomains(question).join('+'),
      subjectPersonIds: [...new Set(subjectPersonIds)],
      timeWindow,
      authorizedFacts,
      deterministicSignals,
      deniedDomains: [...deniedDomains],
      allowedDomains: allowed,
      authorizedScopes,
      availableActions: resolveAvailableActions(allowed, deterministicSignals),
    };
  }
}

function normalizeFact(
  fact: Awaited<ReturnType<RetrievalFn>>[number],
  decisionRule: string,
): AuthorizedFact {
  const provenance: FactProvenance = fact.source.provenance ?? 'USER_DECLARED';
  const verificationStatus: VerificationStatus = fact.source.verificationStatus ?? 'DECLARED';
  return {
    ...fact,
    id: `${fact.source.type}:${fact.source.id}`,
    value: { summary: fact.summary },
    source: { ...fact.source, provenance, verificationStatus },
    authorization: {
      action: 'VIEW',
      domain: fact.domain,
      subjectPersonId: fact.subjectPersonId,
      decisionRule,
    },
    verificationStatus,
  };
}

function resolveAvailableActions(domains: PermissionDomain[], signals: DecisionSignal[]): ProposedActionType[] {
  const actions = new Set<ProposedActionType>();
  if (domains.includes('SCHEDULE')) {
    actions.add('PROPOSE_TASK');
    actions.add('PROPOSE_CALENDAR_EVENT');
    actions.add('PROPOSE_REMINDER');
    actions.add('PROPOSE_SCHEDULE_ADJUSTMENT');
  }
  if (domains.some((domain) => ['SCHEDULE', 'TRANSPORTATION', 'CONTACTS'].includes(domain))) {
    actions.add('PROPOSE_REQUEST');
    actions.add('PROPOSE_RESPONSIBILITY_ASSIGNMENT');
  }
  if (domains.some((domain) => ['HEALTH', 'DOCUMENTS', 'SCHOOL'].includes(domain))) {
    actions.add('PROPOSE_PREPARATION_CHECKLIST');
  }
  if (domains.includes('HEALTH')) actions.add('PROPOSE_CARE_BRIEF');
  if (signals.some((signal) => signal.type === 'HANDOFF_UPCOMING')) actions.add('PROPOSE_HANDOFF');
  return [...actions];
}

export function buildStructuredDecision(context: DecisionContext, answerText: string): StructuredDecision {
  const attention = [...new Map(context.deterministicSignals.map((signal) => [
    `${signal.ruleId}:${signal.summary}`,
    { severity: signal.severity, text: signal.summary, ruleId: signal.ruleId },
  ])).values()];
  const alternatives = buildAlternatives(context);
  const hasSensitiveHealth = context.allowedDomains.some((domain) => domain === 'HEALTH' || domain === 'MEDICATION');
  return {
    // Situation is deliberately factual. The model-written answer may
    // contain explanatory signal text; reusing it here duplicated the same
    // warnings under both “Situação” and “Atenção”.
    situation: buildFactualSituation(context, answerText),
    attention,
    alternatives,
    suggestion: alternatives[0]
      ? {
          text: `${alternatives[0].title} é o próximo passo mais direto. A ZELII prepara e você confirma antes de qualquer envio.`,
          criteria: ['informações autorizadas', 'prioridade do alerta', 'menor mudança necessária'],
          uncertainty: alternatives[0].uncertainty,
        }
      : undefined,
    userActions: context.availableActions,
    sources: context.authorizedFacts.map((fact) => ({
      factId: fact.id,
      label: fact.summary,
      sourceType: fact.source.type,
      sourceId: fact.source.id,
      updatedAt: fact.source.updatedAt ?? fact.source.occurredAt,
      provenance: fact.source.provenance ?? 'USER_DECLARED',
      verificationStatus: fact.verificationStatus,
    })),
    accessedScope: {
      subjectPersonIds: context.subjectPersonIds,
      domains: context.allowedDomains,
      deniedDomains: context.deniedDomains,
    },
    safetyNotice: hasSensitiveHealth
      ? 'A ZELII organiza informações registradas e não substitui orientação de profissional de saúde.'
      : undefined,
  };
}

function buildFactualSituation(context: DecisionContext, fallback: string): string {
  const uniqueFacts = [...new Set(context.authorizedFacts.map((fact) => fact.summary.trim()).filter(Boolean))];
  if (uniqueFacts.length === 0) return fallback;
  return uniqueFacts.map((summary) => `• ${summary}`).join('\n');
}

function buildAlternatives(context: DecisionContext): DecisionAlternative[] {
  const alternatives: DecisionAlternative[] = [];
  const seen = new Set<string>();
  const add = (alternative: DecisionAlternative, sourceKey: string) => {
    const key = `${alternative.proposedActionType ?? alternative.title}:${sourceKey}`;
    if (seen.has(key) || alternatives.length >= 3) return;
    seen.add(key);
    alternatives.push(alternative);
  };

  for (const signal of context.deterministicSignals) {
    const sourceKey = signal.sourceRefs.map((source) => `${source.type}:${source.id}`).sort().join('|') || signal.id;
    if (signal.type === 'SCHEDULE_CONFLICT') {
      const missingTransport = signal.ruleId.endsWith(':MISSING_TRANSPORT');
      if (missingTransport) {
        add({
          id: `${signal.id}:assign-transport`,
          title: 'Definir quem vai levar ou buscar',
          impact: 'Resolve a lacuna de transporte sem mudar o horário do compromisso.',
          informationShared: ['SCHEDULE', 'TRANSPORTATION'],
          dependencies: ['escolher uma pessoa autorizada', 'confirmar a responsabilidade'],
          uncertainty: 'A disponibilidade da pessoa precisa ser confirmada.',
          proposedActionType: 'PROPOSE_RESPONSIBILITY_ASSIGNMENT',
          subjectPersonId: signal.subjectPersonIds[0],
          sourceEventId: signal.sourceRefs[0]?.id,
        }, sourceKey);
      } else {
        add({
          id: `${signal.id}:adjust-schedule`,
          title: 'Revisar um dos horários em conflito',
          impact: 'Pode remover a sobreposição, se algum compromisso puder ser alterado.',
          informationShared: ['SCHEDULE'],
          dependencies: ['confirmar qual compromisso pode mudar'],
          proposedActionType: 'PROPOSE_SCHEDULE_ADJUSTMENT',
        }, sourceKey);
      }
      add({
        id: `${signal.id}:request-help`,
        title: 'Pedir ajuda a uma pessoa autorizada',
        impact: 'Mantém o compromisso e distribui apenas a responsabilidade necessária.',
        informationShared: ['SCHEDULE'],
          dependencies: ['escolher a pessoa', 'revisar o que será compartilhado', 'aguardar confirmação'],
          uncertainty: 'A disponibilidade atual ainda precisa ser confirmada.',
          proposedActionType: 'PROPOSE_REQUEST',
          subjectPersonId: signal.subjectPersonIds[0],
          sourceEventId: signal.sourceRefs[0]?.id,
        }, sourceKey);
    } else if (signal.type === 'PREPARATION_INCOMPLETE' || signal.type === 'APPOINTMENT_UPCOMING') {
      add({
        id: `${signal.id}:checklist`,
        title: 'Preparar a checklist do compromisso',
        impact: 'Reduz esquecimentos sem alterar agenda ou responsabilidade.',
        informationShared: [],
        dependencies: ['revisão humana antes de concluir'],
        proposedActionType: 'PROPOSE_PREPARATION_CHECKLIST',
      }, sourceKey);
    }
    if (alternatives.length >= 3) break;
  }
  return alternatives;
}
