import { describe, expect, it } from 'vitest';
import { canTransitionHandoff } from '../src/entities/care';

describe('canTransitionHandoff', () => {
  it('allows EXPECTED -> CONFIRMED', () => {
    expect(canTransitionHandoff('EXPECTED', 'CONFIRMED')).toBe(true);
  });

  it('does not allow COMPLETED -> anything (terminal state)', () => {
    expect(canTransitionHandoff('COMPLETED', 'CONFIRMED')).toBe(false);
    expect(canTransitionHandoff('COMPLETED', 'CANCELLED')).toBe(false);
  });

  it('allows DISPUTED to be resolved back to CONFIRMED or CANCELLED only', () => {
    expect(canTransitionHandoff('DISPUTED', 'CONFIRMED')).toBe(true);
    expect(canTransitionHandoff('DISPUTED', 'CANCELLED')).toBe(true);
    expect(canTransitionHandoff('DISPUTED', 'COMPLETED')).toBe(false);
  });
});
