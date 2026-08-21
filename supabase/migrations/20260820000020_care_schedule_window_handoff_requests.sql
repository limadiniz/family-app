-- ============================================================================
-- 0028: FASE 5 closing. Headline finding: care_windows is what the Policy
-- Engine reads directly for the CareWindow ABAC baseline — its old blanket
-- `for all` let any tenant member self-insert an ACTIVE window over any
-- child and grant themselves HEALTH/MEDICATION/EMERGENCY access with zero
-- Handoff, zero ResponsibilityAssignment. Closed with a trigger that only
-- allows SCHEDULED -> ACTIVE when a COMPLETED handoff already references
-- the window — moving that rule from an apps/api convention into a real
-- DB-enforced invariant.
-- ============================================================================

-- ---------------------------------------------------------------- care_schedules

alter table public.care_schedules add constraint care_schedules_id_tenant_uk unique (id, tenant_id);
alter table public.care_schedules
  drop constraint if exists care_schedules_child_person_id_fkey,
  drop constraint if exists care_schedules_caregiver_person_id_fkey,
  drop constraint if exists care_schedules_residence_id_fkey;
alter table public.care_schedules
  add constraint care_schedules_child_person_id_fkey foreign key (child_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade,
  add constraint care_schedules_caregiver_person_id_fkey foreign key (caregiver_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade,
  add constraint care_schedules_residence_id_fkey foreign key (residence_id, tenant_id) references public.residences (id, tenant_id) on delete set null;

drop policy if exists care_schedules_rw_within_tenant on public.care_schedules;
create policy care_schedules_select_participant_or_admin on public.care_schedules for select to authenticated
  using (app.is_current_tenant(tenant_id) and (app.person_id_in_tenant(tenant_id) = caregiver_person_id or app.has_any_family_admin_role(tenant_id)));
create policy care_schedules_admin_insert on public.care_schedules for insert to authenticated
  with check (app.is_current_tenant(tenant_id) and app.has_any_family_admin_role(tenant_id));
create policy care_schedules_admin_update on public.care_schedules for update to authenticated
  using (app.is_current_tenant(tenant_id) and app.has_any_family_admin_role(tenant_id))
  with check (app.is_current_tenant(tenant_id));

-- ---------------------------------------------------------------- care_windows

alter table public.care_windows
  drop constraint if exists care_windows_child_person_id_fkey,
  drop constraint if exists care_windows_caregiver_person_id_fkey,
  drop constraint if exists care_windows_care_schedule_id_fkey,
  drop constraint if exists care_windows_residence_id_fkey;
alter table public.care_windows
  add constraint care_windows_child_person_id_fkey foreign key (child_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade,
  add constraint care_windows_caregiver_person_id_fkey foreign key (caregiver_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade,
  add constraint care_windows_care_schedule_id_fkey foreign key (care_schedule_id, tenant_id) references public.care_schedules (id, tenant_id) on delete set null,
  add constraint care_windows_residence_id_fkey foreign key (residence_id, tenant_id) references public.residences (id, tenant_id) on delete set null;

create or replace function app.validate_care_window_transition()
returns trigger language plpgsql as $$
declare v_allowed text[];
begin
  if new.status = old.status then return new; end if;
  v_allowed := case old.status
    when 'SCHEDULED' then array['ACTIVE','CANCELLED']
    when 'ACTIVE' then array['COMPLETED','CANCELLED']
    else array[]::text[] end;
  if not (new.status = any(v_allowed)) then
    raise exception 'invalid care_window transition: % -> %', old.status, new.status;
  end if;
  if new.status = 'ACTIVE' and not exists (
    select 1 from public.handoffs h where h.care_window_id = new.id and h.status = 'COMPLETED'
  ) then
    raise exception 'a care_window may only become ACTIVE via a COMPLETED handoff linked to it';
  end if;
  return new;
end; $$;
drop trigger if exists care_windows_validate_transition on public.care_windows;
create trigger care_windows_validate_transition
  before update of status on public.care_windows
  for each row execute function app.validate_care_window_transition();

create or replace function app.protect_care_window_immutable_fields()
returns trigger language plpgsql as $$
begin
  if new.tenant_id <> old.tenant_id or new.child_person_id <> old.child_person_id
     or new.caregiver_person_id <> old.caregiver_person_id
     or new.care_schedule_id is distinct from old.care_schedule_id
     or new.starts_at <> old.starts_at or new.ends_at <> old.ends_at
  then raise exception 'core fields of a care_window are immutable; cancel and create a new one';
  end if;
  return new;
end; $$;
drop trigger if exists care_windows_protect_immutable on public.care_windows;
create trigger care_windows_protect_immutable
  before update on public.care_windows
  for each row execute function app.protect_care_window_immutable_fields();

drop policy if exists care_windows_rw_within_tenant on public.care_windows;
create policy care_windows_select_participant_or_admin on public.care_windows for select to authenticated
  using (app.is_current_tenant(tenant_id) and (app.person_id_in_tenant(tenant_id) = caregiver_person_id or app.has_any_family_admin_role(tenant_id)));
create policy care_windows_insert_admin_only on public.care_windows for insert to authenticated
  with check (app.is_current_tenant(tenant_id) and status = 'SCHEDULED' and app.has_any_family_admin_role(tenant_id));
create policy care_windows_update_participant_or_admin on public.care_windows for update to authenticated
  using (app.is_current_tenant(tenant_id) and (app.person_id_in_tenant(tenant_id) = caregiver_person_id or app.has_any_family_admin_role(tenant_id)))
  with check (app.is_current_tenant(tenant_id));

-- ---------------------------------------------------------------- handoffs

alter table public.handoffs
  drop constraint if exists handoffs_child_person_id_fkey,
  drop constraint if exists handoffs_from_person_id_fkey,
  drop constraint if exists handoffs_to_person_id_fkey,
  drop constraint if exists handoffs_care_window_id_fkey,
  drop constraint if exists handoffs_location_residence_id_fkey;
alter table public.handoffs
  add constraint handoffs_child_person_id_fkey foreign key (child_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade,
  add constraint handoffs_from_person_id_fkey foreign key (from_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade,
  add constraint handoffs_to_person_id_fkey foreign key (to_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade,
  add constraint handoffs_care_window_id_fkey foreign key (care_window_id, tenant_id) references public.care_windows (id, tenant_id) on delete set null,
  add constraint handoffs_location_residence_id_fkey foreign key (location_residence_id, tenant_id) references public.residences (id, tenant_id) on delete set null;

create index if not exists handoffs_care_window_idx on public.handoffs (care_window_id);

create or replace function app.validate_handoff_transition()
returns trigger language plpgsql as $$
declare v_allowed text[];
begin
  if new.status = old.status then return new; end if;
  v_allowed := case old.status
    when 'EXPECTED' then array['CONFIRMED','DELAYED','CANCELLED','DISPUTED']
    when 'CONFIRMED' then array['COMPLETED','DELAYED','CANCELLED','DISPUTED']
    when 'DELAYED' then array['CONFIRMED','COMPLETED','CANCELLED','DISPUTED']
    when 'DISPUTED' then array['CONFIRMED','CANCELLED']
    else array[]::text[] end;
  if not (new.status = any(v_allowed)) then
    raise exception 'invalid handoff transition: % -> %', old.status, new.status;
  end if;
  return new;
end; $$;
drop trigger if exists handoffs_validate_transition on public.handoffs;
create trigger handoffs_validate_transition
  before update of status on public.handoffs
  for each row execute function app.validate_handoff_transition();

drop policy if exists handoffs_rw_within_tenant on public.handoffs;
create policy handoffs_select_participant_or_admin on public.handoffs for select to authenticated
  using (app.is_current_tenant(tenant_id) and (app.person_id_in_tenant(tenant_id) in (from_person_id, to_person_id) or app.has_any_family_admin_role(tenant_id)));
create policy handoffs_insert_admin_only on public.handoffs for insert to authenticated
  with check (app.is_current_tenant(tenant_id) and status = 'EXPECTED' and app.has_any_family_admin_role(tenant_id));
create policy handoffs_update_participant on public.handoffs for update to authenticated
  using (app.is_current_tenant(tenant_id) and app.person_id_in_tenant(tenant_id) in (from_person_id, to_person_id))
  with check (app.is_current_tenant(tenant_id));

-- ---------------------------------------------------------------- requests / request_actions

alter table public.requests add constraint requests_id_tenant_uk unique (id, tenant_id);
alter table public.requests
  drop constraint if exists requests_requested_by_person_id_fkey,
  drop constraint if exists requests_requested_to_person_id_fkey,
  drop constraint if exists requests_subject_person_id_fkey;
alter table public.requests
  add constraint requests_requested_by_person_id_fkey foreign key (requested_by_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade,
  add constraint requests_requested_to_person_id_fkey foreign key (requested_to_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade,
  add constraint requests_subject_person_id_fkey foreign key (subject_person_id, tenant_id) references public.persons (id, tenant_id) on delete set null;

create or replace function app.validate_request_transition()
returns trigger language plpgsql as $$
declare v_allowed text[]; v_actor uuid := app.person_id_in_tenant(new.tenant_id);
begin
  if new.status = old.status then return new; end if;
  v_allowed := case old.status
    when 'DRAFT' then array['SENT','CANCELLED']
    when 'SENT' then array['VIEWED','ACCEPTED','DECLINED','CANCELLED','EXPIRED']
    when 'VIEWED' then array['ACCEPTED','DECLINED','CANCELLED','EXPIRED','DISPUTED']
    when 'ACCEPTED' then array['COMPLETED','DISPUTED']
    when 'DECLINED' then array['DISPUTED']
    when 'DISPUTED' then array['ACCEPTED','DECLINED','CANCELLED']
    else array[]::text[] end;
  if not (new.status = any(v_allowed)) then
    raise exception 'invalid request transition: % -> %', old.status, new.status;
  end if;
  if new.status in ('VIEWED','ACCEPTED','DECLINED') and v_actor <> old.requested_to_person_id then
    raise exception 'only the request recipient may transition to %', new.status;
  end if;
  if new.status = 'CANCELLED' and v_actor <> old.requested_by_person_id and not app.has_any_family_admin_role(new.tenant_id) then
    raise exception 'only the requester (or a family admin) may cancel a request';
  end if;
  return new;
end; $$;
drop trigger if exists requests_validate_transition on public.requests;
create trigger requests_validate_transition
  before update of status on public.requests
  for each row execute function app.validate_request_transition();

create or replace function app.protect_request_immutable_fields()
returns trigger language plpgsql as $$
begin
  if new.tenant_id <> old.tenant_id or new.type <> old.type
     or new.requested_by_person_id <> old.requested_by_person_id
     or new.requested_to_person_id <> old.requested_to_person_id
     or new.subject_person_id is distinct from old.subject_person_id
  then raise exception 'core fields of a request are immutable after creation'; end if;
  if old.status <> 'DRAFT' and new.payload is distinct from old.payload then
    raise exception 'request payload can only be edited while still DRAFT';
  end if;
  return new;
end; $$;
drop trigger if exists requests_protect_immutable on public.requests;
create trigger requests_protect_immutable
  before update on public.requests
  for each row execute function app.protect_request_immutable_fields();

drop policy if exists requests_rw_within_tenant on public.requests;
create policy requests_select_participant_or_admin on public.requests for select to authenticated
  using (app.is_current_tenant(tenant_id) and (app.person_id_in_tenant(tenant_id) in (requested_by_person_id, requested_to_person_id) or app.has_any_family_admin_role(tenant_id)));
create policy requests_insert_as_requester on public.requests for insert to authenticated
  with check (app.is_current_tenant(tenant_id) and status = 'DRAFT' and requested_by_person_id = app.person_id_in_tenant(tenant_id));
create policy requests_update_participant on public.requests for update to authenticated
  using (app.is_current_tenant(tenant_id) and app.person_id_in_tenant(tenant_id) in (requested_by_person_id, requested_to_person_id))
  with check (app.is_current_tenant(tenant_id));

alter table public.request_actions
  drop constraint if exists request_actions_request_id_fkey,
  drop constraint if exists request_actions_actor_person_id_fkey;
alter table public.request_actions
  add constraint request_actions_request_id_fkey foreign key (request_id, tenant_id) references public.requests (id, tenant_id) on delete cascade,
  add constraint request_actions_actor_person_id_fkey foreign key (actor_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade;

drop policy if exists request_actions_insert_within_tenant on public.request_actions;
create policy request_actions_insert_as_actor on public.request_actions for insert to authenticated
  with check (app.is_current_tenant(tenant_id) and actor_person_id = app.person_id_in_tenant(tenant_id));
-- request_actions_select_within_tenant already exists from the original migration and stays as-is
-- (it already used tenant_id = app.current_tenant_id(); replaced below for consistency).
drop policy if exists request_actions_select_within_tenant on public.request_actions;
create policy request_actions_select_within_tenant on public.request_actions for select to authenticated
  using (app.is_current_tenant(tenant_id));

-- Closes the FK-composite debt from responsibility_assignments.request_id
-- noted back when authority/responsibility was closed, now that requests
-- itself has unique(id, tenant_id).
alter table public.responsibility_assignments drop constraint if exists responsibility_assignments_request_id_fkey;
alter table public.responsibility_assignments
  add constraint responsibility_assignments_request_id_fkey
  foreign key (request_id, tenant_id) references public.requests (id, tenant_id) on delete set null;
