-- ============================================================================
-- 0009: audit_events (§26). Insert-only / immutable: no UPDATE or DELETE
-- policy exists for any role, so once RLS is enabled even the row owner
-- cannot modify or remove an event through the API/anon/authenticated
-- roles. Only a superuser/service-role maintenance job (documented in
-- RUNBOOK.md) can perform retention-driven deletes.
-- ============================================================================

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  event_type text not null check (event_type in (
    'LOGIN', 'LOGOUT', 'VIEW_HEALTH', 'VIEW_DOCUMENT', 'CREATE_EVENT', 'UPDATE_MEDICATION',
    'ADMINISTER_MEDICATION', 'GRANT_PERMISSION', 'REVOKE_PERMISSION', 'SHARE_DOCUMENT',
    'EMERGENCY_ACCESS', 'AI_QUERY', 'AI_ACTION', 'EXPORT_DATA', 'DELETE_REQUEST',
    'PERSON_CREATED', 'FAMILY_UNIT_CREATED', 'FAMILY_MEMBER_ADDED', 'RELATIONSHIP_CREATED',
    'RESIDENCE_CREATED', 'INVITATION_SENT', 'INVITATION_ACCEPTED', 'POLICY_DECISION'
  )),
  actor_user_id uuid references public.users(id),
  actor_person_id uuid references public.persons(id),
  subject_person_id uuid references public.persons(id),
  resource_type text,
  resource_id uuid,
  result text not null check (result in ('SUCCESS', 'DENIED', 'ERROR')),
  -- Redacted, structured context only — NEVER raw prescriptions, document
  -- bodies, tokens, or passwords (§76). Enforced by convention in
  -- packages/observability's redaction helper; not something SQL can check.
  context jsonb,
  device_id text,
  ip_address inet,
  correlation_id uuid
);

create index audit_events_tenant_id_idx on public.audit_events (tenant_id);
create index audit_events_occurred_at_idx on public.audit_events (occurred_at desc);
create index audit_events_subject_person_idx on public.audit_events (subject_person_id);
create index audit_events_correlation_id_idx on public.audit_events (correlation_id);

alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;

create policy audit_events_select_within_tenant
  on public.audit_events
  for select
  to authenticated
  using (tenant_id = app.current_tenant_id());

create policy audit_events_insert_within_tenant
  on public.audit_events
  for insert
  to authenticated
  with check (tenant_id = app.current_tenant_id());

-- No update/delete policy for any client-facing role — immutability by omission.
