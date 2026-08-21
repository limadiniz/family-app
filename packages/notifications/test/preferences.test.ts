import { describe, expect, it } from 'vitest';
import { shouldDeliver } from '../src/preferences';
import type { NotificationPayload, NotificationPreference } from '../src/types';

const basePayload: NotificationPayload = {
  tenantId: 't1',
  recipientPersonId: 'p1',
  level: 'INFORMATIONAL',
  title: 'Lembrete',
  body: 'Prova de Mariana amanhã',
};

describe('shouldDeliver', () => {
  it('delivers by default when no preference is recorded', () => {
    expect(shouldDeliver(basePayload, []).deliver).toBe(true);
  });

  it('suppresses below the configured minimum level', () => {
    const prefs: NotificationPreference[] = [{ personId: 'p1', channel: 'PUSH', minLevel: 'IMPORTANT' }];
    expect(shouldDeliver(basePayload, prefs).deliver).toBe(false);
  });

  it('respects quiet hours for non-critical notifications', () => {
    const prefs: NotificationPreference[] = [
      { personId: 'p1', channel: 'PUSH', minLevel: 'INFORMATIONAL', quietHoursStart: '22:00', quietHoursEnd: '07:00' },
    ];
    const now = new Date('2026-08-19T23:30:00-03:00');
    expect(shouldDeliver(basePayload, prefs, now).deliver).toBe(false);
  });

  it('CRITICAL notifications always bypass quiet hours', () => {
    const prefs: NotificationPreference[] = [
      { personId: 'p1', channel: 'PUSH', minLevel: 'INFORMATIONAL', quietHoursStart: '22:00', quietHoursEnd: '07:00' },
    ];
    const now = new Date('2026-08-19T23:30:00-03:00');
    expect(shouldDeliver({ ...basePayload, level: 'CRITICAL' }, prefs, now).deliver).toBe(true);
  });
});
