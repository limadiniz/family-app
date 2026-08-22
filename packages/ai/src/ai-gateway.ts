import type { PolicyActor, PolicyEngineInput } from '@family-app/policy-engine';
import type { PermissionDomain } from '@family-app/domain';
import { buildStructuredDecision, DecisionContextBuilder } from './decision-context';
import type { AiAnswer, DecisionSignal, LlmCompletionFn, RetrievalFn } from './types';

/**
 * AI Gateway (§53-58). This is the ONLY component allowed to sit between
 * a user's question and an LLM. It is structurally impossible for it to
 * retrieve a fact the Policy Engine has not explicitly allowed for the
 * current actor: `retrieve()` is only ever called per-domain, per-subject,
 * AFTER `policyEngine.authorize()` returned ALLOW for that exact pair.
 *
 * §54's prohibition ("mobile/web -> LLM -> database" direct path) is
 * enforced by construction: apps/web and apps/mobile never hold an LLM
 * API key and never talk to Postgres directly — every AI request goes
 * through apps/api, which is the only caller of this class.
 */
export class AiGateway {
  constructor(
    private readonly deps: {
      retrieve: RetrievalFn;
      complete: LlmCompletionFn;
      loadPolicyInput: (actor: PolicyActor, subjectPersonId: string) => Promise<PolicyEngineInput>;
      loadSignals?: (input: {
        actor: PolicyActor;
        subjectPersonIds: string[];
        allowedDomains: PermissionDomain[];
        authorizedScopes: Array<{ subjectPersonId: string; domain: PermissionDomain; decisionRule: string }>;
        facts: import('./types').AuthorizedFact[];
        timeWindow?: { startsAt: string; endsAt: string };
      }) => Promise<DecisionSignal[]>;
      recordAudit: (event: {
        actor: PolicyActor;
        allowedDomains: string[];
        deniedDomains: string[];
        factCount: number;
        signalCount: number;
        availableActions: string[];
      }) => Promise<void>;
      aiEnabled: boolean;
    },
  ) {}

  async ask(actor: PolicyActor, question: string, subjectPersonIds: string[]): Promise<AiAnswer> {
    if (!this.deps.aiEnabled) {
      return {
        text: 'O Family Copilot ainda não está habilitado nesta conta.',
        facts: [],
        deniedDomains: [],
      };
    }

    const context = await new DecisionContextBuilder({
      retrieve: this.deps.retrieve,
      loadPolicyInput: this.deps.loadPolicyInput,
      loadSignals: this.deps.loadSignals,
    }).build(actor, question, subjectPersonIds);

    await this.deps.recordAudit({
      actor,
      allowedDomains: context.allowedDomains,
      deniedDomains: context.deniedDomains,
      factCount: context.authorizedFacts.length,
      signalCount: context.deterministicSignals.length,
      availableActions: context.availableActions,
    });

    if (context.authorizedFacts.length === 0 && context.deterministicSignals.length === 0) {
      return {
        text:
          context.deniedDomains.length > 0
            ? 'Você não tem permissão para acessar essa informação.'
            : 'Não encontrei informações registradas para responder a essa pergunta.',
        facts: [],
        deniedDomains: context.deniedDomains,
      };
    }

    const text = await this.deps.complete({
      question,
      facts: context.authorizedFacts,
      signals: context.deterministicSignals,
      allowedDomains: context.allowedDomains,
    });
    return {
      text,
      facts: context.authorizedFacts,
      deniedDomains: context.deniedDomains,
      decision: buildStructuredDecision(context, text),
    };
  }
}
