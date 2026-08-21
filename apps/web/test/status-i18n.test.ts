import { describe, expect, it } from 'vitest';
import { translateStatus } from '../src/lib/status-i18n';

describe('translateStatus', () => {
  it('translates a known enum value with its semantic tone', () => {
    expect(translateStatus('task', 'DONE')).toEqual({ label: 'Concluída', tone: 'success' });
    expect(translateStatus('task', 'OVERDUE')).toEqual({ label: 'Atrasada', tone: 'critical' });
  });

  it('flags MEDICAL_* capture categories as critical tone (§4 — dado de saúde)', () => {
    expect(translateStatus('captureCategory', 'MEDICAL_PRESCRIPTION').tone).toBe('critical');
    expect(translateStatus('captureCategory', 'MEDICAL_EXAM').tone).toBe('critical');
    expect(translateStatus('captureCategory', 'MEDICAL_APPOINTMENT').tone).toBe('critical');
    // um valor não médico do mesmo domínio não deve carregar o mesmo tom
    expect(translateStatus('captureCategory', 'ACTIVITY').tone).not.toBe('critical');
  });

  it('falls back to a humanized title-case label for a value missing from the dictionary, never the raw enum', () => {
    const result = translateStatus('task', 'SOME_FUTURE_STATUS');
    expect(result.label).toBe('Some Future Status');
    expect(result.tone).toBe('neutral');
    expect(result.label).not.toBe('SOME_FUTURE_STATUS');
  });

  it('covers every domain with at least one real translation', () => {
    expect(translateStatus('request', 'ACCEPTED').label).toBe('Aceita');
    expect(translateStatus('requestAction', 'SENT').label).toBe('Enviada');
    expect(translateStatus('capture', 'NEEDS_REVIEW').label).toBe('Precisa de revisão');
    expect(translateStatus('captureProposal', 'EDITED_AND_CONFIRMED').label).toBe('Editado e confirmado');
    expect(translateStatus('captureProposalTarget', 'CALENDAR_EVENT').label).toContain('evento');
    expect(translateStatus('handoff', 'DELAYED').label).toBe('Atrasado');
    expect(translateStatus('responsibility', 'FAILED').label).toBe('Não realizada');
    expect(translateStatus('calendarCategory', 'HEALTH').tone).toBe('critical');
    expect(translateStatus('notificationLevel', 'CRITICAL').tone).toBe('critical');
  });
});
