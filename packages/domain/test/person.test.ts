import { describe, expect, it } from 'vitest';
import { derivePersonAgeFacts } from '../src/entities/person';

describe('derivePersonAgeFacts', () => {
  it('classifies an adult with no birth date', () => {
    expect(derivePersonAgeFacts(null)).toEqual({ personType: 'ADULT', isMinor: false });
  });

  it('classifies an infant under 2', () => {
    const asOf = new Date('2026-08-19');
    expect(derivePersonAgeFacts('2025-06-01', asOf)).toEqual({ personType: 'INFANT', isMinor: true });
  });

  it('classifies a minor between 2 and 18', () => {
    const asOf = new Date('2026-08-19');
    expect(derivePersonAgeFacts('2018-05-10', asOf)).toEqual({ personType: 'MINOR', isMinor: true });
  });

  it('classifies an adult 18 or older', () => {
    const asOf = new Date('2026-08-19');
    expect(derivePersonAgeFacts('1988-04-12', asOf)).toEqual({ personType: 'ADULT', isMinor: false });
  });
});
