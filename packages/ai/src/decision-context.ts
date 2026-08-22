import { FamilyPolicyEngine, type PolicyActor, type PolicyEngineInput } from '@family-app/policy-engine';
import type { PermissionDomain } from '@family-app/domain';
import { buildRetrievalRequests, resolveIntentDomains } from './intent';
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
}

export class DecisionContextBuilder {
  private readonly policyEngine = new FamilyPolicyEngine();

  constructor(private readonly deps: DecisionContextBuilderDeps) {}

  async build(actor: PolicyActor, question: string, subjectPersonIds: string[]): Promise<DecisionContext> {
    const requests = buildRetrievalRequests(question, [...new Set(subjectPersonIds)]);
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
      authorizedFacts.push(
        ...retrieved.map((fact) => normalizeFact(fact, decision.rule)),
      );
    }

    const timeWindow = resolveTimeWindow(question, this.deps.now?.() ?? new Date());
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

function resolveTimeWindow(question: string, now: Date): { startsAt: string; endsAt: string } | undefined {
  const lower = question.toLowerCase();
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  if (lower.includes('amanhã')) {
    start.setUTCDate(start.getUTCDate() + 1);
    end.setUTCDate(start.getUTCDate() + 1);
  } else if (lower.includes('semana')) {
    end.setUTCDate(start.getUTCDate() + 7);
  } else if (lower.includes('hoje')) {
    end.setUTCDate(start.getUTCDate() + 1);
  } else {
    return undefined;
  }
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
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
  const attention = context.deterministicSignals.map((signal) => ({
    severity: signal.severity,
    text: signal.summary,
    ruleId: signal.ruleId,
  }));
  const alternatives = buildAlternatives(context);
  const hasSensitiveHealth = context.allowedDomains.some((domain) => domain === 'HEALTH' || domain === 'MEDICATION');
  return {
    situation: answerText,
    attention,
    alternatives,
    suggestion: alternatives[0]
      ? {
          text: `Considere “${alternatives[0].title}” como próximo passo revisável.`,
          criteria: ['dados autorizados', 'sinais determinísticos', 'menor alteração necessária'],
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

function buildAlternatives(context: DecisionContext): DecisionAlternative[] {
  const alternatives: DecisionAlternative[] = [];
  for (const signal of context.deterministicSignals.slice(0, 3)) {
    if (signal.type === 'SCHEDULE_CONFLICT') {
      alternatives.push({
        id: `${signal.id}:request-help`,
        title: 'Preparar um pedido de ajuda para uma pessoa autorizada',
        impact: 'Mantém os compromissos e redistribui somente a responsabilidade necessária.',
        informationShared: ['SCHEDULE'],
        dependencies: ['escolher a pessoa', 'revisar o que será compartilhado', 'aguardar confirmação'],
        uncertainty: 'Disponibilidade passada não garante disponibilidade atual.',
        proposedActionType: 'PROPOSE_REQUEST',
      });
      alternatives.push({
        id: `${signal.id}:adjust-schedule`,
        title: 'Revisar um dos horários envolvidos',
        impact: 'Pode remover o conflito, mas depende da disponibilidade do compromisso.',
        informationShared: ['SCHEDULE'],
        dependencies: ['confirmar possibilidade de alteração'],
        proposedActionType: 'PROPOSE_SCHEDULE_ADJUSTMENT',
      });
    } else if (signal.type === 'PREPARATION_INCOMPLETE' || signal.type === 'APPOINTMENT_UPCOMING') {
      alternatives.push({
        id: `${signal.id}:checklist`,
        title: 'Preparar uma checklist para revisão',
        impact: 'Reduz esquecimentos sem alterar agenda ou responsabilidade.',
        informationShared: [],
        dependencies: ['revisão humana antes de concluir'],
        proposedActionType: 'PROPOSE_PREPARATION_CHECKLIST',
      });
    }
  }
  return alternatives;
}
