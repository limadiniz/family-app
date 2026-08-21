import type { PermissionDomain } from '@family-app/domain';
import type { RetrievalRequest } from './types';

/**
 * ASSUMPTION (§128): a real intent resolver is an LLM-assisted
 * classification step, planned for Phase 6. This keyword-based stand-in
 * exists ONLY so the surrounding Gateway plumbing — the part that
 * actually matters for security (§53-56) — is real and testable today.
 * It intentionally errs toward requesting MORE domains than strictly
 * needed; the Policy Engine, not this heuristic, is the security
 * boundary.
 */
const DOMAIN_KEYWORDS: Array<{ domain: PermissionDomain; keywords: string[] }> = [
  { domain: 'HEALTH', keywords: ['consulta', 'médic', 'pediatra', 'saúde', 'histórico médico', 'alergia'] },
  { domain: 'MEDICATION', keywords: ['medicamento', 'remédio', 'dose', 'receita'] },
  { domain: 'SCHOOL', keywords: ['escola', 'prova', 'dever', 'boletim', 'professor'] },
  { domain: 'SCHEDULE', keywords: ['agenda', 'compromisso', 'hoje', 'amanhã', 'semana'] },
  { domain: 'ACTIVITIES', keywords: ['natação', 'futebol', 'atividade', 'curso', 'aula'] },
  { domain: 'FINANCE', keywords: ['gasto', 'despesa', 'pagamento', 'mensalidade', 'financeiro'] },
  { domain: 'DOCUMENTS', keywords: ['documento', 'carteirinha', 'certidão'] },
  { domain: 'EMERGENCY', keywords: ['emergência', 'urgência'] },
];

export function resolveIntentDomains(question: string): PermissionDomain[] {
  const lower = question.toLowerCase();
  const matched = DOMAIN_KEYWORDS.filter((entry) => entry.keywords.some((kw) => lower.includes(kw))).map(
    (e) => e.domain,
  );
  return matched.length > 0 ? matched : ['SCHEDULE'];
}

export function buildRetrievalRequests(question: string, subjectPersonIds: string[]): RetrievalRequest[] {
  const domains = resolveIntentDomains(question);
  return domains.flatMap((domain) => subjectPersonIds.map((subjectPersonId) => ({ domain, subjectPersonId })));
}
