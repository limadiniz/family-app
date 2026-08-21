-- ============================================================================
-- 0007: authority_grants, care_schedules, care_windows, handoffs (§17-20).
-- authority_grants is what the Family Policy Engine actually reads
-- (packages/policy-engine) — RLS here guarantees a tenant can never even
-- fetch another tenant's grants, on top of the engine's own logic.
-- ============================================================================

create table public.authority_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  grantee_person_id uuid not null references public.persons(id) on delete cascade,
  subject_person_id uuid not null references public.persons(id) on delete cascade,
  domain text not null check (domain in (
    'PROFILE', 'SCHEDULE', 'HEALTH', 'MEDICATION', 'VACCINATION', 'SCHOOL', 'DOCUMENTS',
    'FINANCE', 'ACTIVITIES', 'TRANSPORTATION', 'CONTACTS', 'NOTES', 'LOCATION', 'EMERGENCY', 'AI', 'AUDIT'
  )),
  action text not null check (action in ('VIEW', 'COMMENT', 'CREATE', 'EDIT', 'DELETE', 'MANAGE', 'SHARE', 'ADMIN')),
  care_window_id uuid, -- FK added once care_windows exists (below, same migration)
  residence_id uuid references public.residences(id) on delete set null,
  valid_from timestamptz,
  valid_until timestamptz,
  granted_by_person_id uuid not null references public.persons(id),
  revoked_at timestamptz,
  revoked_by_person_id uuid references public.persons(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index authority_grants_tenant_id_idx on public.authority_grants (tenant_id);
create index authority_grants_grantee_subject_idx on public.authority_grants (grantee_person_id, subject_person_id);

create trigger authority_grants_set_updated_at
  before update on public.authority_grants
  for each row execute function app.set_updated_at();

alter table public.authority_grants enable row level security;
alter table public.authority_grants force row level security;

create policy authority_grants_rw_within_tenant
  on public.authority_grants
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------------------------

create table public.care_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  child_person_id uuid not null references public.persons(id) on delete cascade,
  caregiver_person_id uuid not null references public.persons(id) on delete cascade,
  residence_id uuid references public.residences(id) on delete set null,
  rrule text not null,
  start_date date not null,
  end_date date,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index care_schedules_tenant_id_idx on public.care_schedules (tenant_id);

create trigger care_schedules_set_updated_at
  before update on public.care_schedules
  for each row execute function app.set_updated_at();

alter table public.care_schedules enable row level security;
alter table public.care_schedules force row level security;

create policy care_schedules_rw_within_tenant
  on public.care_schedules
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------------------------

create table public.care_windows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  child_person_id uuid not null references public.persons(id) on delete cascade,
  caregiver_person_id uuid not null references public.persons(id) on delete cascade,
  care_schedule_id uuid references public.care_schedules(id) on delete set null,
  residence_id uuid references public.residences(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (ends_at > starts_at)
);

create index care_windows_tenant_id_idx on public.care_windows (tenant_id);
create index care_windows_caregiver_child_idx on public.care_windows (caregiver_person_id, child_person_id);
create index care_windows_active_range_idx on public.care_windows (starts_at, ends_at);

create trigger care_windows_set_updated_at
  before update on public.care_windows
  for each row execute function app.set_updated_at();

alter table public.care_windows enable row level security;
alter table public.care_windows force row level security;

create policy care_windows_rw_within_tenant
  on public.care_windows
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

alter table public.authority_grants
  add constraint authority_grants_care_window_fk
  foreign key (care_window_id) references public.care_windows(id) on delete set null;

-- ----------------------------------------------------------------------------

create table public.handoffs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  child_person_id uuid not null references public.persons(id) on delete cascade,
  from_person_id uuid not null references public.persons(id) on delete cascade,
  to_person_id uuid not null references public.persons(id) on delete cascade,
  care_window_id uuid references public.care_windows(id) on delete set null,
  scheduled_at timestamptz not null,
  actual_at timestamptz,
  location_residence_id uuid references public.residences(id) on delete set null,
  status text not null default 'EXPECTED' check (status in ('EXPECTED', 'CONFIRMED', 'COMPLETED', 'DELAYED', 'CANCELLED', 'DISPUTED')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index handoffs_tenant_id_idx on public.handoffs (tenant_id);

create trigger handoffs_set_updated_at
  before update on public.handoffs
  for each row execute function app.set_updated_at();

alter table public.handoffs enable row level security;
alter table public.handoffs force row level security;

create policy handoffs_rw_within_tenant
  on public.handoffs
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
