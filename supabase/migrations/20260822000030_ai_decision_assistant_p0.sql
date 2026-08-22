-- ZELII AI Decision Assistant P0: governed proposals, memory lifecycle,
-- user controls and append-only memory-use transparency.

alter table public.ai_memory_items
  add column if not exists normalized_content jsonb not null default '{}'::jsonb,
  add column if not exists learned_from_person_id uuid,
  add column if not exists superseded_by_id uuid,
  add column if not exists decision_context jsonb not null default '{}'::jsonb;

alter table public.ai_memory_items
  drop constraint if exists ai_memory_items_memory_type_check,
  drop constraint if exists ai_memory_items_verification_status_check;

alter table public.ai_memory_items
  add constraint ai_memory_items_memory_type_check check (memory_type in (
    'FACT','PREFERENCE','ROUTINE','CONSTRAINT','DECISION','OUTCOME','CORRECTION','PATTERN','CONTEXT'
  )),
  add constraint ai_memory_items_verification_status_check check (verification_status in (
    'DECLARED','EXTRACTED','CONFIRMED','INFERRED','OUTDATED'
  )),
  add constraint ai_memory_items_learned_from_tenant_fk foreign key (learned_from_person_id, tenant_id)
    references public.persons(id, tenant_id),
  add constraint ai_memory_items_id_tenant_unique unique (id, tenant_id),
  add constraint ai_memory_items_superseded_by_tenant_fk foreign key (superseded_by_id, tenant_id)
    references public.ai_memory_items(id, tenant_id);

alter table public.ai_memory_items force row level security;

-- Immutable content remains immutable. A correction may atomically mark the
-- old row revoked and point at the newly confirmed replacement.
create or replace function app.validate_ai_memory_revocation()
returns trigger language plpgsql as $$
begin
  if row(
    new.tenant_id, new.subject_person_id, new.domain, new.memory_type, new.summary,
    new.source_refs, new.verification_status, new.confidence, new.purpose,
    new.valid_from, new.valid_until, new.last_verified_at, new.created_by_person_id,
    new.confirmed_by_person_id, new.confirmed_at, new.created_at,
    new.normalized_content, new.learned_from_person_id, new.decision_context
  ) is distinct from row(
    old.tenant_id, old.subject_person_id, old.domain, old.memory_type, old.summary,
    old.source_refs, old.verification_status, old.confidence, old.purpose,
    old.valid_from, old.valid_until, old.last_verified_at, old.created_by_person_id,
    old.confirmed_by_person_id, old.confirmed_at, old.created_at,
    old.normalized_content, old.learned_from_person_id, old.decision_context
  ) then
    raise exception 'ai_memory_items are immutable; revoke and create a corrected memory';
  end if;
  if old.revoked_at is not null or new.revoked_at is null then
    raise exception 'ai_memory_items only allow a single explicit revocation';
  end if;
  if new.superseded_by_id is not null and new.superseded_by_id = new.id then
    raise exception 'a memory cannot supersede itself';
  end if;
  return new;
end; $$;

create table public.ai_memory_preferences (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  person_id uuid not null,
  memory_enabled boolean not null default true,
  proactive_enabled boolean not null default false,
  explanation_detail text not null default 'BALANCED' check (explanation_detail in ('CONCISE','BALANCED','DETAILED')),
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, person_id),
  constraint ai_memory_preferences_person_tenant_fk foreign key (person_id, tenant_id)
    references public.persons(id, tenant_id) on delete cascade
);

create trigger ai_memory_preferences_set_updated_at
  before update on public.ai_memory_preferences
  for each row execute function app.set_updated_at();

alter table public.ai_memory_preferences enable row level security;
alter table public.ai_memory_preferences force row level security;
create policy ai_memory_preferences_self
  on public.ai_memory_preferences for all to authenticated
  using (app.is_current_tenant(tenant_id) and person_id = app.person_id_in_tenant(tenant_id))
  with check (app.is_current_tenant(tenant_id) and person_id = app.person_id_in_tenant(tenant_id));
grant select, insert, update on public.ai_memory_preferences to authenticated;
revoke delete on public.ai_memory_preferences from authenticated;

create table public.ai_memory_usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  memory_id uuid not null references public.ai_memory_items(id) on delete cascade,
  actor_person_id uuid not null,
  purpose text not null check (char_length(purpose) between 1 and 100),
  used_at timestamptz not null default now(),
  constraint ai_memory_usage_actor_tenant_fk foreign key (actor_person_id, tenant_id)
    references public.persons(id, tenant_id)
);

alter table public.ai_memory_usage_events enable row level security;
alter table public.ai_memory_usage_events force row level security;
create policy ai_memory_usage_insert_self
  on public.ai_memory_usage_events for insert to authenticated
  with check (
    app.is_current_tenant(tenant_id)
    and actor_person_id = app.person_id_in_tenant(tenant_id)
    and exists (
      select 1 from public.ai_memory_items m
      where m.id = ai_memory_usage_events.memory_id
        and m.tenant_id = ai_memory_usage_events.tenant_id
        and m.revoked_at is null
    )
  );
create policy ai_memory_usage_select_self_or_admin
  on public.ai_memory_usage_events for select to authenticated
  using (
    app.is_current_tenant(tenant_id)
    and (actor_person_id = app.person_id_in_tenant(tenant_id) or app.has_any_family_admin_role(tenant_id))
  );
grant select, insert on public.ai_memory_usage_events to authenticated;
revoke update, delete on public.ai_memory_usage_events from authenticated;

create or replace function app.ai_required_authorization(proposal_type text)
returns jsonb language sql immutable strict as $$
  select case proposal_type
    when 'PROPOSE_TASK' then '[{"domain":"SCHEDULE","action":"CREATE"}]'::jsonb
    when 'PROPOSE_CALENDAR_EVENT' then '[{"domain":"SCHEDULE","action":"CREATE"}]'::jsonb
    when 'PROPOSE_REQUEST' then '[{"domain":"TRANSPORTATION","action":"CREATE"}]'::jsonb
    when 'PROPOSE_RESPONSIBILITY_ASSIGNMENT' then '[{"domain":"SCHEDULE","action":"MANAGE"}]'::jsonb
    when 'PROPOSE_REMINDER' then '[{"domain":"SCHEDULE","action":"CREATE"}]'::jsonb
    when 'PROPOSE_PREPARATION_CHECKLIST' then '[{"domain":"SCHEDULE","action":"CREATE"}]'::jsonb
    when 'PROPOSE_CARE_BRIEF' then '[{"domain":"HEALTH","action":"CREATE"}]'::jsonb
    when 'PROPOSE_HANDOFF' then '[{"domain":"SCHEDULE","action":"MANAGE"}]'::jsonb
    when 'PROPOSE_SCHEDULE_ADJUSTMENT' then '[{"domain":"SCHEDULE","action":"EDIT"}]'::jsonb
    else '[]'::jsonb
  end;
$$;

create table public.ai_action_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by_person_id uuid not null,
  subject_person_ids uuid[] not null check (cardinality(subject_person_ids) between 1 and 20),
  proposal_type text not null check (proposal_type in (
    'PROPOSE_TASK','PROPOSE_CALENDAR_EVENT','PROPOSE_REQUEST','PROPOSE_RESPONSIBILITY_ASSIGNMENT',
    'PROPOSE_REMINDER','PROPOSE_PREPARATION_CHECKLIST','PROPOSE_CARE_BRIEF','PROPOSE_HANDOFF',
    'PROPOSE_SCHEDULE_ADJUSTMENT'
  )),
  status text not null default 'DRAFT' check (status in (
    'DRAFT','READY_FOR_REVIEW','CONFIRMED','REJECTED','EXPIRED','EXECUTED','FAILED'
  )),
  proposed_data jsonb not null default '{}'::jsonb,
  fact_ids text[] not null default '{}',
  uncertain_fields text[] not null default '{}',
  expected_effects text[] not null default '{}',
  required_authorization jsonb not null default '[]'::jsonb check (jsonb_typeof(required_authorization) = 'array'),
  information_to_share text[] not null default '{}',
  idempotency_key text,
  version integer not null default 1 check (version > 0),
  expires_at timestamptz not null,
  confirmed_by_person_id uuid,
  confirmed_at timestamptz,
  rejected_at timestamptz,
  execution_started_at timestamptz,
  executed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_action_proposals_creator_tenant_fk foreign key (created_by_person_id, tenant_id)
    references public.persons(id, tenant_id),
  constraint ai_action_proposals_confirmer_tenant_fk foreign key (confirmed_by_person_id, tenant_id)
    references public.persons(id, tenant_id),
  constraint ai_action_proposals_expiry_check check (expires_at > created_at),
  constraint ai_action_proposals_required_auth_check check (
    required_authorization = app.ai_required_authorization(proposal_type)
  ),
  unique (tenant_id, created_by_person_id, idempotency_key)
);

create index ai_action_proposals_actor_status_idx
  on public.ai_action_proposals (tenant_id, created_by_person_id, status, created_at desc);

create trigger ai_action_proposals_set_updated_at
  before update on public.ai_action_proposals
  for each row execute function app.set_updated_at();

create or replace function app.validate_ai_action_proposal_transition()
returns trigger language plpgsql as $$
declare
  allowed boolean := false;
begin
  -- Proposal meaning is immutable after insertion. Lifecycle endpoints may
  -- change only state/execution metadata, never the action or its permissions.
  if row(
    new.tenant_id, new.created_by_person_id, new.subject_person_ids,
    new.proposal_type, new.proposed_data, new.fact_ids, new.uncertain_fields,
    new.expected_effects, new.required_authorization, new.information_to_share,
    new.idempotency_key, new.expires_at, new.created_at
  ) is distinct from row(
    old.tenant_id, old.created_by_person_id, old.subject_person_ids,
    old.proposal_type, old.proposed_data, old.fact_ids, old.uncertain_fields,
    old.expected_effects, old.required_authorization, old.information_to_share,
    old.idempotency_key, old.expires_at, old.created_at
  ) then
    raise exception 'AI proposal content and authorization are immutable';
  end if;
  if old.status = new.status then
    if not (
      old.status = 'CONFIRMED'
      and old.execution_started_at is null
      and new.execution_started_at is not null
      and new.version = old.version + 1
    ) then
      raise exception 'proposal update must change status';
    end if;
    return new;
  end if;
  allowed := case old.status
    when 'DRAFT' then new.status in ('READY_FOR_REVIEW','REJECTED','EXPIRED')
    when 'READY_FOR_REVIEW' then new.status in ('CONFIRMED','REJECTED','EXPIRED')
    when 'CONFIRMED' then new.status in ('EXECUTED','FAILED','EXPIRED')
    else false
  end;
  if not allowed then
    raise exception 'invalid AI proposal transition: % -> %', old.status, new.status;
  end if;
  if old.expires_at <= now() and new.status <> 'EXPIRED' then
    raise exception 'AI proposal is expired';
  end if;
  if new.version <> old.version + 1 then
    raise exception 'AI proposal version must increment exactly once';
  end if;
  if new.status = 'CONFIRMED' and (new.confirmed_by_person_id is null or new.confirmed_at is null) then
    raise exception 'confirmed proposal requires confirmer and timestamp';
  end if;
  return new;
end; $$;

create trigger ai_action_proposals_validate_transition
  before update on public.ai_action_proposals
  for each row execute function app.validate_ai_action_proposal_transition();

alter table public.ai_action_proposals enable row level security;
alter table public.ai_action_proposals force row level security;
create policy ai_action_proposals_select_authorized
  on public.ai_action_proposals for select to authenticated
  using (
    app.is_current_tenant(tenant_id)
    and created_by_person_id = app.person_id_in_tenant(tenant_id)
    and not exists (
      select 1 from unnest(subject_person_ids) as subjects(subject_id)
      where not app.has_domain_access(tenant_id, subjects.subject_id, 'AI', 'VIEW')
    )
  );
create policy ai_action_proposals_insert_authorized
  on public.ai_action_proposals for insert to authenticated
  with check (
    app.is_current_tenant(tenant_id)
    and created_by_person_id = app.person_id_in_tenant(tenant_id)
    and status in ('DRAFT','READY_FOR_REVIEW')
    and not exists (
      select 1 from unnest(subject_person_ids) as subjects(subject_id)
      where not app.has_domain_access(tenant_id, subjects.subject_id, 'AI', 'CREATE')
    )
  );
create policy ai_action_proposals_update_owner
  on public.ai_action_proposals for update to authenticated
  using (app.is_current_tenant(tenant_id) and created_by_person_id = app.person_id_in_tenant(tenant_id))
  with check (app.is_current_tenant(tenant_id) and created_by_person_id = app.person_id_in_tenant(tenant_id));
grant select, insert, update on public.ai_action_proposals to authenticated;
revoke delete on public.ai_action_proposals from authenticated;

-- P1 is still deterministic and opt-in: these rows are generated from
-- domain events/rules, deduplicated per actor, and contain no raw prompt.
create table public.ai_proactive_insights (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_person_id uuid not null,
  insight_type text not null check (insight_type in (
    'SCHEDULE_CONFLICT_DETECTED','RESPONSIBILITY_UNCONFIRMED','DOCUMENT_EXPIRING',
    'APPOINTMENT_UPCOMING','PREPARATION_INCOMPLETE','HANDOFF_UPCOMING',
    'MEDICATION_CONFIRMATION_MISSING','SCHOOL_NOTICE_PROCESSED','TASK_OVERDUE'
  )),
  severity text not null check (severity in ('INFO','ATTENTION','BLOCKING')),
  title text not null check (char_length(title) between 1 and 160),
  summary text not null check (char_length(summary) between 1 and 500),
  subject_person_ids uuid[] not null default '{}',
  source_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(source_refs) = 'array'),
  proposed_action_type text,
  proposed_data jsonb not null default '{}'::jsonb,
  rule_id text not null,
  dedupe_key text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ACKNOWLEDGED','DISMISSED','EXPIRED')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_proactive_insights_actor_tenant_fk foreign key (actor_person_id, tenant_id)
    references public.persons(id, tenant_id) on delete cascade,
  unique (tenant_id, actor_person_id, dedupe_key)
);

create trigger ai_proactive_insights_set_updated_at
  before update on public.ai_proactive_insights
  for each row execute function app.set_updated_at();
alter table public.ai_proactive_insights enable row level security;
alter table public.ai_proactive_insights force row level security;
create policy ai_proactive_insights_self
  on public.ai_proactive_insights for all to authenticated
  using (app.is_current_tenant(tenant_id) and actor_person_id = app.person_id_in_tenant(tenant_id))
  with check (app.is_current_tenant(tenant_id) and actor_person_id = app.person_id_in_tenant(tenant_id));
grant select, insert, update on public.ai_proactive_insights to authenticated;
revoke delete on public.ai_proactive_insights from authenticated;

-- Product metrics contain event metadata only. Content, questions, answers,
-- names and health details are intentionally absent from this schema.
create table public.ai_metrics_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_person_id uuid not null,
  metric_type text not null check (metric_type in (
    'SUGGESTION_DISPLAYED','SUGGESTION_ACCEPTED','SUGGESTION_REJECTED','ACTION_EXECUTED',
    'FALLBACK_USED','INSUFFICIENT_BASIS','AUTHORIZATION_DENIED','MEMORY_CREATED',
    'MEMORY_CORRECTED','MEMORY_REVOKED','MEMORY_USED','INSIGHT_DISPLAYED','FEEDBACK_RECORDED'
  )),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  dedupe_key text,
  occurred_at timestamptz not null default now(),
  constraint ai_metrics_events_actor_tenant_fk foreign key (actor_person_id, tenant_id)
    references public.persons(id, tenant_id) on delete cascade,
  unique (tenant_id, actor_person_id, metric_type, dedupe_key)
);

alter table public.ai_metrics_events enable row level security;
alter table public.ai_metrics_events force row level security;
create policy ai_metrics_events_insert_self
  on public.ai_metrics_events for insert to authenticated
  with check (app.is_current_tenant(tenant_id) and actor_person_id = app.person_id_in_tenant(tenant_id));
create policy ai_metrics_events_select_self_or_admin
  on public.ai_metrics_events for select to authenticated
  using (
    app.is_current_tenant(tenant_id)
    and (actor_person_id = app.person_id_in_tenant(tenant_id) or app.has_any_family_admin_role(tenant_id))
  );
grant select, insert on public.ai_metrics_events to authenticated;
revoke update, delete on public.ai_metrics_events from authenticated;
