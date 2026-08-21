import { describe, expect, it } from 'vitest';
import {
  canTransitionResponsibilityAssignment,
  getResponsibilityPermissionBundle,
  RESPONSIBILITY_PERMISSION_BUNDLES,
  CARE_WINDOW_ELIGIBLE_RESPONSIBILITY_TYPES,
} from '../src/entities/responsibility';

describe('canTransitionResponsibilityAssignment (adendo §17)', () => {
  it('allows PROPOSED -> SENT -> VIEWED -> ACCEPTED -> ACTIVE -> COMPLETED', () => {
    expect(canTransitionResponsibilityAssignment('PROPOSED', 'SENT')).toBe(true);
    expect(canTransitionResponsibilityAssignment('SENT', 'VIEWED')).toBe(true);
    expect(canTransitionResponsibilityAssignment('VIEWED', 'ACCEPTED')).toBe(true);
    expect(canTransitionResponsibilityAssignment('ACCEPTED', 'ACTIVE')).toBe(true);
    expect(canTransitionResponsibilityAssignment('ACTIVE', 'COMPLETED')).toBe(true);
  });

  it('never skips straight from PROPOSED/SENT to ACTIVE — acceptance is mandatory (§17)', () => {
    expect(canTransitionResponsibilityAssignment('PROPOSED', 'ACTIVE')).toBe(false);
    expect(canTransitionResponsibilityAssignment('SENT', 'ACTIVE')).toBe(false);
    expect(canTransitionResponsibilityAssignment('VIEWED', 'ACTIVE')).toBe(false);
  });

  it('terminal states accept no further transition', () => {
    expect(canTransitionResponsibilityAssignment('DECLINED', 'ACCEPTED')).toBe(false);
    expect(canTransitionResponsibilityAssignment('EXPIRED', 'ACTIVE')).toBe(false);
    expect(canTransitionResponsibilityAssignment('COMPLETED', 'ACTIVE')).toBe(false);
    expect(canTransitionResponsibilityAssignment('FAILED', 'ACTIVE')).toBe(false);
  });

  it('an ACTIVE assignment can fail or be cancelled, never silently revert to ACCEPTED', () => {
    expect(canTransitionResponsibilityAssignment('ACTIVE', 'FAILED')).toBe(true);
    expect(canTransitionResponsibilityAssignment('ACTIVE', 'CANCELLED')).toBe(true);
    expect(canTransitionResponsibilityAssignment('ACTIVE', 'ACCEPTED')).toBe(false);
  });
});

describe('RESPONSIBILITY_PERMISSION_BUNDLES (adendo §7-8)', () => {
  it('PICKUP never includes HEALTH, DOCUMENTS, or FINANCE (worked example in §8)', () => {
    const bundle = RESPONSIBILITY_PERMISSION_BUNDLES.PICKUP;
    const domains = bundle.map((g) => g.domain);
    expect(domains).not.toContain('HEALTH');
    expect(domains).not.toContain('DOCUMENTS');
    expect(domains).not.toContain('FINANCE');
  });

  it('TRANSPORT (tio example, §6) grants only profile/schedule/transport/contacts/emergency', () => {
    const bundle = RESPONSIBILITY_PERMISSION_BUNDLES.TRANSPORT;
    const domains = bundle.map((g) => g.domain).sort();
    expect(domains).toEqual(['CONTACTS', 'EMERGENCY', 'PROFILE', 'SCHEDULE', 'TRANSPORTATION'].sort());
  });

  it('MEDICATION_SUPPORT grants MEDICATION view+edit but not HEALTH', () => {
    const bundle = RESPONSIBILITY_PERMISSION_BUNDLES.MEDICATION_SUPPORT;
    expect(bundle).toContainEqual({ domain: 'MEDICATION', action: 'VIEW' });
    expect(bundle).toContainEqual({ domain: 'MEDICATION', action: 'EDIT' });
    expect(bundle.map((g) => g.domain)).not.toContain('HEALTH');
  });

  it('every responsibility type has a non-empty default bundle', () => {
    for (const bundle of Object.values(RESPONSIBILITY_PERMISSION_BUNDLES)) {
      expect(bundle.length).toBeGreaterThan(0);
    }
  });

  it('getResponsibilityPermissionBundle falls back to the type default when no override is given', () => {
    expect(getResponsibilityPermissionBundle('PICKUP', null)).toEqual(RESPONSIBILITY_PERMISSION_BUNDLES.PICKUP);
    expect(getResponsibilityPermissionBundle('PICKUP', undefined)).toEqual(RESPONSIBILITY_PERMISSION_BUNDLES.PICKUP);
  });

  it('getResponsibilityPermissionBundle honors an explicit override', () => {
    const override = [{ domain: 'SCHEDULE', action: 'VIEW' }];
    expect(getResponsibilityPermissionBundle('PICKUP', override)).toEqual(override);
  });

  it('only OVERNIGHT_CARE and TEMPORARY_CARE mint a CareWindow on activation', () => {
    expect(CARE_WINDOW_ELIGIBLE_RESPONSIBILITY_TYPES.sort()).toEqual(['OVERNIGHT_CARE', 'TEMPORARY_CARE'].sort());
    expect(CARE_WINDOW_ELIGIBLE_RESPONSIBILITY_TYPES).not.toContain('PICKUP');
  });
});
