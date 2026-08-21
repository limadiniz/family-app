-- ============================================================================
-- 0012 (V2 Fase 4): Universal Family Inbox / Capture Engine (§13-23).
-- capture_items is the single entry point for everything the family
-- sends in; nothing here writes to calendar_events/tasks/checklists
-- directly — apps/api's CaptureService is the only code path allowed to
-- do that, and only once a capture_proposals row reaches CONFIRMED.
-- ============================================================================

create table public.capture_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by_person_id uuid not null references public.persons(id) on delete cascade,
  subject_person_id uuid references public.persons(id) on delete set null,
  source text not null check (source in (
    'TEXT', 'PHOTO', 'SCREENSHOT', 'PDF', 'DOCUMENT', 'AUDIO', 'EMAIL', 'FORWARDED_MESSAGE'
  )),
  status text not null default 'RECEIVED' check (status in (
    'RECEIVED', 'PROCESSING', 'NEEDS_REVIEW', 'READY', 'CONFIRMED', 'REJECTED', 'FAILED', 'ARCHIVED'
  )),
  raw_text text,
  category text check (category in (
    'SCHOOL_ANNOUNCEMENT', 'SCHOOL_ASSIGNMENT', 'SCHOOL_EXAM', 'MEDICAL_PRESCRIPTION', 'MEDICAL_EXAM',
    'MEDICAL_APPOINTMENT', 'ACTIVITY', 'CALENDAR_EVENT', 'TASK', 'PAYMENT', 'DOCUMENT', 'TRANSPORTATION', 'OTHER'
  )),
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index capture_items_tenant_id_idx on public.capture_items (tenant_id);
create index capture_items_status_idx on public.capture_items (status);
create index capture_items_created_by_idx on public.capture_items (created_by_person_id);

create trigger capture_items_set_updated_at
  before update on public.capture_items
  for each row execute function app.set_updated_at();

alter table public.capture_items enable row level security;
alter table public.capture_items force row level security;

create policy capture_items_rw_within_tenant
  on public.capture_items
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------------------------

create table public.capture_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  capture_item_id uuid not null references public.capture_items(id) on delete cascade,
  storage_path text not null, -- private bucket path, never a public URL
  original_filename text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index capture_attachments_tenant_id_idx on public.capture_attachments (tenant_id);
create index capture_attachments_item_id_idx on public.capture_attachments (capture_item_id);

create trigger capture_attachments_set_updated_at
  before update on public.capture_attachments
  for each row execute function app.set_updated_at();

alter table public.capture_attachments enable row level security;
alter table public.capture_attachments force row level security;

create policy capture_attachments_rw_within_tenant
  on public.capture_attachments
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------------------------

create table public.capture_extractions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  capture_item_id uuid not null references public.capture_items(id) on delete cascade,
  extractor_name text not null,
  extracted_fields jsonb not null default '{}'::jsonb,
  provenance text not null default 'AI_INFERRED' check (provenance in (
    'USER_DECLARED', 'DOCUMENT_EXTRACTED', 'PROFESSIONAL_CONFIRMED', 'SYSTEM_GENERATED', 'AI_INFERRED'
  )),
  confidence numeric(4, 3) check (confidence between 0 and 1),
  source_document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index capture_extractions_tenant_id_idx on public.capture_extractions (tenant_id);
create index capture_extractions_item_id_idx on public.capture_extractions (capture_item_id);

create trigger capture_extractions_set_updated_at
  before update on public.capture_extractions
  for each row execute function app.set_updated_at();

alter table public.capture_extractions enable row level security;
alter table public.capture_extractions force row level security;

create policy capture_extractions_rw_within_tenant
  on public.capture_extractions
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------------------------

create table public.capture_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  capture_item_id uuid not null references public.capture_items(id) on delete cascade,
  target_type text not null check (target_type in ('CALENDAR_EVENT', 'TASK', 'CHECKLIST', 'DOCUMENT')),
  proposed_fields jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'EDITED_AND_CONFIRMED', 'DISCARDED')),
  confidence numeric(4, 3) check (confidence between 0 and 1),
  confirmed_by_person_id uuid references public.persons(id) on delete set null,
  confirmed_at timestamptz,
  resulting_record_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index capture_proposals_tenant_id_idx on public.capture_proposals (tenant_id);
create index capture_proposals_item_id_idx on public.capture_proposals (capture_item_id);

create trigger capture_proposals_set_updated_at
  before update on public.capture_proposals
  for each row execute function app.set_updated_at();

alter table public.capture_proposals enable row level security;
alter table public.capture_proposals force row level security;

create policy capture_proposals_rw_within_tenant
  on public.capture_proposals
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
