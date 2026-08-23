import { createHash } from 'node:crypto';
import type { PermissionDomain } from '@family-app/domain';
import type { AuthorizedFact, DecisionSignal } from './types';

export const EXACT_CACHE_ALLOWED_DOMAINS: ReadonlySet<PermissionDomain> = new Set([
  'SCHOOL',
  'DOCUMENTS',
  'ACTIVITIES',
  'NOTES',
]);

const EXACT_CACHE_ALLOWED_SOURCE_TYPES = new Set(['capture_items', 'ai_memory_items']);

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function normalizeCacheQuestion(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

export type ExactCacheDescriptor = {
  exactKey: string;
  questionHash: string;
  policyFingerprint: string;
  sourceFingerprint: string;
  sourceRefs: Array<{ type: string; id: string; version: string }>;
  domains: PermissionDomain[];
  subjectPersonIds: string[];
};

export function buildExactCacheDescriptor(input: {
  tenantId: string;
  actorPersonId: string;
  question: string;
  facts: AuthorizedFact[];
  signals: DecisionSignal[];
  allowedDomains: PermissionDomain[];
  promptVersion: string;
  modelVersion: string;
  locale?: string;
  timeZone?: string;
}): ExactCacheDescriptor | null {
  const domains = [...new Set(input.allowedDomains)].sort();
  if (
    input.facts.length === 0 ||
    input.signals.length > 0 ||
    domains.length === 0 ||
    domains.some((domain) => !EXACT_CACHE_ALLOWED_DOMAINS.has(domain)) ||
    input.facts.some(
      (fact) =>
        !domains.includes(fact.domain) ||
        fact.authorization.domain !== fact.domain ||
        fact.authorization.subjectPersonId !== fact.subjectPersonId,
    ) ||
    /\b(agora|hoje|amanh[ãa]|ontem|esta semana|pr[oó]xima semana)\b/i.test(input.question) ||
    input.facts.some((fact) => !EXACT_CACHE_ALLOWED_SOURCE_TYPES.has(fact.source.type))
  ) {
    return null;
  }

  const subjectPersonIds = [...new Set(input.facts.map((fact) => fact.subjectPersonId))].sort();
  const sourceRefs = input.facts
    .map((fact) => ({
      type: fact.source.type,
      id: fact.source.id,
      version: fact.source.updatedAt ?? fact.source.occurredAt ?? 'UNVERSIONED',
    }))
    .sort((left, right) => `${left.type}:${left.id}`.localeCompare(`${right.type}:${right.id}`));
  if (sourceRefs.some((source) => source.version === 'UNVERSIONED')) return null;

  const policyFingerprint = sha256(
    stableJson(
      input.facts
        .map((fact) => ({
          subjectPersonId: fact.subjectPersonId,
          domain: fact.authorization.domain,
          action: fact.authorization.action,
          decisionRule: fact.authorization.decisionRule,
        }))
        .sort((left, right) => stableJson(left).localeCompare(stableJson(right))),
    ),
  );
  const sourceFingerprint = sha256(stableJson(sourceRefs));
  const questionHash = sha256(normalizeCacheQuestion(input.question));
  const exactKey = sha256(
    stableJson({
      tenantId: input.tenantId,
      actorPersonId: input.actorPersonId,
      questionHash,
      policyFingerprint,
      sourceFingerprint,
      domains,
      subjectPersonIds,
      promptVersion: input.promptVersion,
      modelVersion: input.modelVersion,
      locale: input.locale ?? 'pt-BR',
      timeZone: input.timeZone ?? 'America/Sao_Paulo',
    }),
  );
  return {
    exactKey,
    questionHash,
    policyFingerprint,
    sourceFingerprint,
    sourceRefs,
    domains,
    subjectPersonIds,
  };
}
