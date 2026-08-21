-- ============================================================================
-- 0019 (adendo §18-19, §24): RecurringResponsibility + CaregiverAvailability.
-- Both are DATA structures only in this phase — no materialization job or
-- suggestion algorithm reads them yet (documented in
-- docs/delivery/gap-analysis-extended-care-network.md). §24 itself asks for
-- "estrutura futura" for availability, so shipping schema-only here is not
-- a shortcut, it is exactly what was asked.
-- ============================================================================

create table public.recurring_responsibilities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subject_person_id uuid not null references public.persons(id) on delete cascade,
  responsibility_type text not null check (responsibility_type in (
    'PICKUP', 'DROPOFF', 'TRANSPORT', 'SCHOOL_SUPPORT', 'MEDICAL_APPOINTMENT', 'MEDICATION_SUPPORT',
    'ACTIVITY_TRANSPORT', 'OVERNIGHT_CARE', 'TEMPORARY_CARE', 'DOCUMENT_DELIVERY', 'PAYMENT', 'PURCHASE',
    'HOMEWORK_SUPPORT', 'MEAL_PREPARATION', 'EMERGENCY_CONTACT', 'OTHER'
  )),
  default_assigned_to_person_id uuid not null references public.persons(id) on delete cascade,
  fallback_person_id uuid references public.persons(id) on delete set null,
  rrule text not null,
  start_date date not null,
  end_date date,
  instructions text,
  is_active boolean not null default true,
  created_by_person_id uuid not null references public.persons(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index recurring_responsibilities_tenant_id_idx on public.recurring_responsibilities (tenant_id);
create index recurring_responsibilities_subject_idx on public.recurring_responsibilities (subject_person_id);

create trigger recurring_responsibilities_set_updated_at
  before update on public.recurring_responsibilities
  for each row execute function app.set_updated_at();

alter table public.recurring_responsibilities enable row level security;
alter table public.recurring_responsibilities force row level security;

create policy recurring_responsibilities_rw_within_tenant
  on public.recurring_responsibilities
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------------------------

create table public.caregiver_availability (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_time > start_time)
);

create index caregiver_availability_tenant_id_idx on public.caregiver_availability (tenant_id);
create index caregiver_availability_person_idx on public.caregiver_availability (person_id);

create trigger caregiver_availability_set_updated_at
  before update on public.caregiver_availability
  for each row execute function app.set_updated_at();

alter table public.caregiver_availability enable row level security;
alter table public.caregiver_availability force row level security;

create policy caregiver_availability_rw_within_tenant
  on public.caregiver_availability
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
