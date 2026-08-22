-- ZELII AI runtime hardening: privacy-preserving telemetry, atomic rate
-- limiting and lexical indexes used as the safe first stage of hybrid search.

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_person_id uuid not null,
  provider text not null,
  model text,
  prompt_version text not null,
  outcome text not null check (outcome in (
    'NOT_CALLED',
    'PROVIDER_SUCCESS',
    'DETERMINISTIC_FALLBACK',
    'UNSAFE_OUTPUT',
    'PROVIDER_ERROR'
  )),
  provider_status integer check (provider_status is null or provider_status between 100 and 599),
  latency_ms integer not null check (latency_ms >= 0),
  subject_count integer not null check (subject_count between 0 and 100),
  allowed_domains text[] not null default '{}',
  denied_domains text[] not null default '{}',
  source_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(source_refs) = 'array'),
  error_code text,
  created_at timestamptz not null default now(),
  constraint ai_runs_actor_tenant_fk
    foreign key (actor_person_id, tenant_id)
    references public.persons(id, tenant_id)
    on delete cascade
);

create index if not exists ai_runs_actor_created_idx
  on public.ai_runs (tenant_id, actor_person_id, created_at desc);

alter table public.ai_runs enable row level security;
alter table public.ai_runs force row level security;

drop policy if exists ai_runs_insert_self on public.ai_runs;
create policy ai_runs_insert_self on public.ai_runs
  for insert to authenticated
  with check (
    app.is_current_tenant(tenant_id)
    and actor_person_id = app.person_id_in_tenant(tenant_id)
  );

drop policy if exists ai_runs_select_self_or_admin on public.ai_runs;
create policy ai_runs_select_self_or_admin on public.ai_runs
  for select to authenticated
  using (
    app.is_current_tenant(tenant_id)
    and (
      actor_person_id = app.person_id_in_tenant(tenant_id)
      or app.has_any_family_admin_role(tenant_id)
    )
  );

revoke all on public.ai_runs from anon;
revoke update, delete, truncate on public.ai_runs from authenticated;
grant select, insert on public.ai_runs to authenticated;

-- Kept private behind a SECURITY DEFINER function so a client cannot reset or
-- edit its own counters. One bucket is shared by every API replica.
create table if not exists public.ai_rate_limit_buckets (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_person_id uuid not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, actor_person_id, window_started_at),
  constraint ai_rate_limit_actor_tenant_fk
    foreign key (actor_person_id, tenant_id)
    references public.persons(id, tenant_id)
    on delete cascade
);

alter table public.ai_rate_limit_buckets enable row level security;
alter table public.ai_rate_limit_buckets force row level security;
revoke all on public.ai_rate_limit_buckets from public, anon, authenticated;

create or replace function public.consume_ai_rate_limit(
  p_tenant_id uuid,
  p_limit integer default 20
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_person_id uuid;
  v_window_started_at timestamptz := date_trunc('minute', now());
  v_request_count integer;
  v_allowed boolean := true;
begin
  if p_limit < 1 or p_limit > 120 then
    raise exception 'invalid AI rate limit';
  end if;
  if not app.is_current_tenant(p_tenant_id) then
    raise exception 'tenant scope denied';
  end if;

  v_actor_person_id := app.person_id_in_tenant(p_tenant_id);
  if v_actor_person_id is null then
    raise exception 'actor is not linked to this tenant';
  end if;

  insert into public.ai_rate_limit_buckets (
    tenant_id, actor_person_id, window_started_at, request_count, updated_at
  ) values (
    p_tenant_id, v_actor_person_id, v_window_started_at, 1, now()
  )
  on conflict (tenant_id, actor_person_id, window_started_at)
  do update set
    request_count = public.ai_rate_limit_buckets.request_count + 1,
    updated_at = now()
  where public.ai_rate_limit_buckets.request_count < p_limit
  returning request_count into v_request_count;

  if v_request_count is null then
    v_allowed := false;
    select request_count into v_request_count
    from public.ai_rate_limit_buckets
    where tenant_id = p_tenant_id
      and actor_person_id = v_actor_person_id
      and window_started_at = v_window_started_at;
  end if;

  return query select
    v_allowed,
    greatest(p_limit - v_request_count, 0),
    v_window_started_at + interval '1 minute';
end;
$$;

revoke all on function public.consume_ai_rate_limit(uuid, integer) from public, anon;
grant execute on function public.consume_ai_rate_limit(uuid, integer) to authenticated;

-- Lexical side of hybrid retrieval. Vector similarity stays disabled until an
-- approved embedding provider, re-indexing policy and deletion propagation are
-- configured; these indexes already improve Portuguese document/notice lookup.
alter table public.capture_items
  add column if not exists search_vector tsvector
  generated always as (to_tsvector('portuguese', coalesce(raw_text, ''))) stored;

create index if not exists capture_items_search_vector_idx
  on public.capture_items using gin (search_vector);

alter table public.ai_memory_items
  add column if not exists search_vector tsvector
  generated always as (to_tsvector('portuguese', coalesce(summary, ''))) stored;

create index if not exists ai_memory_items_search_vector_idx
  on public.ai_memory_items using gin (search_vector);

comment on table public.ai_runs is
  'Metadata-only AI observability. Raw questions, prompts and answers are intentionally excluded.';
comment on function public.consume_ai_rate_limit(uuid, integer) is
  'Atomically consumes one per-user AI request slot in a one-minute database-backed bucket.';
