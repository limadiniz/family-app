-- ============================================================================
-- LOCAL/CI-ONLY Supabase compatibility shim.
--
-- NEVER apply this file to a real Supabase project — Supabase already
-- provides the `auth` schema, `auth.uid()`, and the `anon` / `authenticated`
-- / `service_role` roles. This shim exists purely so the migrations in
-- supabase/migrations/*.sql (which assume those primitives) can be applied
-- to and tested against a bare local Postgres instance in dev/CI without a
-- hosted Supabase project.
--
-- Applied by packages/database/scripts/migrate.ts before the real
-- migrations when TEST_DATABASE_URL / a local target is detected.
-- ============================================================================

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- Mirrors Supabase's real auth.uid(): reads the `request.jwt.claim.sub`
-- GUC that PostgREST sets per-request from the verified JWT. Tests set
-- it explicitly with `select set_config('request.jwt.claim.sub', '<uuid>', true)`.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Mirrors the small portion of Supabase's auth.jwt() used by invitation
-- acceptance. PostgREST normally exposes the verified claims through a GUC;
-- integration tests set the two relevant claims explicitly.
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'sub', nullif(current_setting('request.jwt.claim.sub', true), ''),
    'email', nullif(current_setting('request.jwt.claim.email', true), '')
  );
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;

-- Minimal Supabase Storage stub — real Supabase provides `storage.buckets`/
-- `storage.objects` with a much richer shape; this is only enough for
-- migrations that create buckets and RLS policies on storage.objects to
-- apply against a bare local Postgres.
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to service_role;
grant select on storage.objects to authenticated;
