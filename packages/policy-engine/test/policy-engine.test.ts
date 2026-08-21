import { describe, expect, it } from 'vitest';
import { familyPolicyEngine } from '../src/policy-engine';
import type { AuthorizeRequest, PolicyEngineInput } from '../src/types';

const TENANT = '11111111-1111-1111-1111-111111111111';

function baseInput(overrides: Partial<PolicyEngineInput> = {}): PolicyEngineInput {
  return {
    sharedFamilyRoles: [],
    activeAuthorityGrants: [],
    hasActiveCareWindow: false,
    subjectIsMinor: false,
    ...overrides,
  };
}

describe('FamilyPolicyEngine.authorize — general behaviour', () => {
  it('FAMILY_OWNER has unrestricted access within their tenant', () => {
    const request: AuthorizeRequest = {
      actor: { personId: 'owner', tenantId: TENANT },
      action: 'MANAGE',
      domain: 'FINANCE',
      subjectPersonId: 'child',
      subjectTenantId: TENANT,
    };
    const decision = familyPolicyEngine.authorize(request, baseInput({ sharedFamilyRoles: ['FAMILY_OWNER'] }));
    expect(decision.decision).toBe('ALLOW');
  });

  it('explicit AuthorityGrant allows access even with no matching role', () => {
    const request: AuthorizeRequest = {
      actor: { personId: 'pediatrician', tenantId: TENANT },
      action: 'VIEW',
      domain: 'HEALTH',
      subjectPersonId: 'child',
      subjectTenantId: TENANT,
    };
    const decision = familyPolicyEngine.authorize(
      request,
      baseInput({
        sharedFamilyRoles: ['PROFESSIONAL'],
        activeAuthorityGrants: [{ domain: 'HEALTH', action: 'VIEW' }],
      }),
    );
    expect(decision.decision).toBe('ALLOW');
    expect(decision.rule).toBe('EXPLICIT_GRANT_ALLOW');
  });

  it('self-access allows an adult to view their own profile', () => {
    const request: AuthorizeRequest = {
      actor: { personId: 'lucas', tenantId: TENANT },
      action: 'VIEW',
      domain: 'PROFILE',
      subjectPersonId: 'lucas',
      subjectTenantId: TENANT,
    };
    const decision = familyPolicyEngine.authorize(request, baseInput({ subjectIsMinor: false }));
    expect(decision.decision).toBe('ALLOW');
    expect(decision.rule).toBe('SELF_ACCESS_ALLOW');
  });

  it('self-access does NOT apply to a minor (their access is governed elsewhere)', () => {
    const request: AuthorizeRequest = {
      actor: { personId: 'pedro-child', tenantId: TENANT },
      action: 'VIEW',
      domain: 'PROFILE',
      subjectPersonId: 'pedro-child',
      subjectTenantId: TENANT,
    };
    const decision = familyPolicyEngine.authorize(request, baseInput({ subjectIsMinor: true }));
    expect(decision.decision).toBe('DENY');
  });

  it('PROFESSIONAL role default is NONE without an explicit grant', () => {
    const request: AuthorizeRequest = {
      actor: { personId: 'doctor', tenantId: TENANT },
      action: 'VIEW',
      domain: 'HEALTH',
      subjectPersonId: 'child',
      subjectTenantId: TENANT,
    };
    const decision = familyPolicyEngine.authorize(request, baseInput({ sharedFamilyRoles: ['PROFESSIONAL'] }));
    expect(decision.decision).toBe('DENY');
  });
});
