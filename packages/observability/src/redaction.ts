/**
 * Redaction helpers (§76). Applied to every structured log line and to
 * AuditEvent.context before persistence. Denylist approach: any key
 * whose name matches a sensitive pattern is replaced, regardless of
 * nesting depth — safer default than an allowlist that a developer
 * could forget to extend.
 */
const SENSITIVE_KEY_PATTERN =
  /(password|senha|token|secret|authorization|api[_-]?key|prescription|receita|diagnosis|diagnostico|cpf|document(?:o)?(?:number)?|medical|saude|health)/i;

const REDACTED = '[REDACTED]';

export function redact<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen)) as unknown as T;
  }

  const output: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = REDACTED;
    } else if (val && typeof val === 'object') {
      output[key] = redact(val, seen);
    } else {
      output[key] = val;
    }
  }
  return output as T;
}
