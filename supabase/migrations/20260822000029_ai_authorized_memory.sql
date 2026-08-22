-- ZELII authorized contextual memory.
-- Persistent memories are explicit, attributable and revocable. They are
-- never a raw chat transcript and inherit BOTH AI and source-domain access.

create table public.ai_memory_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subject_person_id uuid not null,
  domain text not null check (domain in (
    'PROFILE','SCHEDULE','HEALTH','MEDICATION','VACCINATION','SCHOOL','DOCUMENTS',
    'FINANCE','ACTIVITIES','TRANSPORTATION','CONTACTS','NOTES','LOCATION','EMERGENCY','AI','AUDIT'
  )),
  memory_type text not null check (memory_type in ('PREFERENCE','ROUTINE','CONSTRAINT','DECISION','CONTEXT')),
  summary text not null check (char_length(summary) between 1 and 500),
  source_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(source_refs) = 'array'),
  verification_status text not null default 'CONFIRMED' check (verification_status in ('CONFIRMED','OUTDATED')),
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  purpose text not null default 'family_assistance' check (char_length(purpose) between 1 and 100),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  last_verified_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_by_person_id uuid not null,
  confirmed_by_person_id uuid not null,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_memory_items_subject_tenant_fk foreign key (subject_person_id, tenant_id)
    references public.persons(id, tenant_id) on delete cascade,
  constraint ai_memory_items_creator_tenant_fk foreign key (created_by_person_id, tenant_id)
    references public.persons(id, tenant_id),
  constraint ai_memory_items_confirmer_tenant_fk foreign key (confirmed_by_person_id, tenant_id)
    references public.persons(id, tenant_id),
  constraint ai_memory_items_validity_check check (valid_until is null or valid_until > valid_from)
);

create index ai_memory_items_active_subject_domain_idx
  on public.ai_memory_items (tenant_id, subject_person_id, domain, valid_until)
  where revoked_at is null;

create trigger ai_memory_items_set_updated_at
  before update on public.ai_memory_items
  for each row execute function app.set_updated_at();

-- Memories are immutable evidence. A correction is a revoke + a newly
-- confirmed memory, preserving provenance instead of silently rewriting it.
create or replace function app.validate_ai_memory_revocation()
returns trigger language plpgsql as $$
begin
  if row(
    new.tenant_id, new.subject_person_id, new.domain, new.memory_type, new.summary,
    new.source_refs, new.verification_status, new.confidence, new.purpose,
    new.valid_from, new.valid_until, new.last_verified_at, new.created_by_person_id,
    new.confirmed_by_person_id, new.confirmed_at, new.created_at
  ) is distinct from row(
    old.tenant_id, old.subject_person_id, old.domain, old.memory_type, old.summary,
    old.source_refs, old.verification_status, old.confidence, old.purpose,
    old.valid_from, old.valid_until, old.last_verified_at, old.created_by_person_id,
    old.confirmed_by_person_id, old.confirmed_at, old.created_at
  ) then
    raise exception 'ai_memory_items are immutable; revoke and create a corrected memory';
  end if;
  if old.revoked_at is not null or new.revoked_at is null then
    raise exception 'ai_memory_items only allow a single explicit revocation';
  end if;
  return new;
end; $$;

create trigger ai_memory_items_validate_revocation
  before update on public.ai_memory_items
  for each row execute function app.validate_ai_memory_revocation();

alter table public.ai_memory_items enable row level security;

create policy ai_memory_items_select_authorized
  on public.ai_memory_items for select to authenticated
  using (
    app.is_current_tenant(tenant_id)
    and app.has_domain_access(tenant_id, subject_person_id, 'AI', 'VIEW')
    and app.has_domain_access(tenant_id, subject_person_id, domain, 'VIEW')
  );

create policy ai_memory_items_insert_authorized_confirmed
  on public.ai_memory_items for insert to authenticated
  with check (
    app.is_current_tenant(tenant_id)
    and created_by_person_id = app.person_id_in_tenant(tenant_id)
    and confirmed_by_person_id = app.person_id_in_tenant(tenant_id)
    and verification_status = 'CONFIRMED'
    and app.has_domain_access(tenant_id, subject_person_id, 'AI', 'CREATE')
    and app.has_domain_access(tenant_id, subject_person_id, domain, 'EDIT')
  );

create policy ai_memory_items_revoke_authorized
  on public.ai_memory_items for update to authenticated
  using (
    app.is_current_tenant(tenant_id)
    and revoked_at is null
    and (created_by_person_id = app.person_id_in_tenant(tenant_id) or app.has_any_family_admin_role(tenant_id))
    and app.has_domain_access(tenant_id, subject_person_id, 'AI', 'EDIT')
    and app.has_domain_access(tenant_id, subject_person_id, domain, 'EDIT')
  )
  with check (app.is_current_tenant(tenant_id) and revoked_at is not null);

grant select, insert, update on public.ai_memory_items to authenticated;
revoke delete on public.ai_memory_items from authenticated;
