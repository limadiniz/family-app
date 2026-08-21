import type { NotificationPayload, NotificationSender } from '../types';

/**
 * Expo Push sender (§50). Requires EXPO_PUSH_ACCESS_TOKEN and a
 * PushToken lookup (persisted via the `Device`/`PushToken` entities,
 * Phase 2). Implemented against Expo's HTTP push API directly rather
 * than a heavier SDK, since the payload shape is small and stable.
 */
export class ExpoPushSender implements NotificationSender {
  constructor(
    private readonly opts: {
      accessToken: string;
      resolvePushTokens: (personId: string) => Promise<string[]>;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async send(payload: NotificationPayload): Promise<{ delivered: boolean; skippedReason?: string }> {
    const tokens = await this.opts.resolvePushTokens(payload.recipientPersonId);
    if (tokens.length === 0) {
      return { delivered: false, skippedReason: 'no_registered_device' };
    }

    const doFetch = this.opts.fetchImpl ?? fetch;
    const messages = tokens.map((to) => ({
      to,
      title: payload.title,
      body: payload.body,
      data: { actionUrl: payload.actionUrl, category: payload.category, correlationId: payload.correlationId },
      priority: payload.level === 'CRITICAL' ? 'high' : 'default',
    }));

    const res = await doFetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.opts.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(messages),
    });

    return { delivered: res.ok };
  }
}
