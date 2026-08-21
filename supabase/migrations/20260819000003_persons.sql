-- ============================================================================
-- 0003: persons — the central entity of the Family Care Graph (§2-3, §13).
-- A Person may exist without ever having an authenticated User.
-- ============================================================================

create table public.persons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 150),
  legal_name text,
  birth_date date,
  person_type text not null check (person_type in ('ADULT', 'MINOR', 'INFANT')),
  avatar_url text,
  is_minor boolean not null default false,
  primary_language text not null default 'pt-BR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index persons_tenant_id_idx on public.persons (tenant_id);

create trigger persons_set_updated_at
  before update on public.persons
  for each row execute function app.set_updated_at();

alter table public.persons enable row level security;
alter table public.persons force row level security;

-- Tenant-level wall. Fine-grained (per-Person, per-domain) authorization
-- within a tenant is the Family Policy Engine's job (apps/api), not RLS —
-- see SECURITY.md "defense in depth" section for the full rationale.
create policy persons_select_within_tenant
  on public.persons
  for select
  to authenticated
  using (tenant_id = app.current_tenant_id());

create policy persons_insert_within_tenant
  on public.persons
  for insert
  to authenticated
  with check (tenant_id = app.current_tenant_id());

create policy persons_update_within_tenant
  on public.persons
  for update
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- No delete policy — persons are soft-deleted (deleted_at) per §115.
