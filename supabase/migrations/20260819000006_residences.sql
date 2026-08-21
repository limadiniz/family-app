-- ============================================================================
-- 0006: residences + residence_memberships (§16).
-- Residência principal NÃO concede autoridade automaticamente — enforced
-- by simply never consulting these tables from the Policy Engine.
-- ============================================================================

create table public.residences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 150),
  address_line text,
  city text,
  state text check (state is null or char_length(state) = 2),
  postal_code text,
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index residences_tenant_id_idx on public.residences (tenant_id);

create trigger residences_set_updated_at
  before update on public.residences
  for each row execute function app.set_updated_at();

alter table public.residences enable row level security;
alter table public.residences force row level security;

create policy residences_rw_within_tenant
  on public.residences
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------------------------

create table public.residence_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  residence_id uuid not null references public.residences(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (residence_id, person_id)
);

create index residence_memberships_tenant_id_idx on public.residence_memberships (tenant_id);

create trigger residence_memberships_set_updated_at
  before update on public.residence_memberships
  for each row execute function app.set_updated_at();

alter table public.residence_memberships enable row level security;
alter table public.residence_memberships force row level security;

create policy residence_memberships_rw_within_tenant
  on public.residence_memberships
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
