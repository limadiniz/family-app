import type { NotificationLevel, NotificationPayload, NotificationPreference } from './types';

const LEVEL_RANK: Record<NotificationLevel, number> = { INFORMATIONAL: 0, IMPORTANT: 1, CRITICAL: 2 };

/**
 * Decides whether a notification should actually be sent, given the
 * recipient's preferences (§51 — "evitar notification fatigue"). CRITICAL
 * notifications always bypass quiet hours; everything else respects them.
 */
export function shouldDeliver(
  payload: NotificationPayload,
  preferences: NotificationPreference[],
  now: Date = new Date(),
): { deliver: boolean; reason?: string } {
  const applicable = preferences.filter(
    (p) => p.personId === payload.recipientPersonId && (!p.category || p.category === payload.category),
  );

  if (applicable.length === 0) {
    return { deliver: true }; // no explicit preference recorded yet -> default to delivering
  }

  const blockedByLevel = applicable.every((p) => LEVEL_RANK[payload.level] < LEVEL_RANK[p.minLevel]);
  if (blockedByLevel) {
    return { deliver: false, reason: 'below_minimum_level' };
  }

  if (payload.level !== 'CRITICAL') {
    const inQuietHours = applicable.some((p) => isWithinQuietHours(p, now));
    if (inQuietHours) {
      return { deliver: false, reason: 'quiet_hours' };
    }
  }

  return { deliver: true };
}

function parseHHmm(value: string): number {
  const [h = 0, m = 0] = value.split(':').map(Number);
  return h * 60 + m;
}

function isWithinQuietHours(pref: NotificationPreference, now: Date): boolean {
  if (!pref.quietHoursStart || !pref.quietHoursEnd) return false;
  const startMinutes = parseHHmm(pref.quietHoursStart);
  const endMinutes = parseHHmm(pref.quietHoursEnd);
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  if (startMinutes <= endMinutes) {
    return minutesNow >= startMinutes && minutesNow < endMinutes;
  }
  // Overnight window, e.g. 22:00 -> 07:00
  return minutesNow >= startMinutes || minutesNow < endMinutes;
}
