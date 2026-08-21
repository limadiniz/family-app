-- ============================================================================
-- 0015: documents, extracted_document_data — promoting the Phase 1
-- planning stub (packages/domain's product-stubs.ts) to a real table.
-- storage_path is always a private Supabase Storage path; the API layer
-- is the only thing allowed to mint short-lived signed URLs for it.
-- ============================================================================

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subject_person_id uuid not null references public.persons(id) on delete cascade,
  category text not null check (category in (
    'IDENTIFICATION', 'SUS', 'HEALTH_PLAN', 'PRESCRIPTION', 'EXAM', 'VACCINATION', 'SCHOOL', 'AUTHORIZATION', 'OTHER'
  )),
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes >= 0),
  provenance text not null default 'USER_DECLARED' check (provenance in (
    'USER_DECLARED', 'DOCUMENT_EXTRACTED', 'PROFESSIONAL_CONFIRMED', 'SYSTEM_GENERATED', 'AI_INFERRED'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index documents_tenant_id_idx on public.documents (tenant_id);
create index documents_subject_person_idx on public.documents (subject_person_id);

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function app.set_updated_at();

alter table public.documents enable row level security;
alter table public.documents force row level security;

create policy documents_rw_within_tenant
  on public.documents
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------------------------

create table public.extracted_document_data (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  extracted_fields jsonb not null default '{}'::jsonb,
  provenance text not null default 'AI_INFERRED' check (provenance in (
    'USER_DECLARED', 'DOCUMENT_EXTRACTED', 'PROFESSIONAL_CONFIRMED', 'SYSTEM_GENERATED', 'AI_INFERRED'
  )),
  confidence numeric(4, 3) check (confidence between 0 and 1),
  source_document_id uuid,
  confirmed_by_person_id uuid references public.persons(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index extracted_document_data_tenant_id_idx on public.extracted_document_data (tenant_id);
create index extracted_document_data_document_idx on public.extracted_document_data (document_id);

create trigger extracted_document_data_set_updated_at
  before update on public.extracted_document_data
  for each row execute function app.set_updated_at();

alter table public.extracted_document_data enable row level security;
alter table public.extracted_document_data force row level security;

create policy extracted_document_data_rw_within_tenant
  on public.extracted_document_data
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
