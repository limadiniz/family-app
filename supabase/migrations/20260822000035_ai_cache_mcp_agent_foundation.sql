-- ZELII AI Phases 2-4: governed response cache, MCP/tool telemetry and
-- supervised-agent telemetry. External connectors and autonomous writes stay
-- disabled by code-owned readiness gates.

alter table public.ai_runs drop constraint if exists ai_runs_outcome_check;
alter table public.ai_runs add constraint ai_runs_outcome_check check (outcome in (
  'NOT_CALLED', 'PROVIDER_SUCCESS', 'DETERMINISTIC_FALLBACK',
  'UNSAFE_OUTPUT', 'PROVIDER_ERROR', 'CACHE_HIT'
));

create table public.ai_response_cache (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_person_id uuid not null,
  exact_key text not null unique check (exact_key ~ '^[0-9a-f]{64}$'),
  question_hash text not null check (question_hash ~ '^[0-9a-f]{64}$'),
  policy_fingerprint text not null check (policy_fingerprint ~ '^[0-9a-f]{64}$'),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  subject_person_ids uuid[] not null,
  domains text[] not null,
  prompt_version text not null,
  model_version text not null,
  locale text not null default 'pt-BR',
  time_zone text not null default 'America/Sao_Paulo',
  response_payload jsonb not null check (jsonb_typeof(response_payload) = 'object'),
  source_refs jsonb not null check (jsonb_typeof(source_refs) = 'array'),
  query_embedding extensions.vector,
  embedding_model text,
  safety_classification text not null default 'STANDARD' check (safety_classification in ('STANDARD', 'REVIEWED')),
  hit_count bigint not null default 0 check (hit_count >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  invalidated_at timestamptz,
  constraint ai_response_cache_actor_tenant_fk
    foreign key (actor_person_id, tenant_id)
    references public.persons(id, tenant_id)
    on delete cascade,
  constraint ai_response_cache_expiry_check check (expires_at > created_at),
  constraint ai_response_cache_embedding_pair_check check (
    (query_embedding is null and embedding_model is null)
    or (query_embedding is not null and embedding_model is not null)
  )
);

create index ai_response_cache_exact_active_idx
  on public.ai_response_cache (tenant_id, actor_person_id, exact_key, expires_at)
  where invalidated_at is null;
create index ai_response_cache_semantic_scope_idx
  on public.ai_response_cache (
    tenant_id, actor_person_id, policy_fingerprint, source_fingerprint, embedding_model, expires_at
  ) where invalidated_at is null and query_embedding is not null;

alter table public.ai_response_cache enable row level security;
alter table public.ai_response_cache force row level security;
revoke all on public.ai_response_cache from public, anon, authenticated;
grant all on public.ai_response_cache to service_role;

create or replace function app.invalidate_ai_cache_for_source(p_source_type text, p_source_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.ai_response_cache
     set invalidated_at = now()
   where invalidated_at is null
     and source_refs @> jsonb_build_array(jsonb_build_object('type', p_source_type, 'id', p_source_id::text));
$$;
revoke all on function app.invalidate_ai_cache_for_source(text, uuid) from public, anon, authenticated;

create or replace function app.invalidate_capture_ai_cache()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.invalidate_ai_cache_for_source('capture_items', case when tg_op = 'DELETE' then old.id else new.id end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function app.invalidate_memory_ai_cache()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.invalidate_ai_cache_for_source('ai_memory_items', case when tg_op = 'DELETE' then old.id else new.id end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function app.invalidate_capture_ai_cache() from public, anon, authenticated;
revoke all on function app.invalidate_memory_ai_cache() from public, anon, authenticated;

drop trigger if exists capture_items_invalidate_ai_cache on public.capture_items;
create trigger capture_items_invalidate_ai_cache
  after insert or delete or update of raw_text, subject_person_id, category, status, deleted_at
  on public.capture_items
  for each row execute function app.invalidate_capture_ai_cache();

drop trigger if exists ai_memory_items_invalidate_ai_cache on public.ai_memory_items;
create trigger ai_memory_items_invalidate_ai_cache
  after insert or delete or update of summary, subject_person_id, domain, verification_status, valid_until, revoked_at
  on public.ai_memory_items
  for each row execute function app.invalidate_memory_ai_cache();

create or replace function public.match_ai_semantic_cache(
  p_tenant_id uuid,
  p_actor_person_id uuid,
  p_policy_fingerprint text,
  p_source_fingerprint text,
  p_domains text[],
  p_prompt_version text,
  p_model_version text,
  p_locale text,
  p_time_zone text,
  p_query_embedding text,
  p_embedding_model text,
  p_limit integer default 3
)
returns table (cache_id uuid, response_payload jsonb, distance double precision)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_query extensions.vector;
begin
  if p_limit < 1 or p_limit > 10 then raise exception 'invalid semantic cache limit'; end if;
  if auth.role() <> 'service_role' then raise exception 'semantic cache service role required'; end if;
  if not exists (
    select 1 from public.persons p
     where p.id = p_actor_person_id and p.tenant_id = p_tenant_id
  ) then raise exception 'semantic cache actor scope denied'; end if;
  v_query := p_query_embedding::extensions.vector;
  return query
  with scoped as materialized (
    select c.* from public.ai_response_cache c
     where c.tenant_id = p_tenant_id
       and c.actor_person_id = p_actor_person_id
       and c.policy_fingerprint = p_policy_fingerprint
       and c.source_fingerprint = p_source_fingerprint
       and c.domains = p_domains
       and c.prompt_version = p_prompt_version
       and c.model_version = p_model_version
       and c.locale = p_locale
       and c.time_zone = p_time_zone
       and c.embedding_model = p_embedding_model
       and c.invalidated_at is null
       and c.expires_at > now()
       and extensions.vector_dims(c.query_embedding) = extensions.vector_dims(v_query)
  )
  select s.id, s.response_payload,
         s.query_embedding OPERATOR(extensions.<=>) v_query
    from scoped s
   order by s.query_embedding OPERATOR(extensions.<=>) v_query
   limit p_limit;
end;
$$;
revoke all on function public.match_ai_semantic_cache(uuid, uuid, text, text, text[], text, text, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.match_ai_semantic_cache(uuid, uuid, text, text, text[], text, text, text, text, text, text, integer)
  to service_role;

create table public.ai_cache_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_person_id uuid not null,
  cache_type text not null check (cache_type in ('EXACT', 'SEMANTIC')),
  outcome text not null check (outcome in ('HIT', 'MISS', 'SKIPPED', 'REJECTED', 'STORED', 'INVALIDATED', 'ERROR')),
  reason_code text,
  latency_ms integer not null default 0 check (latency_ms >= 0),
  created_at timestamptz not null default now(),
  constraint ai_cache_events_actor_tenant_fk foreign key (actor_person_id, tenant_id)
    references public.persons(id, tenant_id) on delete cascade
);
alter table public.ai_cache_events enable row level security;
alter table public.ai_cache_events force row level security;
create policy ai_cache_events_insert_self on public.ai_cache_events for insert to authenticated
  with check (app.is_current_tenant(tenant_id) and actor_person_id = app.person_id_in_tenant(tenant_id));
create policy ai_cache_events_select_self_or_admin on public.ai_cache_events for select to authenticated
  using (app.is_current_tenant(tenant_id) and (
    actor_person_id = app.person_id_in_tenant(tenant_id) or app.has_any_family_admin_role(tenant_id)
  ));
revoke all on public.ai_cache_events from public, anon, authenticated;
grant select, insert on public.ai_cache_events to authenticated;
grant all on public.ai_cache_events to service_role;

create table public.ai_tool_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_person_id uuid not null,
  request_id text not null,
  tool_name text not null,
  connector_id text,
  risk text not null check (risk in ('READ_ONLY', 'REVERSIBLE_WRITE', 'SENSITIVE_WRITE')),
  execution_mode text not null check (execution_mode in ('READ', 'PROPOSAL_ONLY')),
  subject_count integer not null default 0 check (subject_count between 0 and 100),
  domains text[] not null default '{}',
  outcome text not null check (outcome in ('SUCCESS', 'DENIED', 'BLOCKED', 'ERROR')),
  latency_ms integer not null check (latency_ms >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  constraint ai_tool_runs_actor_tenant_fk foreign key (actor_person_id, tenant_id)
    references public.persons(id, tenant_id) on delete cascade
);
create index ai_tool_runs_actor_created_idx on public.ai_tool_runs (tenant_id, actor_person_id, created_at desc);
alter table public.ai_tool_runs enable row level security;
alter table public.ai_tool_runs force row level security;
create policy ai_tool_runs_insert_self on public.ai_tool_runs for insert to authenticated
  with check (app.is_current_tenant(tenant_id) and actor_person_id = app.person_id_in_tenant(tenant_id));
create policy ai_tool_runs_select_self_or_admin on public.ai_tool_runs for select to authenticated
  using (app.is_current_tenant(tenant_id) and (
    actor_person_id = app.person_id_in_tenant(tenant_id) or app.has_any_family_admin_role(tenant_id)
  ));
revoke all on public.ai_tool_runs from public, anon, authenticated;
grant select, insert on public.ai_tool_runs to authenticated;
grant all on public.ai_tool_runs to service_role;

create table public.ai_agent_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_person_id uuid not null,
  state text not null check (state in ('COMPLETED', 'WAITING_FOR_CONFIRMATION', 'STOPPED', 'ERROR')),
  stop_reason text,
  step_count integer not null check (step_count between 0 and 20),
  tool_call_count integer not null check (tool_call_count between 0 and 20),
  reflection_count integer not null check (reflection_count between 0 and 5),
  max_steps integer not null check (max_steps between 1 and 20),
  max_tool_calls integer not null check (max_tool_calls between 0 and 20),
  max_reflections integer not null check (max_reflections between 0 and 5),
  subject_count integer not null default 0 check (subject_count between 0 and 100),
  domains text[] not null default '{}',
  latency_ms integer not null check (latency_ms >= 0),
  created_at timestamptz not null default now(),
  constraint ai_agent_runs_actor_tenant_fk foreign key (actor_person_id, tenant_id)
    references public.persons(id, tenant_id) on delete cascade
);
create index ai_agent_runs_actor_created_idx on public.ai_agent_runs (tenant_id, actor_person_id, created_at desc);
alter table public.ai_agent_runs enable row level security;
alter table public.ai_agent_runs force row level security;
create policy ai_agent_runs_insert_self on public.ai_agent_runs for insert to authenticated
  with check (app.is_current_tenant(tenant_id) and actor_person_id = app.person_id_in_tenant(tenant_id));
create policy ai_agent_runs_select_self_or_admin on public.ai_agent_runs for select to authenticated
  using (app.is_current_tenant(tenant_id) and (
    actor_person_id = app.person_id_in_tenant(tenant_id) or app.has_any_family_admin_role(tenant_id)
  ));
revoke all on public.ai_agent_runs from public, anon, authenticated;
grant select, insert on public.ai_agent_runs to authenticated;
grant all on public.ai_agent_runs to service_role;

comment on table public.ai_response_cache is
  'Internal response cache scoped by actor, policy and source versions; never a source of truth.';
comment on table public.ai_tool_runs is
  'Metadata-only audit of governed tool and MCP calls; arguments and results are excluded.';
comment on table public.ai_agent_runs is
  'Metadata-only supervised agent state/budget telemetry; objectives and tool results are excluded.';
