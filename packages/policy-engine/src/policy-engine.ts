import { CARE_WINDOW_BASELINE, roleGrantsPermission } from './role-defaults';
import type { AuthorizeRequest, PolicyDecision, PolicyEngineInput } from './types';

/**
 * SENSITIVE_ACTIONS: even when an actor otherwise qualifies for ALLOW,
 * these (domain, action) pairs are downgraded to REQUIRE_CONFIRMATION —
 * the caller (API layer) must obtain an explicit user confirmation step
 * before executing. This implements §20's third decision outcome for
 * externally-visible or hard-to-reverse actions (sharing a document,
 * exporting location history, etc.).
 */
const SENSITIVE_ACTIONS: Array<{ domain: string; action: string }> = [
  { domain: 'DOCUMENTS', action: 'SHARE' },
  { domain: 'HEALTH', action: 'SHARE' },
  { domain: 'MEDICATION', action: 'SHARE' },
  { domain: 'FINANCE', action: 'SHARE' },
  { domain: 'LOCATION', action: 'SHARE' },
  { domain: 'PROFILE', action: 'DELETE' },
];

function isSensitive(domain: string, action: string): boolean {
  return SENSITIVE_ACTIONS.some((s) => s.domain === domain && s.action === action);
}

/**
 * FamilyPolicyEngine — the single, mandatory gate for every
 * sensitive action in the platform (§20, §25, §138). No controller,
 * service, or AI tool may implement its own authorization shortcut;
 * everything routes through `authorize()`.
 */
export class FamilyPolicyEngine {
  authorize(request: AuthorizeRequest, input: PolicyEngineInput): PolicyDecision {
    const { actor, subjectTenantId, domain, action } = request;

    // 1. Tenant isolation is the outermost, non-negotiable boundary.
    //    This is what guarantees "Family A nunca consulta Family B" when
    //    each signup gets its own Tenant (see packages/domain Tenant doc).
    if (actor.tenantId !== subjectTenantId) {
      return {
        decision: 'DENY',
        reason: 'Actor and subject belong to different tenants.',
        rule: 'CROSS_TENANT_DENY',
      };
    }

    // 2. Self-access shortcut — an adult acting on their own record.
    //    Minors never get this shortcut even if they somehow hold a User
    //    (their independent access is governed by AutonomyProfile in a
    //    later phase, not by this baseline).
    const isSelf = actor.personId === request.subjectPersonId;
    if (isSelf && !input.subjectIsMinor && domain !== 'FINANCE' && domain !== 'AUDIT') {
      if (action !== 'ADMIN') {
        return {
          decision: 'ALLOW',
          reason: 'Actor is acting on their own record.',
          rule: 'SELF_ACCESS_ALLOW',
        };
      }
    }

    // 3. Explicit AuthorityGrant — the most specific, always wins.
    const hasExplicitGrant = input.activeAuthorityGrants.some(
      (g) => g.domain === domain && g.action === action,
    );
    if (hasExplicitGrant) {
      return isSensitive(domain, action)
        ? {
            decision: 'REQUIRE_CONFIRMATION',
            reason: 'Action is sensitive and requires explicit user confirmation before executing.',
            rule: 'SENSITIVE_ACTION_CONFIRMATION',
          }
        : { decision: 'ALLOW', reason: 'Actor has an explicit, active AuthorityGrant.', rule: 'EXPLICIT_GRANT_ALLOW' };
    }

    // 4. Role default, for roles the actor holds in a FamilyUnit shared
    //    with the subject.
    const roleAllows = input.sharedFamilyRoles.some((role) => roleGrantsPermission(role, domain, action));
    if (roleAllows) {
      return isSensitive(domain, action)
        ? {
            decision: 'REQUIRE_CONFIRMATION',
            reason: 'Action is sensitive and requires explicit user confirmation before executing.',
            rule: 'SENSITIVE_ACTION_CONFIRMATION',
          }
        : { decision: 'ALLOW', reason: 'Actor role grants this permission by default.', rule: 'ROLE_DEFAULT_ALLOW' };
    }

    // 5. Active CareWindow baseline — covers ad-hoc/temporary caregivers
    //    who have neither a standing role grant nor an explicit grant,
    //    but are demonstrably responsible for the child right now.
    if (input.hasActiveCareWindow) {
      const inBaseline = CARE_WINDOW_BASELINE.some((g) => g.domain === domain && g.action === action);
      if (inBaseline) {
        return { decision: 'ALLOW', reason: 'Actor holds an active CareWindow over the subject.', rule: 'CARE_WINDOW_ALLOW' };
      }
    }

    // 6. Default posture: deny. This is the branch that protects against
    //    "expired caregiver still has access" and "babysitter reads
    //    financial data" scenarios (§89).
    return {
      decision: 'DENY',
      reason: 'No role default, explicit grant, or active CareWindow covers this action.',
      rule: 'NO_MATCHING_GRANT_DENY',
    };
  }
}

export const familyPolicyEngine = new FamilyPolicyEngine();
