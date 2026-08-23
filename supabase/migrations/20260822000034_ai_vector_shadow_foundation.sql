-- ZELII AI Phase 1: governed vector storage and transactional invalidation.
-- Vector results remain shadow-only until provider, privacy and safety gates
-- are explicitly approved in application code.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;
grant usage on schema extensions to authenticated, service_role;

-- A monotonically increasing source version is safer than timestamps: two
-- edits inside the same millisecond still produce distinct invalidations.
alter table public.capture_items
  add column if not exists ai_index_version bigint not null default 1 check (ai_index_version > 0);
alter table public.ai_memory_items
  add column if not exists ai_index_version bigint not null default 1 check (ai_index_version > 0);

create or replace function app.bump_ai_index_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.ai_index_version := old.ai_index_version + 1;
  return new;
end;
$$;

drop trigger if exists capture_items_bump_ai_index_version on public.capture_items;
create trigger capture_items_bump_ai_index_version
  before update of raw_text, subject_person_id, category, status, deleted_at
  on public.capture_items
  for each row execute function app.bump_ai_index_version();

drop trigger if exists ai_memory_items_bump_ai_index_version on public.ai_memory_items;
create trigger ai_memory_items_bump_ai_index_version
  before update of summary, subject_person_id, domain, verification_status, valid_until, revoked_at
  on public.ai_memory_items
  for each row execute function app.bump_ai_index_version();

create table public.ai_content_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subject_person_id uuid not null,
  domain text not null check (domain in (
    'PROFILE','SCHEDULE','HEALTH','MEDICATION','VACCINATION','SCHOOL','DOCUMENTS',
    'FINANCE','ACTIVITIES','TRANSPORTATION','CONTACTS','NOTES','LOCATION','EMERGENCY','AI','AUDIT'
  )),
  source_type text not null check (source_type in ('CAPTURE_ITEM', 'AI_MEMORY_ITEM', 'DOCUMENT_EXTRACTION')),
  source_id uuid not null,
  source_version bigint not null check (source_version > 0),
  chunk_index integer not null check (chunk_index >= 0),
  content_text text not null check (char_length(content_text) between 1 and 4000),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  embedding_provider text not null check (char_length(embedding_provider) between 1 and 100),
  embedding_model text not null check (char_length(embedding_model) between 1 and 200),
  embedding_dimensions integer not null check (embedding_dimensions between 1 and 4096),
  embedding extensions.vector not null,
  sensitivity text not null check (sensitivity in ('PERSONAL', 'SENSITIVE')),
  verification_status text not null check (verification_status in ('DECLARED', 'EXTRACTED', 'CONFIRMED')),
  indexed_at timestamptz not null default now(),
  deleted_at timestamptz,
  search_vector tsvector generated always as (
    to_tsvector('portuguese', coalesce(content_text, ''))
  ) stored,
  constraint ai_content_chunks_subject_tenant_fk
    foreign key (subject_person_id, tenant_id)
    references public.persons(id, tenant_id)
    on delete cascade,
  constraint ai_content_chunks_embedding_matches_vector_check
    check (extensions.vector_dims(embedding) = embedding_dimensions),
  constraint ai_content_chunks_source_version_unique
    unique (tenant_id, source_type, source_id, source_version, chunk_index, embedding_model)
);

create index ai_content_chunks_active_scope_idx
  on public.ai_content_chunks (tenant_id, subject_person_id, domain, embedding_model, source_type, source_id)
  where deleted_at is null;
create index ai_content_chunks_source_idx
  on public.ai_content_chunks (tenant_id, source_type, source_id, source_version desc);
create index ai_content_chunks_search_vector_idx
  on public.ai_content_chunks using gin (search_vector);

-- No approximate HNSW/IVFFlat index is created yet. The approved embedding
-- model fixes dimensions and recall targets; until then exact vector search
-- is safer for the small shadow corpus and provides the evaluation baseline.

alter table public.ai_content_chunks enable row level security;
alter table public.ai_content_chunks force row level security;

create policy ai_content_chunks_select_authorized
  on public.ai_content_chunks for select to authenticated
  using (
    deleted_at is null
    and app.is_current_tenant(tenant_id)
    and app.has_domain_access(tenant_id, subject_person_id, domain, 'VIEW')
  );

revoke all on public.ai_content_chunks from public, anon, authenticated;
grant select on public.ai_content_chunks to authenticated;
grant all on public.ai_content_chunks to service_role;

create table public.ai_invalidation_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subject_person_id uuid,
  domain text not null,
  source_type text not null check (source_type in ('CAPTURE_ITEM', 'AI_MEMORY_ITEM', 'DOCUMENT_EXTRACTION')),
  source_id uuid not null,
  source_version bigint not null check (source_version > 0),
  event_type text not null check (event_type in ('UPSERT', 'DELETE')),
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  attempts integer not null default 0 check (attempts between 0 and 20),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint ai_invalidation_events_subject_tenant_fk
    foreign key (subject_person_id, tenant_id)
    references public.persons(id, tenant_id)
    on delete cascade,
  constraint ai_invalidation_events_dedup_unique
    unique (tenant_id, source_type, source_id, source_version, event_type)
);

create index ai_invalidation_events_pending_idx
  on public.ai_invalidation_events (available_at, created_at)
  where status in ('PENDING', 'FAILED');

alter table public.ai_invalidation_events enable row level security;
alter table public.ai_invalidation_events force row level security;
revoke all on public.ai_invalidation_events from public, anon, authenticated;
grant all on public.ai_invalidation_events to service_role;

create or replace function app.capture_domain_for_vector(p_category text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_category like 'SCHOOL_%' then 'SCHOOL'
    when p_category like 'MEDICAL_%' then 'HEALTH'
    when p_category = 'DOCUMENT' then 'DOCUMENTS'
    when p_category = 'ACTIVITY' then 'ACTIVITIES'
    when p_category = 'PAYMENT' then 'FINANCE'
    when p_category = 'TRANSPORTATION' then 'TRANSPORTATION'
    else 'NOTES'
  end;
$$;

create or replace function app.invalidate_capture_ai_content()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.capture_items;
  v_version bigint;
  v_event_type text;
  v_domain text;
begin
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;
  v_version := case when tg_op = 'DELETE' then old.ai_index_version + 1 else new.ai_index_version end;
  v_domain := app.capture_domain_for_vector(v_row.category);
  v_event_type := case
    when tg_op = 'DELETE' then 'DELETE'
    when new.deleted_at is not null then 'DELETE'
    when new.subject_person_id is null then 'DELETE'
    when nullif(btrim(new.raw_text), '') is null then 'DELETE'
    when new.status not in ('READY', 'CONFIRMED') then 'DELETE'
    else 'UPSERT'
  end;

  -- Immediate invalidation is in the source transaction. The async worker
  -- can fail safely without leaving an old chunk searchable.
  update public.ai_content_chunks
     set deleted_at = now()
   where tenant_id = v_row.tenant_id
     and source_type = 'CAPTURE_ITEM'
     and source_id = v_row.id
     and deleted_at is null;

  insert into public.ai_invalidation_events (
    tenant_id, subject_person_id, domain, source_type, source_id, source_version, event_type
  ) values (
    v_row.tenant_id, v_row.subject_person_id, v_domain, 'CAPTURE_ITEM', v_row.id, v_version, v_event_type
  ) on conflict do nothing;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function app.invalidate_memory_ai_content()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.ai_memory_items;
  v_version bigint;
  v_event_type text;
begin
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;
  v_version := case when tg_op = 'DELETE' then old.ai_index_version + 1 else new.ai_index_version end;
  v_event_type := case
    when tg_op = 'DELETE' then 'DELETE'
    when new.revoked_at is not null then 'DELETE'
    when new.verification_status <> 'CONFIRMED' then 'DELETE'
    when nullif(btrim(new.summary), '') is null then 'DELETE'
    else 'UPSERT'
  end;

  update public.ai_content_chunks
     set deleted_at = now()
   where tenant_id = v_row.tenant_id
     and source_type = 'AI_MEMORY_ITEM'
     and source_id = v_row.id
     and deleted_at is null;

  insert into public.ai_invalidation_events (
    tenant_id, subject_person_id, domain, source_type, source_id, source_version, event_type
  ) values (
    v_row.tenant_id, v_row.subject_person_id, v_row.domain, 'AI_MEMORY_ITEM', v_row.id, v_version, v_event_type
  ) on conflict do nothing;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function app.invalidate_capture_ai_content() from public, anon, authenticated;
revoke all on function app.invalidate_memory_ai_content() from public, anon, authenticated;

drop trigger if exists capture_items_invalidate_ai_content on public.capture_items;
create trigger capture_items_invalidate_ai_content
  after insert or delete or update of raw_text, subject_person_id, category, status, deleted_at
  on public.capture_items
  for each row execute function app.invalidate_capture_ai_content();

drop trigger if exists ai_memory_items_invalidate_ai_content on public.ai_memory_items;
create trigger ai_memory_items_invalidate_ai_content
  after insert or delete or update of summary, subject_person_id, domain, verification_status, valid_until, revoked_at
  on public.ai_memory_items
  for each row execute function app.invalidate_memory_ai_content();

-- Backfill only queues source identities. No content or embedding leaves the
-- database until an approved worker/provider is configured.
insert into public.ai_invalidation_events (
  tenant_id, subject_person_id, domain, source_type, source_id, source_version, event_type
)
select tenant_id, subject_person_id, app.capture_domain_for_vector(category),
       'CAPTURE_ITEM', id, ai_index_version, 'UPSERT'
  from public.capture_items
 where deleted_at is null
   and subject_person_id is not null
   and nullif(btrim(raw_text), '') is not null
   and status in ('READY', 'CONFIRMED')
on conflict do nothing;

insert into public.ai_invalidation_events (
  tenant_id, subject_person_id, domain, source_type, source_id, source_version, event_type
)
select tenant_id, subject_person_id, domain,
       'AI_MEMORY_ITEM', id, ai_index_version, 'UPSERT'
  from public.ai_memory_items
 where revoked_at is null
   and verification_status = 'CONFIRMED'
on conflict do nothing;

create or replace function public.claim_ai_invalidation_events(
  p_worker_id text,
  p_limit integer default 20
)
returns setof public.ai_invalidation_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if nullif(btrim(p_worker_id), '') is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid invalidation claim arguments';
  end if;

  return query
  with claimed as (
    select id
      from public.ai_invalidation_events
     where status in ('PENDING', 'FAILED')
       and attempts < 20
       and available_at <= now()
     order by available_at, created_at
     for update skip locked
     limit p_limit
  )
  update public.ai_invalidation_events e
     set status = 'PROCESSING',
         attempts = attempts + 1,
         locked_at = now(),
         locked_by = p_worker_id,
         last_error_code = null
    from claimed
   where e.id = claimed.id
  returning e.*;
end;
$$;

create or replace function public.complete_ai_invalidation_event(
  p_event_id uuid,
  p_worker_id text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.ai_invalidation_events
     set status = 'COMPLETED', completed_at = now(), locked_at = null, locked_by = null
   where id = p_event_id and status = 'PROCESSING' and locked_by = p_worker_id;
  if not found then raise exception 'invalidation event is not owned by worker'; end if;
end;
$$;

create or replace function public.fail_ai_invalidation_event(
  p_event_id uuid,
  p_worker_id text,
  p_error_code text,
  p_retry_seconds integer default 60
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.ai_invalidation_events
     set status = 'FAILED',
         available_at = now() + make_interval(secs => greatest(1, least(p_retry_seconds, 86400))),
         last_error_code = left(coalesce(p_error_code, 'UNKNOWN'), 120),
         locked_at = null,
         locked_by = null
   where id = p_event_id and status = 'PROCESSING' and locked_by = p_worker_id;
  if not found then raise exception 'invalidation event is not owned by worker'; end if;
end;
$$;

revoke all on function public.claim_ai_invalidation_events(text, integer) from public, anon, authenticated;
revoke all on function public.complete_ai_invalidation_event(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_ai_invalidation_event(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.claim_ai_invalidation_events(text, integer) to service_role;
grant execute on function public.complete_ai_invalidation_event(uuid, text) to service_role;
grant execute on function public.fail_ai_invalidation_event(uuid, text, text, integer) to service_role;

create or replace function public.replace_ai_content_chunks(
  p_event_id uuid,
  p_worker_id text,
  p_embedding_provider text,
  p_embedding_model text,
  p_embedding_dimensions integer,
  p_sensitivity text,
  p_verification_status text,
  p_chunks jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.ai_invalidation_events;
  v_chunk jsonb;
begin
  if jsonb_typeof(p_chunks) <> 'array' or jsonb_array_length(p_chunks) > 100 then
    raise exception 'invalid vector chunks payload';
  end if;

  select * into v_event
    from public.ai_invalidation_events
   where id = p_event_id and status = 'PROCESSING' and locked_by = p_worker_id
   for update;
  if not found then raise exception 'invalidation event is not owned by worker'; end if;
  if v_event.event_type <> 'UPSERT' or v_event.subject_person_id is null then
    raise exception 'invalidation event is not indexable';
  end if;

  -- Revalidate the source version inside the same transaction that writes the
  -- chunks. A source may change while the external embedding call is running;
  -- a stale worker must never reintroduce content invalidated by a newer edit.
  if v_event.source_type = 'CAPTURE_ITEM' and not exists (
    select 1 from public.capture_items c
     where c.id = v_event.source_id
       and c.tenant_id = v_event.tenant_id
       and c.subject_person_id = v_event.subject_person_id
       and c.ai_index_version = v_event.source_version
       and c.deleted_at is null
       and c.status in ('READY', 'CONFIRMED')
       and nullif(btrim(c.raw_text), '') is not null
  ) then
    return;
  elsif v_event.source_type = 'AI_MEMORY_ITEM' and not exists (
    select 1 from public.ai_memory_items m
     where m.id = v_event.source_id
       and m.tenant_id = v_event.tenant_id
       and m.subject_person_id = v_event.subject_person_id
       and m.domain = v_event.domain
       and m.ai_index_version = v_event.source_version
       and m.revoked_at is null
       and m.verification_status = 'CONFIRMED'
  ) then
    return;
  elsif v_event.source_type = 'DOCUMENT_EXTRACTION' then
    return;
  end if;

  update public.ai_content_chunks
     set deleted_at = now()
   where tenant_id = v_event.tenant_id
     and source_type = v_event.source_type
     and source_id = v_event.source_id
     and deleted_at is null;

  for v_chunk in select value from jsonb_array_elements(p_chunks)
  loop
    insert into public.ai_content_chunks (
      tenant_id, subject_person_id, domain, source_type, source_id, source_version,
      chunk_index, content_text, content_hash, embedding_provider, embedding_model,
      embedding_dimensions, embedding, sensitivity, verification_status
    ) values (
      v_event.tenant_id, v_event.subject_person_id, v_event.domain,
      v_event.source_type, v_event.source_id, v_event.source_version,
      (v_chunk->>'chunkIndex')::integer,
      v_chunk->>'contentText',
      v_chunk->>'contentHash',
      p_embedding_provider,
      p_embedding_model,
      p_embedding_dimensions,
      (v_chunk->'embedding')::text::extensions.vector,
      p_sensitivity,
      p_verification_status
    )
    on conflict (tenant_id, source_type, source_id, source_version, chunk_index, embedding_model)
    do update set
      content_text = excluded.content_text,
      content_hash = excluded.content_hash,
      embedding_provider = excluded.embedding_provider,
      embedding_dimensions = excluded.embedding_dimensions,
      embedding = excluded.embedding,
      sensitivity = excluded.sensitivity,
      verification_status = excluded.verification_status,
      indexed_at = now(),
      deleted_at = null;
  end loop;
end;
$$;

revoke all on function public.replace_ai_content_chunks(uuid, text, text, text, integer, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_ai_content_chunks(uuid, text, text, text, integer, text, text, jsonb)
  to service_role;

create or replace function public.match_ai_content_chunks(
  p_tenant_id uuid,
  p_subject_person_ids uuid[],
  p_domains text[],
  p_query_embedding text,
  p_embedding_model text,
  p_limit integer default 20
)
returns table (
  chunk_id uuid,
  subject_person_id uuid,
  domain text,
  source_type text,
  source_id uuid,
  source_version bigint,
  chunk_index integer,
  content_text text,
  similarity double precision
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_query extensions.vector;
begin
  if not app.is_current_tenant(p_tenant_id) then raise exception 'tenant scope denied'; end if;
  if p_limit < 1 or p_limit > 50 then raise exception 'invalid vector result limit'; end if;
  v_query := p_query_embedding::extensions.vector;

  return query
  with scoped as materialized (
    select c.*
      from public.ai_content_chunks c
     where c.tenant_id = p_tenant_id
       and c.subject_person_id = any(p_subject_person_ids)
       and c.domain = any(p_domains)
       and c.embedding_model = p_embedding_model
       and c.embedding_dimensions = extensions.vector_dims(v_query)
       and c.deleted_at is null
  )
  select s.id, s.subject_person_id, s.domain, s.source_type, s.source_id,
         s.source_version, s.chunk_index, s.content_text,
         1 - (s.embedding OPERATOR(extensions.<=>) v_query) as similarity
    from scoped s
   order by s.embedding OPERATOR(extensions.<=>) v_query
   limit p_limit;
end;
$$;

revoke all on function public.match_ai_content_chunks(uuid, uuid[], text[], text, text, integer)
  from public, anon;
grant execute on function public.match_ai_content_chunks(uuid, uuid[], text[], text, text, integer)
  to authenticated;

create table public.ai_retrieval_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_person_id uuid not null,
  mode text not null check (mode in ('LEXICAL', 'VECTOR_SHADOW', 'HYBRID_SHADOW')),
  embedding_model text,
  lexical_candidate_count integer not null default 0 check (lexical_candidate_count >= 0),
  vector_candidate_count integer not null default 0 check (vector_candidate_count >= 0),
  overlap_count integer not null default 0 check (overlap_count >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  outcome text not null check (outcome in ('SUCCESS', 'SKIPPED', 'ERROR')),
  error_code text,
  created_at timestamptz not null default now(),
  constraint ai_retrieval_runs_actor_tenant_fk
    foreign key (actor_person_id, tenant_id)
    references public.persons(id, tenant_id)
    on delete cascade
);

create index ai_retrieval_runs_actor_created_idx
  on public.ai_retrieval_runs (tenant_id, actor_person_id, created_at desc);

alter table public.ai_retrieval_runs enable row level security;
alter table public.ai_retrieval_runs force row level security;
create policy ai_retrieval_runs_insert_self on public.ai_retrieval_runs
  for insert to authenticated
  with check (
    app.is_current_tenant(tenant_id)
    and actor_person_id = app.person_id_in_tenant(tenant_id)
  );
create policy ai_retrieval_runs_select_self_or_admin on public.ai_retrieval_runs
  for select to authenticated
  using (
    app.is_current_tenant(tenant_id)
    and (
      actor_person_id = app.person_id_in_tenant(tenant_id)
      or app.has_any_family_admin_role(tenant_id)
    )
  );
revoke all on public.ai_retrieval_runs from public, anon, authenticated;
grant select, insert on public.ai_retrieval_runs to authenticated;
grant all on public.ai_retrieval_runs to service_role;

comment on table public.ai_content_chunks is
  'Authorized, versioned chunks for exact vector evaluation and future hybrid retrieval.';
comment on table public.ai_invalidation_events is
  'Transactional outbox; source triggers invalidate old chunks synchronously and enqueue idempotent rebuilds.';
comment on table public.ai_retrieval_runs is
  'Metadata-only lexical/vector shadow telemetry. Raw questions and content are excluded.';
