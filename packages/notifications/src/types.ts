/** Notification levels (§49) and channels (§51). */
export type NotificationLevel = 'CRITICAL' | 'IMPORTANT' | 'INFORMATIONAL';
export type NotificationChannel = 'PUSH' | 'EMAIL' | 'IN_APP';

export interface NotificationPayload {
  tenantId: string;
  recipientPersonId: string;
  level: NotificationLevel;
  title: string;
  body: string;
  /** Deep link, e.g. family-app://today or /app/today */
  actionUrl?: string;
  category?: string; // matches CalendarEventCategory / domain where relevant
  correlationId?: string;
}

export interface NotificationSender {
  send(payload: NotificationPayload): Promise<{ delivered: boolean; skippedReason?: string }>;
}

/** §51 — preferences that can suppress a notification before it's sent. */
export interface NotificationPreference {
  personId: string;
  channel: NotificationChannel;
  category?: string;
  minLevel: NotificationLevel;
  quietHoursStart?: string; // "HH:mm" local time
  quietHoursEnd?: string;
}
