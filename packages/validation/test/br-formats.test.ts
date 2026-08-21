import { describe, expect, it } from 'vitest';
import { brPhoneSchema, cepSchema, formatBRL } from '../src/br-formats';

describe('br-formats', () => {
  it('validates a CEP with punctuation stripped', () => {
    expect(cepSchema.parse('01310-100')).toBe('01310100');
  });

  it('rejects an invalid CEP length', () => {
    expect(() => cepSchema.parse('123')).toThrow();
  });

  it('validates an 11-digit mobile phone', () => {
    expect(brPhoneSchema.parse('(11) 91234-5678')).toBe('11912345678');
  });

  it('formats cents as BRL', () => {
    expect(formatBRL(12345)).toContain('123,45');
  });
});
