/**
 * §8 — where a not-yet-onboarded user was trying to go, preserved across
 * the onboarding wizard and restored on completion.
 *
 * Security boundary: `returnTo` arrives as a URL query param, which means
 * it's attacker-controllable (a crafted link) — never trust it as-is.
 * `resolveSafeReturnTo` only ever returns a path from this explicit
 * allowlist (never the raw input), which is what actually prevents open
 * redirect — a regex/prefix check alone (e.g. "starts with /app/") would
 * still accept a path Next can't route to, or a future internal path we
 * didn't intend to be a valid onboarding-return target. `/app/onboarding`
 * itself is deliberately absent so the gate can never redirect to itself.
 */
const ONBOARDING_RETURN_ALLOWLIST = [
  '/app/today',
  '/app/capture',
  '/app/calendar',
  '/app/tasks',
  '/app/requests',
  '/app/care-network',
  '/app/people',
  '/app/children',
  '/app/family',
  '/app/emergency',
  '/app/health',
  '/app/documents',
  '/app/settings',
  '/app/ai',
] as const;

export const ONBOARDING_FALLBACK_RETURN_TO = '/app/today';

/**
 * Validates a `returnTo` value against the allowlist. Always returns a
 * safe, internal path — never the raw input, never `null`, never a
 * `/app/onboarding*` path (no loop), never anything with a scheme/host
 * (no open redirect). Falls back to `/app/today` for anything else,
 * including `null`/`undefined`/empty string.
 */
export function resolveSafeReturnTo(raw: string | null | undefined): string {
  if (!raw) return ONBOARDING_FALLBACK_RETURN_TO;
  // A returnTo only ever carries a destination path — strip any query/hash
  // a caller might have appended so this function's contract stays exact:
  // its return value is always one of the allowlisted paths, verbatim.
  const path = raw.split('?')[0].split('#')[0];
  const match = (ONBOARDING_RETURN_ALLOWLIST as readonly string[]).find((allowed) => allowed === path);
  return match ?? ONBOARDING_FALLBACK_RETURN_TO;
}

/** Builds the `/app/onboarding?returnTo=...` URL for a given interception point. */
export function buildOnboardingUrl(fromPath: string | null | undefined): string {
  const safe = resolveSafeReturnTo(fromPath);
  return `/app/onboarding?returnTo=${encodeURIComponent(safe)}`;
}
