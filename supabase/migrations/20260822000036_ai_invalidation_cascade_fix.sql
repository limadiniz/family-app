-- Do not enqueue derived-work rows while their tenant/person is being removed
-- by a parent cascade. PostgreSQL runs child DELETE triggers during the
-- cascade, when the referenced parent is no longer a valid FK target.

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
  v_subject_person_id uuid;
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

  update public.ai_content_chunks
     set deleted_at = now()
   where tenant_id = v_row.tenant_id
     and source_type = 'CAPTURE_ITEM'
     and source_id = v_row.id
     and deleted_at is null;

  if not exists (select 1 from public.tenants where id = v_row.tenant_id) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select id into v_subject_person_id
    from public.persons
   where id = v_row.subject_person_id and tenant_id = v_row.tenant_id;

  insert into public.ai_invalidation_events (
    tenant_id, subject_person_id, domain, source_type, source_id, source_version, event_type
  ) values (
    v_row.tenant_id, v_subject_person_id, v_domain,
    'CAPTURE_ITEM', v_row.id, v_version, v_event_type
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
  v_subject_person_id uuid;
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

  if not exists (select 1 from public.tenants where id = v_row.tenant_id) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select id into v_subject_person_id
    from public.persons
   where id = v_row.subject_person_id and tenant_id = v_row.tenant_id;

  insert into public.ai_invalidation_events (
    tenant_id, subject_person_id, domain, source_type, source_id, source_version, event_type
  ) values (
    v_row.tenant_id, v_subject_person_id, v_row.domain,
    'AI_MEMORY_ITEM', v_row.id, v_version, v_event_type
  ) on conflict do nothing;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function app.invalidate_capture_ai_content() from public, anon, authenticated;
revoke all on function app.invalidate_memory_ai_content() from public, anon, authenticated;

comment on function app.invalidate_capture_ai_content() is
  'Invalidates vector content and skips outbox insertion during tenant cascades.';
comment on function app.invalidate_memory_ai_content() is
  'Invalidates vector content and skips outbox insertion during tenant cascades.';
