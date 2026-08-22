import { describe, expect, it } from 'vitest';
import { buildOnboardingUrl, ONBOARDING_FALLBACK_RETURN_TO, resolveSafeReturnTo } from '../src/lib/onboarding-redirect';

/**
 * §8 — the security-critical piece of the onboarding-incomplete redesign:
 * `returnTo` is attacker-controllable (a crafted link), so this is the
 * one place that must never trust it as-is.
 */
describe('resolveSafeReturnTo', () => {
  it('returns the fallback for null/undefined/empty input', () => {
    expect(resolveSafeReturnTo(null)).toBe(ONBOARDING_FALLBACK_RETURN_TO);
    expect(resolveSafeReturnTo(undefined)).toBe(ONBOARDING_FALLBACK_RETURN_TO);
    expect(resolveSafeReturnTo('')).toBe(ONBOARDING_FALLBACK_RETURN_TO);
  });

  it('accepts every allowlisted internal /app/* path verbatim', () => {
    expect(resolveSafeReturnTo('/app/capture')).toBe('/app/capture');
    expect(resolveSafeReturnTo('/app/care-network')).toBe('/app/care-network');
    expect(resolveSafeReturnTo('/app/tasks')).toBe('/app/tasks');
  });

  it('never redirects to /app/onboarding itself — no loop', () => {
    expect(resolveSafeReturnTo('/app/onboarding')).toBe(ONBOARDING_FALLBACK_RETURN_TO);
    expect(resolveSafeReturnTo('/app/onboarding?returnTo=/app/today')).toBe(ONBOARDING_FALLBACK_RETURN_TO);
  });

  it('blocks open redirect to an external URL, even one that looks path-like', () => {
    expect(resolveSafeReturnTo('https://evil.example.com/app/today')).toBe(ONBOARDING_FALLBACK_RETURN_TO);
    expect(resolveSafeReturnTo('//evil.example.com')).toBe(ONBOARDING_FALLBACK_RETURN_TO);
    expect(resolveSafeReturnTo('http://evil.example.com')).toBe(ONBOARDING_FALLBACK_RETURN_TO);
  });

  it('blocks protocol-relative and non-http schemes', () => {
    expect(resolveSafeReturnTo('javascript:alert(1)')).toBe(ONBOARDING_FALLBACK_RETURN_TO);
    expect(resolveSafeReturnTo('data:text/html,<script>alert(1)</script>')).toBe(ONBOARDING_FALLBACK_RETURN_TO);
  });

  it('blocks a path that merely starts with /app/ but is not an allowlisted route', () => {
    expect(resolveSafeReturnTo('/app/does-not-exist')).toBe(ONBOARDING_FALLBACK_RETURN_TO);
    expect(resolveSafeReturnTo('/app/../etc/passwd')).toBe(ONBOARDING_FALLBACK_RETURN_TO);
  });

  it('strips a query/hash appended to an otherwise-allowlisted path (contract: always returns the bare allowlisted path)', () => {
    expect(resolveSafeReturnTo('/app/today?foo=bar')).toBe('/app/today');
    expect(resolveSafeReturnTo('/app/capture#section')).toBe('/app/capture');
  });
});

describe('buildOnboardingUrl', () => {
  it('builds an onboarding URL carrying the validated returnTo', () => {
    expect(buildOnboardingUrl('/app/capture')).toBe('/app/onboarding?returnTo=%2Fapp%2Fcapture');
  });

  it('falls back to the default return path for an unsafe or missing source path (no loop, no open redirect)', () => {
    expect(buildOnboardingUrl(null)).toBe(`/app/onboarding?returnTo=${encodeURIComponent(ONBOARDING_FALLBACK_RETURN_TO)}`);
    expect(buildOnboardingUrl('/app/onboarding')).toBe(
      `/app/onboarding?returnTo=${encodeURIComponent(ONBOARDING_FALLBACK_RETURN_TO)}`,
    );
    expect(buildOnboardingUrl('https://evil.example.com')).toBe(
      `/app/onboarding?returnTo=${encodeURIComponent(ONBOARDING_FALLBACK_RETURN_TO)}`,
    );
  });
});
