import { describe, expect, it } from 'vitest';
import { redact } from '../src/redaction';

describe('redact', () => {
  it('redacts sensitive keys at any nesting depth', () => {
    const input = {
      userId: 'abc',
      password: 'hunter2',
      nested: { token: 'xyz', ok: 'fine' },
      prompt: 'quais os medicamentos do Pedro?',
    };
    const output = redact(input) as typeof input & { nested: { token: string; ok: string } };
    expect(output.userId).toBe('abc');
    expect(output.password).toBe('[REDACTED]');
    expect(output.nested.token).toBe('[REDACTED]');
    expect(output.nested.ok).toBe('fine');
  });

  it('leaves primitives untouched', () => {
    expect(redact('plain string')).toBe('plain string');
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBe(null);
  });
});
