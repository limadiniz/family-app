import { FamilyPolicyEngine, type PolicyActor, type PolicyEngineInput } from '@family-app/policy-engine';
import { buildRetrievalRequests } from './intent';
import type { AiAnswer, LlmCompletionFn, RetrievalFn, RetrievedFact } from './types';

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
  private readonly policyEngine = new FamilyPolicyEngine();

  constructor(
    private readonly deps: {
      retrieve: RetrievalFn;
      complete: LlmCompletionFn;
      loadPolicyInput: (actor: PolicyActor, subjectPersonId: string) => Promise<PolicyEngineInput>;
      recordAudit: (event: {
        actor: PolicyActor;
        question: string;
        allowedDomains: string[];
        deniedDomains: string[];
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

    const requests = buildRetrievalRequests(question, subjectPersonIds);

    const facts: RetrievedFact[] = [];
    const deniedDomains: string[] = [];
    const allowedDomains: string[] = [];

    for (const request of requests) {
      const policyInput = await this.deps.loadPolicyInput(actor, request.subjectPersonId);
      const decision = this.policyEngine.authorize(
        {
          actor,
          action: 'VIEW',
          domain: request.domain,
          subjectPersonId: request.subjectPersonId,
          subjectTenantId: actor.tenantId,
          context: { purpose: `ai_query: ${question}` },
        },
        policyInput,
      );

      if (decision.decision !== 'ALLOW') {
        deniedDomains.push(request.domain);
        continue;
      }

      allowedDomains.push(request.domain);
      const retrieved = await this.deps.retrieve(request);
      facts.push(...retrieved);
    }

    await this.deps.recordAudit({ actor, question, allowedDomains, deniedDomains });

    if (facts.length === 0) {
      return {
        text:
          deniedDomains.length > 0
            ? 'Você não tem permissão para acessar essa informação.'
            : 'Não encontrei informações registradas para responder a essa pergunta.',
        facts: [],
        deniedDomains: deniedDomains as never,
      };
    }

    const text = await this.deps.complete({ question, facts });
    return { text, facts, deniedDomains: deniedDomains as never };
  }
}
