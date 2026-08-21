# ADR-0004: Family Policy Engine as a pure, database-agnostic function

## Status
Accepted

## Context
§20 mandates a single `authorize()` call for every sensitive action, reachable from the API, background jobs,
and (per §53-56) the AI Gateway. If the engine queried the database itself, every caller would need the same
Supabase client wiring, and unit-testing authorization logic would require a live database.

## Decision
`packages/policy-engine`'s `FamilyPolicyEngine.authorize(request, PolicyEngineInput)` is a pure function: it
takes a pre-loaded snapshot (`PolicyEngineInput` — shared-family roles, active grants, active CareWindow flag,
subject-is-minor flag) and returns a decision. Loading that snapshot from Postgres is the caller's
responsibility (`apps/api/src/common/policy.service.ts`'s `loadPolicyEngineInput`).

## Consequences
- `packages/policy-engine/test/*.test.ts` runs with zero infrastructure, fast, in every CI run.
- The same engine instance is reused unmodified by `packages/ai`'s AI Gateway (`packages/ai/src/ai-gateway.ts`),
  proving the "AI never bypasses the Policy Engine" requirement (§54, §135) by construction rather than by
  convention.
- Cost: each caller must load `PolicyEngineInput` correctly; a caller that loads it wrong (e.g. omits an active
  CareWindow check) can still produce a wrong decision. Mitigated by centralizing the loading logic in exactly
  one place in `apps/api` today, and by the RLS layer as a second line of defense.
