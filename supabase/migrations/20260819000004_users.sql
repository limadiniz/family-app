-- ============================================================================
-- 0004: users — authenticated identity, mirrors auth.users (§14).
-- id == auth.users.id (Supabase Auth is the source of truth for credentials;
-- this table only carries app-level profile/linking fields).
-- ============================================================================

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete restrict,
  email citext not null,
  mfa_enabled boolean not null default false,
  last_login_at timestamptz,
  status text not null default 'PENDING_VERIFICATION' check (status in ('PENDING_VERIFICATION', 'ACTIVE', 'DISABLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (person_id) -- one User per Person today; revisit if shared logins are ever needed
);

create index users_tenant_id_idx on public.users (tenant_id);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function app.set_updated_at();

alter table public.users enable row level security;
alter table public.users force row level security;

-- Self-only. Deliberately does NOT use app.current_tenant_id() (which
-- reads this very table) to keep the policy trivially non-recursive.
create policy users_select_self
  on public.users
  for select
  to authenticated
  using (id = auth.uid());

create policy users_update_self
  on public.users
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Row creation happens via the app.create_tenant_and_owner / invitation
-- acceptance RPCs (SECURITY DEFINER, service role) — no direct insert
-- policy for `authenticated`.

-- ----------------------------------------------------------------------------
-- Signup RPC: creates a Tenant + Person + linked User atomically for a
-- brand-new Supabase Auth user. Called once, right after auth signup,
-- from apps/api (never directly from the client with the service role).
-- ----------------------------------------------------------------------------
create or replace function app.create_tenant_and_owner(
  p_auth_user_id uuid,
  p_email citext,
  p_display_name text
)
returns table (tenant_id uuid, person_id uuid, user_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_person_id uuid;
begin
  insert into public.tenants (name) values (p_display_name || ' — Família')
    returning id into v_tenant_id;

  insert into public.persons (tenant_id, display_name, person_type, is_minor)
    values (v_tenant_id, p_display_name, 'ADULT', false)
    returning id into v_person_id;

  insert into public.users (id, tenant_id, person_id, email, status)
    values (p_auth_user_id, v_tenant_id, v_person_id, p_email, 'ACTIVE');

  return query select v_tenant_id, v_person_id, p_auth_user_id;
end;
$$;

comment on function app.create_tenant_and_owner is
  'Onboarding step 1 (§85). Invoked by apps/api right after Supabase Auth signup.';
