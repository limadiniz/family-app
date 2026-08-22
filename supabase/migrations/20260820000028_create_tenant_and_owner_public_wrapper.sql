-- ============================================================================
-- 0036: real bug found in production, not local/CI testing —
-- POST /onboarding/bootstrap failing with:
--   "Could not find the function public.create_tenant_and_owner(
--    p_auth_user_id, p_display_name, p_email) in the schema cache"
--
-- app.create_tenant_and_owner (20260819000004_users.sql, redefined in
-- 20260820000016_accounts_and_membership.sql) was always created in the
-- `app` schema. PostgREST only exposes `public` (and `graphql_public`) —
-- see supabase/config.toml `[api] schemas` — and apps/api's Supabase
-- client (apps/api/src/common/supabase.service.ts) never sets
-- `.schema('app')`, so `service.rpc('create_tenant_and_owner', ...)`
-- always resolves against `public` by construction. The function has
-- therefore never been reachable via PostgREST since it was written.
--
-- 20260820000026_fixes_found_by_testing.sql already found and fixed the
-- neighboring "missing `grant usage on schema app`" bug for this same
-- family of app.* RPCs (grant_authority/revoke_authority/accept_invitation/
-- decline_invitation/lookup_invitation_by_token/create_tenant_and_owner) —
-- but USAGE on the schema does not make PostgREST route requests into it;
-- that's a schema-exposure question, not a privilege one. It went
-- undetected there for the same reason it went undetected here: the FASE 9
-- isolation suite calls these RPCs directly against Postgres (or via a
-- test harness that sets the schema explicitly), never through the actual
-- apps/api -> supabase-js -> PostgREST path. Bootstrap first ran that real
-- path in production, once apps/web's onboarding wizard started calling it
-- (see the accompanying fix in apps/web/src/app/app/onboarding/page.tsx).
--
-- Fix: a thin public.* wrapper with the identical signature that forwards
-- to app.create_tenant_and_owner. Keeps the real logic in one place (the
-- app schema, alongside its sibling RPCs) while making it reachable
-- through PostgREST — the same shape every other client-callable object
-- already uses, since every table this function touches lives in public.
-- ============================================================================

grant usage on schema app to service_role;

create function public.create_tenant_and_owner(
  p_auth_user_id uuid,
  p_email citext,
  p_display_name text
)
returns table (tenant_id uuid, person_id uuid, account_id uuid)
language sql
security definer
set search_path = public, pg_temp
as $$
  select * from app.create_tenant_and_owner(p_auth_user_id, p_email, p_display_name);
$$;

comment on function public.create_tenant_and_owner is
  'PostgREST-reachable wrapper for app.create_tenant_and_owner — apps/api calls this one via supabase-js .rpc(), which only ever resolves against the public schema (see 20260820000028).';

grant execute on function public.create_tenant_and_owner(uuid, citext, text) to service_role;
