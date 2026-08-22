import { describe, expect, it } from 'vitest';
import { ApiError, isPermissionDenied } from '../src/lib/api-client';

/**
 * P0.5 — `isPermissionDenied` is the single switch pages use to render
 * `PermissionDeniedState` instead of the generic `ErrorState`. Getting
 * this wrong either hides a real error behind a calm "no access" message,
 * or (worse) shows a scary red error for a normal authorization boundary.
 */
describe('isPermissionDenied', () => {
  it('is true for a genuine Policy Engine denial (POLICY_DENIED)', () => {
    expect(isPermissionDenied(new ApiError('Você não possui permissão para realizar esta ação.', 'POLICY_DENIED', 403))).toBe(true);
  });

  it('is false for ONBOARDING_REQUIRED — that has its own dedicated state, not a permission denial', () => {
    expect(isPermissionDenied(new ApiError('Conclua o cadastro inicial antes de continuar.', 'ONBOARDING_REQUIRED', 403))).toBe(false);
  });

  it('is false for an unrelated error, even with a 403 status', () => {
    expect(isPermissionDenied(new ApiError('Algo deu errado.', 'INTERNAL_ERROR', 500))).toBe(false);
  });

  it('is false for a non-ApiError value (network failure, etc.)', () => {
    expect(isPermissionDenied(new Error('Failed to fetch'))).toBe(false);
    expect(isPermissionDenied(null)).toBe(false);
    expect(isPermissionDenied(undefined)).toBe(false);
  });
});
