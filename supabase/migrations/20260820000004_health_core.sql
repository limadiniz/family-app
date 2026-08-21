-- ============================================================================
-- 0014 (V2 Fase 7): Health Core + Emergency Profile (§41-44, §55-58).
-- A Prescription's provenance is constrained to USER_DECLARED or
-- PROFESSIONAL_CONFIRMED at the application layer (packages/domain) —
-- the AI Gateway is never the origin of a prescription record, only ever
-- a reader/summarizer of one.
-- ============================================================================

create table public.health_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  blood_type text,
  allergies text[] not null default '{}',
  conditions text[] not null default '{}',
  health_plan_name text,
  health_plan_card_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, person_id)
);

create index health_profiles_tenant_id_idx on public.health_profiles (tenant_id);

create trigger health_profiles_set_updated_at
  before update on public.health_profiles
  for each row execute function app.set_updated_at();

alter table public.health_profiles enable row level security;
alter table public.health_profiles force row level security;

create policy health_profiles_rw_within_tenant
  on public.health_profiles
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------------------------

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subject_person_id uuid not null references public.persons(id) on delete cascade,
  prescribed_by_name text,
  prescribed_at date,
  source_document_id uuid,
  notes text,
  provenance text not null default 'USER_DECLARED' check (provenance in ('USER_DECLARED', 'PROFESSIONAL_CONFIRMED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index prescriptions_tenant_id_idx on public.prescriptions (tenant_id);
create index prescriptions_subject_person_idx on public.prescriptions (subject_person_id);

create trigger prescriptions_set_updated_at
  before update on public.prescriptions
  for each row execute function app.set_updated_at();

alter table public.prescriptions enable row level security;
alter table public.prescriptions force row level security;

create policy prescriptions_rw_within_tenant
  on public.prescriptions
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------------------------

create table public.medications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subject_person_id uuid not null references public.persons(id) on delete cascade,
  prescription_id uuid references public.prescriptions(id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  dosage_text text,
  active boolean not null default true,
  provenance text not null default 'USER_DECLARED' check (provenance in (
    'USER_DECLARED', 'DOCUMENT_EXTRACTED', 'PROFESSIONAL_CONFIRMED', 'SYSTEM_GENERATED', 'AI_INFERRED'
  )),
  confidence numeric(4, 3) check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index medications_tenant_id_idx on public.medications (tenant_id);
create index medications_subject_person_idx on public.medications (subject_person_id);

create trigger medications_set_updated_at
  before update on public.medications
  for each row execute function app.set_updated_at();

alter table public.medications enable row level security;
alter table public.medications force row level security;

create policy medications_rw_within_tenant
  on public.medications
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------------------------

create table public.medication_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete cascade,
  rrule text not null,
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index medication_schedules_tenant_id_idx on public.medication_schedules (tenant_id);
create index medication_schedules_medication_idx on public.medication_schedules (medication_id);

create trigger medication_schedules_set_updated_at
  before update on public.medication_schedules
  for each row execute function app.set_updated_at();

alter table public.medication_schedules enable row level security;
alter table public.medication_schedules force row level security;

create policy medication_schedules_rw_within_tenant
  on public.medication_schedules
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------------------------

create table public.medication_administrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete cascade,
  medication_schedule_id uuid references public.medication_schedules(id) on delete set null,
  scheduled_at timestamptz not null,
  administered_at timestamptz,
  administered_by_person_id uuid references public.persons(id) on delete set null,
  status text not null default 'SCHEDULED' check (status in (
    'SCHEDULED', 'TAKEN', 'MISSED', 'SKIPPED', 'LATE', 'UNCONFIRMED'
  )),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index medication_administrations_tenant_id_idx on public.medication_administrations (tenant_id);
create index medication_administrations_medication_idx on public.medication_administrations (medication_id);
create index medication_administrations_scheduled_at_idx on public.medication_administrations (scheduled_at);

create trigger medication_administrations_set_updated_at
  before update on public.medication_administrations
  for each row execute function app.set_updated_at();

alter table public.medication_administrations enable row level security;
alter table public.medication_administrations force row level security;

create policy medication_administrations_rw_within_tenant
  on public.medication_administrations
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------------------------

create table public.emergency_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subject_person_id uuid not null references public.persons(id) on delete cascade,
  blood_type text,
  allergies text[] not null default '{}',
  conditions text[] not null default '{}',
  critical_medications text[] not null default '{}',
  health_plan_name text,
  health_plan_card_number text,
  pediatrician_name text,
  preferred_hospital text,
  emergency_contacts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, subject_person_id)
);

create index emergency_profiles_tenant_id_idx on public.emergency_profiles (tenant_id);

create trigger emergency_profiles_set_updated_at
  before update on public.emergency_profiles
  for each row execute function app.set_updated_at();

alter table public.emergency_profiles enable row level security;
alter table public.emergency_profiles force row level security;

create policy emergency_profiles_rw_within_tenant
  on public.emergency_profiles
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
