/**
 * Mirrors packages/policy-engine's PolicyDecisionValue. Duplicated as a
 * plain string union (rather than importing @family-app/policy-engine)
 * so apps/web and apps/mobile — which use this DTO package but should
 * never need the Policy Engine's implementation itself — don't pull in
 * a backend-oriented dependency for one type alias.
 */
export type PolicyDecisionValue = 'ALLOW' | 'DENY' | 'REQUIRE_CONFIRMATION';

/**
 * Shared HTTP DTO shapes used by apps/web, apps/mobile, and apps/api's
 * OpenAPI contracts. Human-readable error messages only (§118) — the
 * technical `code` is for client branching, never displayed raw.
 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string; // human-readable, pt-BR, safe to show the user
    correlationId?: string;
  };
}

export interface ApiPolicyDeniedBody extends ApiErrorBody {
  error: ApiErrorBody['error'] & {
    code: 'POLICY_DENIED' | 'POLICY_REQUIRE_CONFIRMATION';
    decision: PolicyDecisionValue;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
}
