import { describe, expect, it } from 'vitest';
import { canTransitionRequest } from '../src/entities/request';

describe('canTransitionRequest', () => {
  it('allows DRAFT -> SENT -> VIEWED -> ACCEPTED', () => {
    expect(canTransitionRequest('DRAFT', 'SENT')).toBe(true);
    expect(canTransitionRequest('SENT', 'VIEWED')).toBe(true);
    expect(canTransitionRequest('VIEWED', 'ACCEPTED')).toBe(true);
  });

  it('does not allow DRAFT -> ACCEPTED directly (§33: must be sent and responded to)', () => {
    expect(canTransitionRequest('DRAFT', 'ACCEPTED')).toBe(false);
  });

  it('terminal states (CANCELLED, EXPIRED, COMPLETED) accept no further transition', () => {
    expect(canTransitionRequest('CANCELLED', 'SENT')).toBe(false);
    expect(canTransitionRequest('EXPIRED', 'ACCEPTED')).toBe(false);
    expect(canTransitionRequest('COMPLETED', 'DISPUTED')).toBe(false);
  });

  it('DISPUTED preserves history and can only resolve to ACCEPTED/DECLINED/CANCELLED (§37: never deletes prior state)', () => {
    expect(canTransitionRequest('DISPUTED', 'ACCEPTED')).toBe(true);
    expect(canTransitionRequest('DISPUTED', 'DECLINED')).toBe(true);
    expect(canTransitionRequest('DISPUTED', 'COMPLETED')).toBe(false);
  });

  it('ACCEPTED can be DISPUTED later (a request accepted then contested)', () => {
    expect(canTransitionRequest('ACCEPTED', 'DISPUTED')).toBe(true);
  });
});
