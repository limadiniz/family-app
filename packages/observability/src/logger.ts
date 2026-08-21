import pino from 'pino';
import { redact } from './redaction';

/**
 * Structured logger shared by apps/api and background jobs. Every call
 * site should pass a `correlationId` (propagated from the inbound
 * request) so a single user-facing action can be traced across services
 * (§75).
 */
export function createLogger(opts: { name: string; level?: string }) {
  return pino({
    name: opts.name,
    level: opts.level ?? process.env.LOG_LEVEL ?? 'info',
    formatters: {
      log(object) {
        return redact(object);
      },
    },
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
      censor: '[REDACTED]',
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
