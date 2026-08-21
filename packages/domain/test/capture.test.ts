import { describe, expect, it } from 'vitest';
import { canTransitionCaptureItem } from '../src/entities/capture';

describe('canTransitionCaptureItem', () => {
  it('allows RECEIVED -> PROCESSING', () => {
    expect(canTransitionCaptureItem('RECEIVED', 'PROCESSING')).toBe(true);
  });

  it('never allows skipping straight to CONFIRMED from RECEIVED (§77: nothing persists without confirmation of a READY proposal)', () => {
    expect(canTransitionCaptureItem('RECEIVED', 'CONFIRMED')).toBe(false);
    expect(canTransitionCaptureItem('PROCESSING', 'CONFIRMED')).toBe(false);
  });

  it('requires READY before CONFIRMED', () => {
    expect(canTransitionCaptureItem('READY', 'CONFIRMED')).toBe(true);
  });

  it('terminal states (CONFIRMED, REJECTED) only move to ARCHIVED', () => {
    expect(canTransitionCaptureItem('CONFIRMED', 'ARCHIVED')).toBe(true);
    expect(canTransitionCaptureItem('CONFIRMED', 'READY')).toBe(false);
    expect(canTransitionCaptureItem('ARCHIVED', 'PROCESSING')).toBe(false);
  });

  it('FAILED can be retried back to PROCESSING', () => {
    expect(canTransitionCaptureItem('FAILED', 'PROCESSING')).toBe(true);
  });
});
