import { describe, expect, it } from 'vitest';
import { familyPolicyEngine } from '../src/policy-engine';
import type { AuthorizeRequest, PolicyEngineInput } from '../src/types';

/**
 * Security isolation tests mandated by master prompt §89 and §132-135.
 * These run at the domain layer (no DB needed) so they execute in CI on
 * every PR without provisioning Supabase. Equivalent RLS-level tests
 * live in packages/database (see DATABASE.md).
 */

const TENANT_SILVA = '11111111-1111-1111-1111-111111111111';
const TENANT_OUTRA_FAMILIA = '22222222-2222-2222-2222-222222222222';

const ANA_GUARDIAN = 'aaaaaaaa-0000-0000-0000-000000000001'; // mãe
const JOANA_BABA = 'aaaaaaaa-0000-0000-0000-000000000002'; // babá
const PEDRO_CHILD = 'aaaaaaaa-0000-0000-0000-000000000003'; // criança
const OUTSIDER_FROM_OTHER_FAMILY = 'bbbbbbbb-0000-0000-0000-000000000001';

function baseInput(overrides: Partial<PolicyEngineInput> = {}): PolicyEngineInput {
  return {
    sharedFamilyRoles: [],
    activeAuthorityGrants: [],
    hasActiveCareWindow: false,
    subjectIsMinor: true,
    ...overrides,
  };
}

describe('Family isolation — Family A never reads Family B', () => {
  it('denies a member of another tenant/family from viewing a child health record', () => {
    const request: AuthorizeRequest = {
      actor: { personId: OUTSIDER_FROM_OTHER_FAMILY, tenantId: TENANT_OUTRA_FAMILIA },
      action: 'VIEW',
      domain: 'HEALTH',
      subjectPersonId: PEDRO_CHILD,
      subjectTenantId: TENANT_SILVA,
    };
    const decision = familyPolicyEngine.authorize(request, baseInput({ sharedFamilyRoles: ['GUARDIAN'] }));
    expect(decision.decision).toBe('DENY');
    expect(decision.rule).toBe('CROSS_TENANT_DENY');
  });
});

describe('Babá does not access financeiro by default', () => {
  it('denies FINANCE VIEW for a CAREGIVER role with no explicit grant', () => {
    const request: AuthorizeRequest = {
      actor: { personId: JOANA_BABA, tenantId: TENANT_SILVA },
      action: 'VIEW',
      domain: 'FINANCE',
      subjectPersonId: PEDRO_CHILD,
      subjectTenantId: TENANT_SILVA,
    };
    const decision = familyPolicyEngine.authorize(
      request,
      baseInput({ sharedFamilyRoles: ['CAREGIVER'] }),
    );
    expect(decision.decision).toBe('DENY');
  });

  it('denies full health history VIEW for a CAREGIVER role with no explicit grant and no active window', () => {
    const request: AuthorizeRequest = {
      actor: { personId: JOANA_BABA, tenantId: TENANT_SILVA },
      action: 'VIEW',
      domain: 'HEALTH',
      subjectPersonId: PEDRO_CHILD,
      subjectTenantId: TENANT_SILVA,
    };
    const decision = familyPolicyEngine.authorize(
      request,
      baseInput({ sharedFamilyRoles: ['CAREGIVER'], hasActiveCareWindow: false }),
    );
    expect(decision.decision).toBe('DENY');
  });
});

describe('CareWindow expiration revokes access', () => {
  const request: AuthorizeRequest = {
    actor: { personId: JOANA_BABA, tenantId: TENANT_SILVA },
    action: 'VIEW',
    domain: 'HEALTH',
    subjectPersonId: PEDRO_CHILD,
    subjectTenantId: TENANT_SILVA,
  };

  it('allows a baseline HEALTH VIEW while the CareWindow is active', () => {
    const decision = familyPolicyEngine.authorize(
      request,
      baseInput({ sharedFamilyRoles: ['TEMPORARY_CAREGIVER'], hasActiveCareWindow: true }),
    );
    expect(decision.decision).toBe('ALLOW');
    expect(decision.rule).toBe('CARE_WINDOW_ALLOW');
  });

  it('denies the same request once the CareWindow has ended', () => {
    const decision = familyPolicyEngine.authorize(
      request,
      baseInput({ sharedFamilyRoles: ['TEMPORARY_CAREGIVER'], hasActiveCareWindow: false }),
    );
    expect(decision.decision).toBe('DENY');
    expect(decision.rule).toBe('NO_MATCHING_GRANT_DENY');
  });

  it('never allows FINANCE even inside an active CareWindow', () => {
    const decision = familyPolicyEngine.authorize(
      { ...request, domain: 'FINANCE' },
      baseInput({ sharedFamilyRoles: ['TEMPORARY_CAREGIVER'], hasActiveCareWindow: true }),
    );
    expect(decision.decision).toBe('DENY');
  });
});

describe('Teen cannot self-escalate authorization', () => {
  it('does not grant ADMIN action via the self-access shortcut, even for an adult acting on themself', () => {
    const request: AuthorizeRequest = {
      actor: { personId: PEDRO_CHILD, tenantId: TENANT_SILVA },
      action: 'ADMIN',
      domain: 'PROFILE',
      subjectPersonId: PEDRO_CHILD,
      subjectTenantId: TENANT_SILVA,
    };
    const decision = familyPolicyEngine.authorize(
      request,
      baseInput({ sharedFamilyRoles: ['TEEN'], subjectIsMinor: false }),
    );
    expect(decision.decision).toBe('DENY');
  });

  it('does not grant a TEEN role FINANCE access over a sibling by IDOR-style ID substitution', () => {
    const request: AuthorizeRequest = {
      actor: { personId: 'teen-lucas', tenantId: TENANT_SILVA },
      action: 'VIEW',
      domain: 'FINANCE',
      subjectPersonId: 'sibling-mariana',
      subjectTenantId: TENANT_SILVA,
    };
    const decision = familyPolicyEngine.authorize(
      request,
      baseInput({ sharedFamilyRoles: ['TEEN'] }),
    );
    expect(decision.decision).toBe('DENY');
  });
});

describe('Family Copilot (AI) never bypasses the Policy Engine (§135)', () => {
  it('allows a GUARDIAN to ask about a scheduled medical appointment', () => {
    const request: AuthorizeRequest = {
      actor: { personId: ANA_GUARDIAN, tenantId: TENANT_SILVA },
      action: 'VIEW',
      domain: 'HEALTH',
      subjectPersonId: PEDRO_CHILD,
      subjectTenantId: TENANT_SILVA,
      context: { purpose: 'ai_query: quando Pedro tem consulta?' },
    };
    const decision = familyPolicyEngine.authorize(
      request,
      baseInput({ sharedFamilyRoles: ['GUARDIAN'] }),
    );
    expect(decision.decision).toBe('ALLOW');
    expect(decision.rule).toBe('ROLE_DEFAULT_ALLOW');
  });

  it('denies a babá asking for the full medical history via AI when she has no grant', () => {
    const request: AuthorizeRequest = {
      actor: { personId: JOANA_BABA, tenantId: TENANT_SILVA },
      action: 'VIEW',
      domain: 'HEALTH',
      subjectPersonId: PEDRO_CHILD,
      subjectTenantId: TENANT_SILVA,
      context: { purpose: 'ai_query: qual é todo o histórico médico de Pedro?' },
    };
    const decision = familyPolicyEngine.authorize(
      request,
      baseInput({ sharedFamilyRoles: ['CAREGIVER'], hasActiveCareWindow: false }),
    );
    expect(decision.decision).toBe('DENY');
  });
});

describe('Sensitive actions require confirmation instead of a silent ALLOW', () => {
  it('downgrades SHARE on DOCUMENTS to REQUIRE_CONFIRMATION for a GUARDIAN', () => {
    const request: AuthorizeRequest = {
      actor: { personId: ANA_GUARDIAN, tenantId: TENANT_SILVA },
      action: 'SHARE',
      domain: 'DOCUMENTS',
      subjectPersonId: PEDRO_CHILD,
      subjectTenantId: TENANT_SILVA,
    };
    const decision = familyPolicyEngine.authorize(
      request,
      baseInput({ sharedFamilyRoles: ['GUARDIAN'] }),
    );
    expect(decision.decision).toBe('REQUIRE_CONFIRMATION');
  });
});
