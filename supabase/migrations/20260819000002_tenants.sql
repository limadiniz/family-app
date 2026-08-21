-- ============================================================================
-- 0002: tenants
--
-- Tenant is the outermost multitenancy boundary (packages/domain/src/entities/tenant.ts).
-- Created automatically at signup by a SECURITY DEFINER RPC
-- (app.create_tenant_and_owner, see migration 0004) — never by direct
-- client insert, which is why there is no INSERT policy for `authenticated`.
-- ============================================================================

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED', 'PENDING_DELETION')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function app.set_updated_at();

alter table public.tenants enable row level security;
-- Defense in depth: force RLS even for the table owner role when accessed
-- through a role that isn't the Postgres superuser/service role.
alter table public.tenants force row level security;

create policy tenants_select_own
  on public.tenants
  for select
  to authenticated
  using (id = app.current_tenant_id());

-- No insert/update/delete policies for `authenticated`: default-deny.
-- Service role (used only by apps/api, never shipped to clients — §10, §70)
-- bypasses RLS entirely and is responsible for tenant lifecycle writes.
