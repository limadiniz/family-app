import type { PermissionAction, PermissionDomain, Role } from '@family-app/domain';

/**
 * The Family Policy Engine's public contract (master prompt §20):
 *
 *   authorize(actor, action, resource, subject, context) -> ALLOW | DENY | REQUIRE_CONFIRMATION
 *
 * The engine itself is a PURE function of its inputs — it does not talk
 * to the database. Callers (apps/api services, the AI Gateway) are
 * responsible for loading a `PolicyEngineInput` snapshot for the
 * specific (actor, subject) pair before calling `authorize`. This keeps
 * the engine trivially unit-testable and reusable from any runtime
 * (API, background jobs, AI Gateway) without duplicating SQL.
 */

export type PolicyDecisionValue = 'ALLOW' | 'DENY' | 'REQUIRE_CONFIRMATION';

export interface PolicyActor {
  personId: string;
  tenantId: string;
  userId?: string | null;
}

export interface AuthorizeRequest {
  actor: PolicyActor;
  action: PermissionAction;
  domain: PermissionDomain;
  /** The Person the data/action is about. */
  subjectPersonId: string;
  subjectTenantId: string;
  context?: {
    now?: Date;
    /** Free-text purpose, surfaced in audit logs — never used to bypass rules. */
    purpose?: string;
  };
}

/** A minimal, already-scoped snapshot of everything the engine needs to decide. */
export interface PolicyEngineInput {
  /** Roles the actor holds in any FamilyUnit that also contains the subject. Empty if no shared family. */
  sharedFamilyRoles: Role[];
  /** Explicit, currently-active AuthorityGrants from actor -> subject (already filtered for tenant/revocation/date by the caller, OR raw — engine re-checks validity defensively). */
  activeAuthorityGrants: Array<{ domain: PermissionDomain; action: PermissionAction }>;
  /** True if the actor currently has an ACTIVE CareWindow over the subject (right now, per `context.now`). */
  hasActiveCareWindow: boolean;
  /** True if the subject is flagged as a minor (drives self-access shortcuts). */
  subjectIsMinor: boolean;
}

export interface PolicyDecision {
  decision: PolicyDecisionValue;
  reason: string;
  /** Machine-readable rule id, useful for tests and audit logs. */
  rule:
    | 'CROSS_TENANT_DENY'
    | 'SELF_ACCESS_ALLOW'
    | 'ROLE_DEFAULT_ALLOW'
    | 'EXPLICIT_GRANT_ALLOW'
    | 'CARE_WINDOW_ALLOW'
    | 'SENSITIVE_ACTION_CONFIRMATION'
    | 'PLATFORM_ADMIN_OUT_OF_SCOPE'
    | 'NO_MATCHING_GRANT_DENY';
}
