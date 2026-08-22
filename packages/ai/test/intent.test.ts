import { describe, expect, it } from 'vitest';
import { buildRetrievalRequests, resolveIntentDomains, resolveTimeWindow } from '../src';

describe('AI intent and temporal scope', () => {
  it('normalizes Portuguese accents for health, school and transportation intents', () => {
    expect(resolveIntentDomains('Quem leva à consulta médica depois da escola?')).toEqual(
      expect.arrayContaining(['HEALTH', 'SCHOOL', 'TRANSPORTATION']),
    );
  });

  it('resolves amanhã using the configured family timezone', () => {
    const window = resolveTimeWindow(
      'O que temos amanhã?',
      new Date('2026-08-22T15:00:00.000Z'),
      'America/Sao_Paulo',
    );
    expect(window).toEqual({
      startsAt: '2026-08-23T03:00:00.000Z',
      endsAt: '2026-08-24T03:00:00.000Z',
    });
  });

  it('carries the question and temporal window into every authorized retrieval request', () => {
    const timeWindow = { startsAt: '2026-08-23T03:00:00.000Z', endsAt: '2026-08-24T03:00:00.000Z' };
    const requests = buildRetrievalRequests('Agenda de amanhã', ['p1', 'p2'], timeWindow);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual(expect.objectContaining({ query: 'Agenda de amanhã', timeWindow }));
  });
});
