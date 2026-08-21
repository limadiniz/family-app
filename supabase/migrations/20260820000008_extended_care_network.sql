-- ============================================================================
-- 0018 (adendo: Rede Ampliada de Responsabilidade Familiar): core Extended
-- Care Network tables. Kinship never grants access by itself (§2) — only
-- an accepted responsibility_assignment, via its minted authority_grants,
-- does. responsibility_assignments.status follows the same
-- proposal->accept->active gate as the Family Request Engine; nothing in
-- application code is allowed to jump straight to ACTIVE (see
-- packages/domain's canTransitionResponsibilityAssignment, enforced again
-- here defensively via the check constraint on status values only — the
-- actual transition graph is app-layer, same pattern as `requests`).
-- ============================================================================

create table public.responsibility_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subject_person_id uuid not null references public.persons(id) on delete cascade,
  responsibility_type text not null check (responsibility_type in (
    'PICKUP', 'DROPOFF', 'TRANSPORT', 'SCHOOL_SUPPORT', 'MEDICAL_APPOINTMENT', 'MEDICATION_SUPPORT',
    'ACTIVITY_TRANSPORT', 'OVERNIGHT_CARE', 'TEMPORARY_CARE', 'DOCUMENT_DELIVERY', 'PAYMENT', 'PURCHASE',
    'HOMEWORK_SUPPORT', 'MEAL_PREPARATION', 'EMERGENCY_CONTACT', 'OTHER'
  )),
  assigned_to_person_id uuid not null references public.persons(id) on delete cascade,
  assigned_by_person_id uuid not null references public.persons(id) on delete cascade,
  accountable_person_id uuid not null references public.persons(id) on delete cascade,
  consulted_person_ids uuid[] not null default '{}',
  informed_person_ids uuid[] not null default '{}',
  source_type text not null default 'MANUAL' check (source_type in (
    'RESPONSIBILITY_ASSIGNMENT', 'CALENDAR_EVENT', 'RECURRING_RESPONSIBILITY', 'MANUAL'
  )),
  source_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'PROPOSED' check (status in (
    'PROPOSED', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'ACTIVE', 'COMPLETED', 'FAILED'
  )),
  priority text not null default 'NORMAL' check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  instructions text,
  required_permissions jsonb, -- null = use RESPONSIBILITY_PERMISSION_BUNDLES[responsibility_type] (packages/domain)
  fallback_assignment_id uuid references public.responsibility_assignments(id) on delete set null,
  request_id uuid references public.requests(id) on delete set null,
  accepted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (ends_at > starts_at)
);

create index responsibility_assignments_tenant_id_idx on public.responsibility_assignments (tenant_id);
create index responsibility_assignments_subject_idx on public.responsibility_assignments (subject_person_id);
create index responsibility_assignments_assigned_to_idx on public.responsibility_assignments (assigned_to_person_id);
create index responsibility_assignments_source_idx on public.responsibility_assignments (source_type, source_id);
create index responsibility_assignments_status_idx on public.responsibility_assignments (status);

create trigger responsibility_assignments_set_updated_at
  before update on public.responsibility_assignments
  for each row execute function app.set_updated_at();

alter table public.responsibility_assignments enable row level security;
alter table public.responsibility_assignments force row level security;

create policy responsibility_assignments_rw_within_tenant
  on public.responsibility_assignments
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------------------------
-- delegation_policies (§11-12): per-person override of who may delegate/
-- redelegate a responsibility they hold. Missing row = fall back to
-- ROLE_DEFAULT_DELEGATION_POLICY (packages/policy-engine), never to "allow".
-- ----------------------------------------------------------------------------

create table public.delegation_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  can_delegate boolean not null default false,
  can_redelegate boolean not null default false,
  max_delegation_depth int not null default 1 check (max_delegation_depth between 0 and 10),
  updated_by_person_id uuid not null references public.persons(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, person_id)
);

create index delegation_policies_tenant_id_idx on public.delegation_policies (tenant_id);

create trigger delegation_policies_set_updated_at
  before update on public.delegation_policies
  for each row execute function app.set_updated_at();

alter table public.delegation_policies enable row level security;
alter table public.delegation_policies force row level security;

create policy delegation_policies_rw_within_tenant
  on public.delegation_policies
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------------------------
-- care_network_members (§22-23): the Caregiver Pool for one child.
-- Membership alone grants NOTHING — it only records eligibility/
-- capabilities; access always flows through an accepted
-- responsibility_assignment's minted authority_grants.
-- ----------------------------------------------------------------------------

create table public.care_network_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subject_person_id uuid not null references public.persons(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('ACTIVE', 'INACTIVE', 'PENDING')),
  capabilities text[] not null default '{}',
  note text,
  valid_from timestamptz,
  valid_until timestamptz,
  added_by_person_id uuid not null references public.persons(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, subject_person_id, person_id)
);

create index care_network_members_tenant_id_idx on public.care_network_members (tenant_id);
create index care_network_members_subject_idx on public.care_network_members (subject_person_id);

create trigger care_network_members_set_updated_at
  before update on public.care_network_members
  for each row execute function app.set_updated_at();

alter table public.care_network_members enable row level security;
alter table public.care_network_members force row level security;

create policy care_network_members_rw_within_tenant
  on public.care_network_members
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
