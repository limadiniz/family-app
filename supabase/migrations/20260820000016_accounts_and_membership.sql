-- ============================================================================
-- 0024 (FASE 1-2 do desenho de infraestrutura Supabase): decouples login
-- identity from tenant. `public.users` conflated "who is logged in" with
-- "which single tenant/person they are" — breaks the moment the same human
-- needs to operate inside two unrelated families (a professional caregiver,
-- a grandparent helping two households). Replaced by:
--   accounts            — 1:1 with auth.users, no tenant/person of its own.
--   account_memberships — N:N bridge: which Person this Account is, per Tenant.
-- Existing `users` rows are migrated forward, not discarded.
-- ============================================================================

create table public.accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  mfa_enabled boolean not null default false,
  status text not null default 'PENDING_VERIFICATION' check (status in ('PENDING_VERIFICATION', 'ACTIVE', 'DISABLED')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index accounts_email_idx on public.accounts (email);

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function app.set_updated_at();

create table public.account_memberships (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete restrict,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVOKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (account_id, tenant_id),
  unique (person_id)
);

create index account_memberships_account_id_idx on public.account_memberships (account_id);
create index account_memberships_tenant_id_idx on public.account_memberships (tenant_id);
create index account_memberships_active_idx
  on public.account_memberships (account_id, tenant_id) where status = 'ACTIVE';

create trigger account_memberships_set_updated_at
  before update on public.account_memberships
  for each row execute function app.set_updated_at();

-- Migrate existing users -> accounts + account_memberships (never discard
-- real rows during a refactor).
insert into public.accounts (id, email, mfa_enabled, status, last_login_at, created_at, updated_at, deleted_at)
  select id, email, mfa_enabled, status, last_login_at, created_at, updated_at, deleted_at
  from public.users;

insert into public.account_memberships (account_id, tenant_id, person_id, status, created_at, updated_at)
  select id, tenant_id, person_id, 'ACTIVE', created_at, updated_at
  from public.users
  where deleted_at is null;

-- ----------------------------------------------------------------------------
-- New helper functions. Superseding app.current_tenant_id() /
-- app.current_person_id() (single-tenant assumption) — kept temporarily as
-- deprecated wrappers below so any policy not yet migrated in a later file
-- of this batch still evaluates correctly (defense against ordering bugs
-- within this migration series), removed for good once every policy in the
-- rest of this batch has switched over.
-- ----------------------------------------------------------------------------

create or replace function app.is_current_tenant(p_tenant_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.account_memberships
    where account_id = auth.uid() and tenant_id = p_tenant_id and status = 'ACTIVE'
  );
$$;

create or replace function app.person_id_in_tenant(p_tenant_id uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select person_id from public.account_memberships
  where account_id = auth.uid() and tenant_id = p_tenant_id and status = 'ACTIVE';
$$;

create or replace function app.has_family_admin_role(p_tenant_id uuid, p_family_unit_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.family_memberships fm
    where fm.tenant_id = p_tenant_id and fm.family_unit_id = p_family_unit_id
      and fm.person_id = app.person_id_in_tenant(p_tenant_id)
      and fm.is_active and fm.role in ('FAMILY_OWNER', 'GUARDIAN', 'CO_GUARDIAN')
  );
$$;

create or replace function app.has_any_family_admin_role(p_tenant_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.family_memberships fm
    where fm.tenant_id = p_tenant_id
      and fm.person_id = app.person_id_in_tenant(p_tenant_id)
      and fm.is_active and fm.role in ('FAMILY_OWNER', 'GUARDIAN', 'CO_GUARDIAN')
  );
$$;

comment on function app.is_current_tenant(uuid) is
  'Replaces app.current_tenant_id() — an account may now hold ACTIVE membership in more than one tenant.';

-- ----------------------------------------------------------------------------
-- accounts / account_memberships RLS
-- ----------------------------------------------------------------------------

alter table public.accounts enable row level security;
alter table public.accounts force row level security;

create policy accounts_select_self on public.accounts for select to authenticated using (id = auth.uid());
create policy accounts_update_self on public.accounts for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

alter table public.account_memberships enable row level security;
alter table public.account_memberships force row level security;

create policy account_memberships_select_self on public.account_memberships for select to authenticated
  using (account_id = auth.uid());
-- No insert/update/delete policy for `authenticated` — only SECURITY DEFINER RPCs write here.

-- ----------------------------------------------------------------------------
-- `public.users` is NOT dropped in this file. app.current_tenant_id() /
-- app.current_person_id() (the OLD single-tenant helpers) still read from
-- it, and every policy not yet converted in a later file of this batch
-- still calls them — dropping `users` now would break every one of those
-- policies mid-migration. It is dropped in
-- 20260820000024_cleanup_deprecated.sql, the last file of this batch, once
-- every policy in the schema has been converted to app.is_current_tenant().
--
-- audit_events IS repointed now, since AuditService (apps/api) already
-- needs to change regardless and there is no policy depending on the old
-- column name.
-- ----------------------------------------------------------------------------

alter table public.audit_events drop constraint if exists audit_events_actor_user_id_fkey;
alter table public.audit_events rename column actor_user_id to actor_account_id;
alter table public.audit_events add constraint audit_events_actor_account_id_fkey
  foreign key (actor_account_id) references public.accounts(id);

-- ----------------------------------------------------------------------------
-- Signup RPC, rewritten against accounts/account_memberships.
-- ----------------------------------------------------------------------------

drop function if exists app.create_tenant_and_owner(uuid, citext, text);
create function app.create_tenant_and_owner(
  p_auth_user_id uuid, p_email citext, p_display_name text
) returns table (tenant_id uuid, person_id uuid, account_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tenant_id uuid;
  v_person_id uuid;
begin
  insert into public.accounts (id, email, status) values (p_auth_user_id, p_email, 'ACTIVE')
    on conflict (id) do nothing;

  insert into public.tenants (name) values (p_display_name || ' — Família')
    returning id into v_tenant_id;

  insert into public.persons (tenant_id, display_name, person_type, is_minor)
    values (v_tenant_id, p_display_name, 'ADULT', false)
    returning id into v_person_id;

  insert into public.account_memberships (account_id, tenant_id, person_id, status)
    values (p_auth_user_id, v_tenant_id, v_person_id, 'ACTIVE');

  return query select v_tenant_id, v_person_id, p_auth_user_id;
end;
$$;

grant execute on function app.is_current_tenant(uuid) to authenticated;
grant execute on function app.person_id_in_tenant(uuid) to authenticated;
grant execute on function app.has_family_admin_role(uuid, uuid) to authenticated;
grant execute on function app.has_any_family_admin_role(uuid) to authenticated;
grant select, update on public.accounts to authenticated;
grant select on public.account_memberships to authenticated;
revoke select, update on public.users from authenticated; -- no-op now (table dropped) but documents intent
