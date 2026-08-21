# ADR-0005: apps/web and apps/mobile use the Supabase anon key directly for Auth; all other data access goes through apps/api

## Status
Accepted

## Context
Two architectural options existed: (a) let clients query Postgres/PostgREST directly for everything, relying
entirely on RLS; or (b) route all data access through `apps/api`. §8 mandates a Controller → Service → Business
Rules → Policy Engine → Repository layering that only makes sense if a backend actually sits in the path.

## Decision
- **Auth** (signUp/signInWithPassword/signOut/session refresh): clients call Supabase Auth directly via
  `@supabase/supabase-js` with the anon key. This is the standard, most secure Supabase pattern — re-implementing
  credential handling in `apps/api` would add risk without benefit.
- **Everything else** (persons, family units, future domains): clients call `apps/api`, which itself uses a
  Supabase client scoped to the caller's own JWT (so RLS still applies) plus the Family Policy Engine for
  fine-grained checks. `apps/api` is the only holder of `SUPABASE_SERVICE_ROLE_KEY`, used only for the
  onboarding bootstrap RPC (no `users` row exists yet to satisfy RLS) and future admin/background jobs.

## Consequences
- Business rules and the Policy Engine are enforced exactly once, server-side, regardless of client.
- The "mobile/web → LLM → database" anti-pattern (§54) is structurally impossible: clients never hold the
  service role key or an LLM key.
- Slightly more network hops for simple CRUD than a pure PostgREST-from-the-client design would have; judged
  worth it for the authorization guarantees.
