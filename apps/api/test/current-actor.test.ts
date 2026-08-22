import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { resolveCurrentActor } from '../src/common/current-actor.decorator';
import type { ActorRequest, RequestActor } from '../src/common/auth.guard';

/**
 * §8: the "finish onboarding first" gate. Covers the exact case the
 * redesign's onboarding-incomplete screen depends on — a stable, typed
 * error (`code: 'ONBOARDING_REQUIRED'`) rather than a bare message
 * string a client would have to pattern-match.
 */
function makeCtx(actor: RequestActor): ExecutionContext {
  const request: Partial<ActorRequest> = { actor };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

const onboardedActor: RequestActor = {
  authUserId: 'auth-1',
  tenantId: 'tenant-1',
  personId: 'person-1',
  bearerToken: 'token-1',
  tenantMemberships: [],
};

const notOnboardedActor: RequestActor = {
  authUserId: 'auth-2',
  tenantId: null,
  personId: null,
  bearerToken: 'token-2',
  tenantMemberships: [],
};

describe('resolveCurrentActor', () => {
  it('returns the actor unchanged when onboarded (default requireOnboarded)', () => {
    expect(resolveCurrentActor(undefined, makeCtx(onboardedActor))).toBe(onboardedActor);
  });

  it('throws ForbiddenException with a stable ONBOARDING_REQUIRED code when not onboarded (default requireOnboarded)', () => {
    expect.assertions(3);
    try {
      resolveCurrentActor(undefined, makeCtx(notOnboardedActor));
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const body = (err as ForbiddenException).getResponse() as { code: string; message: string };
      expect(body.code).toBe('ONBOARDING_REQUIRED');
      // Kept for backward-compat clients that still string-match the message (§8).
      expect(body.message).toMatch(/cadastro inicial/i);
    }
  });

  it('does not throw when requireOnboarded: false, even for a not-onboarded actor', () => {
    expect(resolveCurrentActor({ requireOnboarded: false }, makeCtx(notOnboardedActor))).toBe(notOnboardedActor);
  });

  it('throws when requireOnboarded: true is explicit and only tenantId is missing personId', () => {
    const partial: RequestActor = { ...notOnboardedActor, tenantId: 'tenant-x', personId: null };
    expect(() => resolveCurrentActor({ requireOnboarded: true }, makeCtx(partial))).toThrow(ForbiddenException);
  });
});
