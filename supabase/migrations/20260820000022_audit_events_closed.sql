-- ============================================================================
-- 0030: FASE 7 closing. audit_events' actor_person_id/subject_person_id
-- FKs get tenant-consistent composite FKs; SELECT tightened from
-- tenant-wide (anyone sees "who viewed the child's health record", itself
-- sensitive metadata) to actor-or-subject-or-admin; INSERT can no longer
-- forge actor_person_id as someone else; and a redaction backstop trigger
-- rejects known-sensitive keys (question/token/password/...) in `context`,
-- turning §76's "not something SQL can check" into "a defensible subset
-- of it now is".
-- ============================================================================

alter table public.audit_events
  drop constraint if exists audit_events_actor_person_id_fkey,
  drop constraint if exists audit_events_subject_person_id_fkey;
alter table public.audit_events
  add constraint audit_events_actor_person_id_fkey foreign key (actor_person_id, tenant_id) references public.persons (id, tenant_id),
  add constraint audit_events_subject_person_id_fkey foreign key (subject_person_id, tenant_id) references public.persons (id, tenant_id);

create index if not exists audit_events_actor_person_idx on public.audit_events (actor_person_id);

create or replace function app.validate_audit_event_context()
returns trigger language plpgsql as $$
declare
  v_forbidden text[] := array['question','raw_text','rawtext','prescription','password','token','access_token','refresh_token','ssn','cpf','card_number'];
  v_key text;
begin
  if new.context is not null then
    for v_key in select jsonb_object_keys(new.context) loop
      if lower(v_key) = any(v_forbidden) then
        raise exception 'audit_events.context must not contain the sensitive key "%": redact before logging', v_key;
      end if;
    end loop;
  end if;
  return new;
end; $$;
drop trigger if exists audit_events_validate_context on public.audit_events;
create trigger audit_events_validate_context before insert on public.audit_events
  for each row execute function app.validate_audit_event_context();

drop policy if exists audit_events_select_within_tenant on public.audit_events;
drop policy if exists audit_events_insert_within_tenant on public.audit_events;

create policy audit_events_select_relevant_or_admin
  on public.audit_events for select to authenticated
  using (app.is_current_tenant(tenant_id) and (
    app.has_any_family_admin_role(tenant_id) or app.person_id_in_tenant(tenant_id) in (actor_person_id, subject_person_id)
  ));

create policy audit_events_insert_as_self
  on public.audit_events for insert to authenticated
  with check (app.is_current_tenant(tenant_id) and (actor_person_id is null or actor_person_id = app.person_id_in_tenant(tenant_id)));

revoke update, delete on public.audit_events from authenticated;
grant select, insert on public.audit_events to authenticated;
