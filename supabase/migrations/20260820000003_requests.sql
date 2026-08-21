-- ============================================================================
-- 0013 (V2 Fase 6): Family Request Engine (§30-37). requests carries
-- current state; request_actions is an append-only trail (no UPDATE/
-- DELETE policy at all, same immutability-by-omission pattern as
-- audit_events) so a dispute or acceptance history can never be
-- silently rewritten.
-- ============================================================================

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null check (type in (
    'RESPONSIBILITY_TRANSFER', 'SCHEDULE_CHANGE', 'PICKUP_REQUEST', 'DROPOFF_REQUEST', 'RESIDENCE_CHANGE',
    'EXPENSE_APPROVAL', 'PERMISSION_REQUEST', 'DOCUMENT_REQUEST', 'INFORMATION_REQUEST', 'OTHER'
  )),
  status text not null default 'DRAFT' check (status in (
    'DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'DISPUTED', 'COMPLETED'
  )),
  requested_by_person_id uuid not null references public.persons(id) on delete cascade,
  requested_to_person_id uuid not null references public.persons(id) on delete cascade,
  subject_person_id uuid references public.persons(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  related_resource_type text,
  related_resource_id uuid,
  note text,
  responded_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index requests_tenant_id_idx on public.requests (tenant_id);
create index requests_requested_to_idx on public.requests (requested_to_person_id);
create index requests_status_idx on public.requests (status);

create trigger requests_set_updated_at
  before update on public.requests
  for each row execute function app.set_updated_at();

alter table public.requests enable row level security;
alter table public.requests force row level security;

create policy requests_rw_within_tenant
  on public.requests
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------------------------

create table public.request_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  request_id uuid not null references public.requests(id) on delete cascade,
  action_type text not null check (action_type in (
    'CREATED', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'DISPUTED', 'COMMENTED', 'COMPLETED'
  )),
  actor_person_id uuid not null references public.persons(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

create index request_actions_tenant_id_idx on public.request_actions (tenant_id);
create index request_actions_request_id_idx on public.request_actions (request_id);

alter table public.request_actions enable row level security;
alter table public.request_actions force row level security;

-- Insert + select only — no update/delete policy at all (immutability by omission).
create policy request_actions_select_within_tenant
  on public.request_actions
  for select
  to authenticated
  using (tenant_id = app.current_tenant_id());

create policy request_actions_insert_within_tenant
  on public.request_actions
  for insert
  to authenticated
  with check (tenant_id = app.current_tenant_id());
