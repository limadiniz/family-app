-- ============================================================================
-- 0005: family_units, family_memberships, relationships (§15-16, §21).
-- Many-to-many Person <-> FamilyUnit via family_memberships — never a
-- single person.family_id column (§15).
-- ============================================================================

create table public.family_units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 150),
  kind text not null default 'OTHER' check (kind in ('NUCLEAR', 'SHARED_CUSTODY', 'BLENDED', 'EXTENDED', 'OTHER')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index family_units_tenant_id_idx on public.family_units (tenant_id);

create trigger family_units_set_updated_at
  before update on public.family_units
  for each row execute function app.set_updated_at();

alter table public.family_units enable row level security;
alter table public.family_units force row level security;

create policy family_units_rw_within_tenant
  on public.family_units
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------------------------

create table public.family_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  family_unit_id uuid not null references public.family_units(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  role text not null check (role in (
    'FAMILY_OWNER', 'GUARDIAN', 'CO_GUARDIAN', 'CAREGIVER', 'TEMPORARY_CAREGIVER',
    'EXTENDED_FAMILY', 'TEEN', 'CHILD', 'PROFESSIONAL', 'EMERGENCY_ACCESS', 'PLATFORM_ADMIN'
  )),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (family_unit_id, person_id, role)
);

create index family_memberships_tenant_id_idx on public.family_memberships (tenant_id);
create index family_memberships_person_id_idx on public.family_memberships (person_id);
create index family_memberships_family_unit_id_idx on public.family_memberships (family_unit_id);

create trigger family_memberships_set_updated_at
  before update on public.family_memberships
  for each row execute function app.set_updated_at();

alter table public.family_memberships enable row level security;
alter table public.family_memberships force row level security;

create policy family_memberships_rw_within_tenant
  on public.family_memberships
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------------------------

create table public.relationships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  from_person_id uuid not null references public.persons(id) on delete cascade,
  to_person_id uuid not null references public.persons(id) on delete cascade,
  relationship_type text not null check (relationship_type in (
    'PARENT', 'STEPPARENT', 'GUARDIAN', 'GRANDPARENT', 'SIBLING', 'HALF_SIBLING',
    'CAREGIVER', 'SPOUSE_PARTNER', 'OTHER'
  )),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (from_person_id <> to_person_id)
);

create index relationships_tenant_id_idx on public.relationships (tenant_id);
create index relationships_from_person_idx on public.relationships (from_person_id);
create index relationships_to_person_idx on public.relationships (to_person_id);

create trigger relationships_set_updated_at
  before update on public.relationships
  for each row execute function app.set_updated_at();

alter table public.relationships enable row level security;
alter table public.relationships force row level security;

create policy relationships_rw_within_tenant
  on public.relationships
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
