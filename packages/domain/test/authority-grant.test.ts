import { describe, expect, it } from 'vitest';
import { isGrantCurrentlyActive } from '../src/entities/authority-grant';

describe('isGrantCurrentlyActive', () => {
  it('is active with no bounds and no revocation', () => {
    expect(isGrantCurrentlyActive({ validFrom: null, validUntil: null, revokedAt: null })).toBe(true);
  });

  it('is inactive once revoked', () => {
    expect(
      isGrantCurrentlyActive({ validFrom: null, validUntil: null, revokedAt: '2026-01-01T00:00:00Z' }),
    ).toBe(false);
  });

  it('is inactive before validFrom', () => {
    const at = new Date('2026-01-01T00:00:00Z');
    expect(
      isGrantCurrentlyActive({ validFrom: '2026-06-01T00:00:00Z', validUntil: null, revokedAt: null }, at),
    ).toBe(false);
  });

  it('is inactive after validUntil', () => {
    const at = new Date('2026-12-01T00:00:00Z');
    expect(
      isGrantCurrentlyActive({ validFrom: null, validUntil: '2026-06-01T00:00:00Z', revokedAt: null }, at),
    ).toBe(false);
  });
});
