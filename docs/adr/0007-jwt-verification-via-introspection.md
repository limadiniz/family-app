# ADR-0007: JWT verification via Supabase `/auth/v1/user` introspection, not local signature verification

## Status
Accepted — revisit when request volume or latency justifies the change

## Context
`apps/api` must verify every inbound bearer token belongs to a real, current Supabase Auth session (§67) before
trusting any identity claim. Two options: verify the JWT signature locally (needs the project's signing
secret/JWKS, zero extra network latency, but couples `apps/api` to key-rotation handling), or call Supabase's
`/auth/v1/user` endpoint per request (adds one network round-trip, but Supabase handles all key management and
revocation).

## Decision
Use introspection (`packages/auth/src/jwt.ts`'s `resolveAuthContext`) for the MVP.

## Consequences
- Simpler, zero key-rotation risk, correctly rejects revoked/expired sessions immediately.
- Adds latency (one extra HTTP call) to every authenticated request — acceptable at MVP traffic levels.
- Revisit once request volume or latency budgets justify local JWKS-based verification (Supabase exposes a JWKS
  endpoint for ES256 projects); track as a Phase 7 performance item, not a security fix.
