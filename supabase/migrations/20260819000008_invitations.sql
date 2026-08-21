-- ============================================================================
-- 0008: invitations (§86-87).
-- ============================================================================

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  family_unit_id uuid not null references public.family_units(id) on delete cascade,
  invited_by_person_id uuid not null references public.persons(id),
  invitee_email citext not null,
  proposed_relationship text not null check (proposed_relationship in (
    'PARENT', 'STEPPARENT', 'GUARDIAN', 'GRANDPARENT', 'SIBLING', 'HALF_SIBLING',
    'CAREGIVER', 'SPOUSE_PARTNER', 'OTHER'
  )),
  proposed_role text not null check (proposed_role in (
    'FAMILY_OWNER', 'GUARDIAN', 'CO_GUARDIAN', 'CAREGIVER', 'TEMPORARY_CAREGIVER',
    'EXTENDED_FAMILY', 'TEEN', 'CHILD', 'PROFESSIONAL', 'EMERGENCY_ACCESS', 'PLATFORM_ADMIN'
  )),
  permission_preset text not null check (permission_preset in (
    'RESPONSAVEL_COMPLETO', 'RESPONSAVEL_COMPARTILHADO', 'AVO_AVO', 'BABA',
    'CUIDADOR_TEMPORARIO', 'ADOLESCENTE', 'PROFISSIONAL'
  )),
  subject_person_ids uuid[] not null check (array_length(subject_person_ids, 1) >= 1),
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED')),
  token text not null unique,
  expires_at timestamptz not null,
  accepted_by_user_id uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index invitations_tenant_id_idx on public.invitations (tenant_id);
create index invitations_token_idx on public.invitations (token);

create trigger invitations_set_updated_at
  before update on public.invitations
  for each row execute function app.set_updated_at();

alter table public.invitations enable row level security;
alter table public.invitations force row level security;

create policy invitations_rw_within_tenant
  on public.invitations
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- Invitation lookup-by-token (for an unauthenticated recipient opening the
-- link) intentionally goes through a SECURITY DEFINER RPC in apps/api,
-- never a public RLS policy — otherwise anyone could enumerate invitations.
