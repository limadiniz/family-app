import { describe, expect, it } from 'vitest';
import { buildExactCacheDescriptor } from '../src/response-cache';
import type { AuthorizedFact } from '../src/types';

const fact: AuthorizedFact = {
  id: 'capture_items:c1',
  domain: 'SCHOOL',
  subjectPersonId: 'child-1',
  summary: 'Autorização entregue.',
  value: { summary: 'Autorização entregue.' },
  source: { type: 'capture_items', id: 'c1', updatedAt: '2026-08-22T12:00:00Z' },
  authorization: {
    action: 'VIEW',
    domain: 'SCHOOL',
    subjectPersonId: 'child-1',
    decisionRule: 'ROLE_DEFAULT_ALLOW',
  },
  verificationStatus: 'CONFIRMED',
};

function descriptor(question = 'O que a escola pediu?') {
  return buildExactCacheDescriptor({
    tenantId: 'tenant-1',
    actorPersonId: 'adult-1',
    question,
    facts: [fact],
    signals: [],
    allowedDomains: ['SCHOOL'],
    promptVersion: 'v1',
    modelVersion: 'model-1',
  });
}

describe('exact response cache descriptor', () => {
  it('is deterministic after harmless question normalization', () => {
    expect(descriptor('  O que a escola   pediu? ')?.exactKey).toBe(descriptor()?.exactKey);
  });

  it('changes when source or policy versions change', () => {
    const base = descriptor();
    const changedSource = buildExactCacheDescriptor({
      tenantId: 'tenant-1',
      actorPersonId: 'adult-1',
      question: 'O que a escola pediu?',
      facts: [{ ...fact, source: { ...fact.source, updatedAt: '2026-08-22T13:00:00Z' } }],
      signals: [],
      allowedDomains: ['SCHOOL'],
      promptVersion: 'v1',
      modelVersion: 'model-1',
    });
    expect(changedSource?.exactKey).not.toBe(base?.exactKey);
  });

  it('rejects relative-time, sensitive, signaled and unversioned requests', () => {
    expect(descriptor('O que a escola pediu hoje?')).toBeNull();
    expect(
      buildExactCacheDescriptor({
        tenantId: 'tenant-1',
        actorPersonId: 'adult-1',
        question: 'Qual é a informação?',
        facts: [
          { ...fact, domain: 'HEALTH', authorization: { ...fact.authorization, domain: 'HEALTH' } },
        ],
        signals: [],
        allowedDomains: ['HEALTH'],
        promptVersion: 'v1',
        modelVersion: 'model-1',
      }),
    ).toBeNull();
    expect(
      buildExactCacheDescriptor({
        tenantId: 'tenant-1',
        actorPersonId: 'adult-1',
        question: 'O que a escola pediu?',
        facts: [{ ...fact, source: { type: 'capture_items', id: 'c1' } }],
        signals: [],
        allowedDomains: ['SCHOOL'],
        promptVersion: 'v1',
        modelVersion: 'model-1',
      }),
    ).toBeNull();
  });

  it('rejects a fact whose declared authorization scope does not match the fact', () => {
    expect(
      buildExactCacheDescriptor({
        tenantId: 'tenant-1',
        actorPersonId: 'adult-1',
        question: 'O que a escola pediu?',
        facts: [{ ...fact, authorization: { ...fact.authorization, subjectPersonId: 'child-2' } }],
        signals: [],
        allowedDomains: ['SCHOOL'],
        promptVersion: 'v1',
        modelVersion: 'model-1',
      }),
    ).toBeNull();
  });
});
