-- ============================================================================
-- 0001: extensions + helper schema
--
-- `auth.uid()` / `auth.jwt()` and the `auth` schema already exist on every
-- real Supabase project — we do NOT create them here. Local/CI testing
-- against a bare Postgres (no Supabase) requires a thin compatibility shim,
-- which lives separately in packages/database/local-dev/ and is NEVER
-- applied to a real Supabase database. See DATABASE.md.
-- ============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- case-insensitive email comparisons

create schema if not exists app;
comment on schema app is 'Helper functions used by RLS policies. Never exposed via PostgREST.';

-- Resolves the tenant of the currently authenticated user. SECURITY DEFINER
-- so it can read public.users regardless of that table's own RLS policy
-- (avoids recursive-policy evaluation). search_path is pinned for safety.
--
-- Implemented as `language plpgsql` (rather than the simpler `language
-- sql`) specifically so its body is NOT validated against the catalog at
-- CREATE FUNCTION time — `public.users` does not exist yet at this point
-- in the migration sequence (it's created in 0004_users.sql, after
-- 0002_tenants.sql / 0003_persons.sql, both of which already need this
-- function for their RLS policies). plpgsql bodies are only resolved at
-- first execution, by which point every migration has run.
create or replace function app.current_tenant_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.users where id = auth.uid();
  return v_tenant_id;
end;
$$;

comment on function app.current_tenant_id() is
  'Tenant of auth.uid(). Primary enforcement point for cross-family isolation (master prompt §89: "Family A nunca consulta Family B").';

-- Resolves the Person linked to the currently authenticated user. Same
-- plpgsql-for-deferred-validation rationale as current_tenant_id() above.
create or replace function app.current_person_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_person_id uuid;
begin
  select person_id into v_person_id from public.users where id = auth.uid();
  return v_person_id;
end;
$$;

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
