-- ============================================================================
-- 0011 (V2 Fase 3): Command Center — calendar_events, tasks, routines,
-- routine_items, checklists, checklist_items (Prompt Mestre V2 §24-29).
-- Same tenant-scoped RLS pattern as every prior table.
-- ============================================================================

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subject_person_id uuid not null references public.persons(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  category text not null default 'OTHER' check (category in (
    'SCHOOL', 'HEALTH', 'SPORT', 'FAMILY', 'MEDICATION', 'DOCUMENT', 'FINANCE', 'OTHER'
  )),
  starts_at timestamptz not null,
  ends_at timestamptz,
  residence_id uuid references public.residences(id) on delete set null,
  responsible_person_id uuid references public.persons(id) on delete set null,
  transportation_person_id uuid references public.persons(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index calendar_events_tenant_id_idx on public.calendar_events (tenant_id);
create index calendar_events_subject_person_idx on public.calendar_events (subject_person_id);
create index calendar_events_starts_at_idx on public.calendar_events (starts_at);

create trigger calendar_events_set_updated_at
  before update on public.calendar_events
  for each row execute function app.set_updated_at();

alter table public.calendar_events enable row level security;
alter table public.calendar_events force row level security;

create policy calendar_events_rw_within_tenant
  on public.calendar_events
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------------------------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subject_person_id uuid references public.persons(id) on delete set null,
  responsible_person_id uuid references public.persons(id) on delete set null,
  alternate_responsible_person_id uuid references public.persons(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  due_at timestamptz,
  priority text not null default 'MEDIUM' check (priority in ('LOW', 'MEDIUM', 'HIGH')),
  status text not null default 'TODO' check (status in ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED', 'OVERDUE')),
  rrule text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index tasks_tenant_id_idx on public.tasks (tenant_id);
create index tasks_responsible_person_idx on public.tasks (responsible_person_id);
create index tasks_due_at_idx on public.tasks (due_at);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function app.set_updated_at();

alter table public.tasks enable row level security;
alter table public.tasks force row level security;

create policy tasks_rw_within_tenant
  on public.tasks
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------------------------

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subject_person_id uuid not null references public.persons(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 150),
  category text not null default 'OTHER' check (category in (
    'MORNING', 'SCHOOL', 'EVENING', 'ACTIVITY', 'TRAVEL', 'HEALTH', 'OTHER'
  )),
  rrule text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index routines_tenant_id_idx on public.routines (tenant_id);
create index routines_subject_person_idx on public.routines (subject_person_id);

create trigger routines_set_updated_at
  before update on public.routines
  for each row execute function app.set_updated_at();

alter table public.routines enable row level security;
alter table public.routines force row level security;

create policy routines_rw_within_tenant
  on public.routines
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------------------------

create table public.routine_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  routine_id uuid not null references public.routines(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  sort_order integer not null default 0,
  completed_at timestamptz,
  completed_by_person_id uuid references public.persons(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index routine_items_tenant_id_idx on public.routine_items (tenant_id);
create index routine_items_routine_id_idx on public.routine_items (routine_id);

create trigger routine_items_set_updated_at
  before update on public.routine_items
  for each row execute function app.set_updated_at();

alter table public.routine_items enable row level security;
alter table public.routine_items force row level security;

create policy routine_items_rw_within_tenant
  on public.routine_items
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------------------------

create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subject_person_id uuid references public.persons(id) on delete set null,
  linked_calendar_event_id uuid references public.calendar_events(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index checklists_tenant_id_idx on public.checklists (tenant_id);
create index checklists_linked_event_idx on public.checklists (linked_calendar_event_id);

create trigger checklists_set_updated_at
  before update on public.checklists
  for each row execute function app.set_updated_at();

alter table public.checklists enable row level security;
alter table public.checklists force row level security;

create policy checklists_rw_within_tenant
  on public.checklists
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------------------------

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 200),
  sort_order integer not null default 0,
  checked_at timestamptz,
  checked_by_person_id uuid references public.persons(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index checklist_items_tenant_id_idx on public.checklist_items (tenant_id);
create index checklist_items_checklist_id_idx on public.checklist_items (checklist_id);

create trigger checklist_items_set_updated_at
  before update on public.checklist_items
  for each row execute function app.set_updated_at();

alter table public.checklist_items enable row level security;
alter table public.checklist_items force row level security;

create policy checklist_items_rw_within_tenant
  on public.checklist_items
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
