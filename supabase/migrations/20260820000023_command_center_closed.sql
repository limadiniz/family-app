-- ============================================================================
-- 0031: FASE 8 closing — the tables that existed before this design round
-- (calendar_events, tasks, routines, routine_items, checklists,
-- checklist_items), all previously only tenant-walled. calendar_events and
-- routines carry a `category` that can be as sensitive as anything closed
-- in FASE 6 (HEALTH/MEDICATION-adjacent) alongside completely mundane
-- entries (SPORT/FAMILY) — mapped to app.has_domain_access via a small
-- lookup function instead of a blanket rule for the whole table.
-- tasks/checklists had no created_by_person_id at all, so no real
-- "participant" scoping was even expressible; added here.
-- ============================================================================

create or replace function app.calendar_event_domain(p_category text) returns text
language sql immutable as $$
  select case p_category
    when 'HEALTH' then 'HEALTH' when 'MEDICATION' then 'MEDICATION'
    when 'FINANCE' then 'FINANCE' when 'SCHOOL' then 'SCHOOL' when 'DOCUMENT' then 'DOCUMENTS'
    else 'SCHEDULE' end;
$$;

create or replace function app.routine_domain(p_category text) returns text
language sql immutable as $$ select case p_category when 'HEALTH' then 'HEALTH' when 'SCHOOL' then 'SCHOOL' else 'SCHEDULE' end; $$;

-- ---------------------------------------------------------------- calendar_events

alter table public.calendar_events add constraint calendar_events_id_tenant_uk unique (id, tenant_id);
alter table public.calendar_events
  drop constraint if exists calendar_events_subject_person_id_fkey,
  drop constraint if exists calendar_events_residence_id_fkey,
  drop constraint if exists calendar_events_responsible_person_id_fkey,
  drop constraint if exists calendar_events_transportation_person_id_fkey;
alter table public.calendar_events
  add constraint calendar_events_subject_person_id_fkey foreign key (subject_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade,
  add constraint calendar_events_residence_id_fkey foreign key (residence_id, tenant_id) references public.residences (id, tenant_id) on delete set null,
  add constraint calendar_events_responsible_person_id_fkey foreign key (responsible_person_id, tenant_id) references public.persons (id, tenant_id) on delete set null,
  add constraint calendar_events_transportation_person_id_fkey foreign key (transportation_person_id, tenant_id) references public.persons (id, tenant_id) on delete set null;

drop policy if exists calendar_events_rw_within_tenant on public.calendar_events;
create policy calendar_events_access on public.calendar_events for all to authenticated
  using (app.is_current_tenant(tenant_id) and app.has_domain_access(tenant_id, subject_person_id, app.calendar_event_domain(category), 'VIEW'))
  with check (app.is_current_tenant(tenant_id) and app.has_domain_access(tenant_id, subject_person_id, app.calendar_event_domain(category), 'EDIT'));

-- ---------------------------------------------------------------- tasks / checklists (+ created_by_person_id)

alter table public.tasks add column if not exists created_by_person_id uuid;
update public.tasks set created_by_person_id = coalesce(responsible_person_id, alternate_responsible_person_id, subject_person_id)
  where created_by_person_id is null;
-- Fallback for any row where none of those were set either (shouldn't
-- happen with seed data, but a migration must not leave a NOT NULL column
-- unbackfillable): pick any admin person in the same tenant.
update public.tasks t set created_by_person_id = (
    select fm.person_id from public.family_memberships fm
    where fm.tenant_id = t.tenant_id and fm.role = 'FAMILY_OWNER' and fm.is_active limit 1
  )
  where created_by_person_id is null;
alter table public.tasks alter column created_by_person_id set not null;
alter table public.tasks
  drop constraint if exists tasks_subject_person_id_fkey,
  drop constraint if exists tasks_responsible_person_id_fkey,
  drop constraint if exists tasks_alternate_responsible_person_id_fkey;
alter table public.tasks
  add constraint tasks_subject_person_id_fkey foreign key (subject_person_id, tenant_id) references public.persons (id, tenant_id) on delete set null,
  add constraint tasks_responsible_person_id_fkey foreign key (responsible_person_id, tenant_id) references public.persons (id, tenant_id) on delete set null,
  add constraint tasks_alternate_responsible_person_id_fkey foreign key (alternate_responsible_person_id, tenant_id) references public.persons (id, tenant_id) on delete set null,
  add constraint tasks_created_by_person_id_fkey foreign key (created_by_person_id, tenant_id) references public.persons (id, tenant_id);

drop policy if exists tasks_rw_within_tenant on public.tasks;
create policy tasks_access on public.tasks for all to authenticated
  using (app.is_current_tenant(tenant_id) and (
    app.person_id_in_tenant(tenant_id) in (responsible_person_id, alternate_responsible_person_id, created_by_person_id, subject_person_id)
    or app.has_any_family_admin_role(tenant_id)
  ))
  with check (app.is_current_tenant(tenant_id));

alter table public.checklists add constraint checklists_id_tenant_uk unique (id, tenant_id);
alter table public.checklists add column if not exists created_by_person_id uuid;
update public.checklists c set created_by_person_id = coalesce(subject_person_id, (
    select fm.person_id from public.family_memberships fm
    where fm.tenant_id = c.tenant_id and fm.role = 'FAMILY_OWNER' and fm.is_active limit 1
  ))
  where created_by_person_id is null;
alter table public.checklists alter column created_by_person_id set not null;
alter table public.checklists
  drop constraint if exists checklists_subject_person_id_fkey,
  drop constraint if exists checklists_linked_calendar_event_id_fkey;
alter table public.checklists
  add constraint checklists_subject_person_id_fkey foreign key (subject_person_id, tenant_id) references public.persons (id, tenant_id) on delete set null,
  add constraint checklists_linked_calendar_event_id_fkey foreign key (linked_calendar_event_id, tenant_id) references public.calendar_events (id, tenant_id) on delete cascade,
  add constraint checklists_created_by_person_id_fkey foreign key (created_by_person_id, tenant_id) references public.persons (id, tenant_id);

drop policy if exists checklists_rw_within_tenant on public.checklists;
create policy checklists_access on public.checklists for all to authenticated
  using (app.is_current_tenant(tenant_id) and (
    app.person_id_in_tenant(tenant_id) in (created_by_person_id, subject_person_id) or app.has_any_family_admin_role(tenant_id)
  ))
  with check (app.is_current_tenant(tenant_id));

-- ---------------------------------------------------------------- routines / routine_items

alter table public.routines add constraint routines_id_tenant_uk unique (id, tenant_id);
alter table public.routines
  drop constraint if exists routines_subject_person_id_fkey;
alter table public.routines
  add constraint routines_subject_person_id_fkey foreign key (subject_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade;

drop policy if exists routines_rw_within_tenant on public.routines;
create policy routines_access on public.routines for all to authenticated
  using (app.is_current_tenant(tenant_id) and app.has_domain_access(tenant_id, subject_person_id, app.routine_domain(category), 'VIEW'))
  with check (app.is_current_tenant(tenant_id) and app.has_domain_access(tenant_id, subject_person_id, app.routine_domain(category), 'EDIT'));

alter table public.routine_items
  drop constraint if exists routine_items_routine_id_fkey,
  drop constraint if exists routine_items_completed_by_person_id_fkey;
alter table public.routine_items
  add constraint routine_items_routine_id_fkey foreign key (routine_id, tenant_id) references public.routines (id, tenant_id) on delete cascade,
  add constraint routine_items_completed_by_person_id_fkey foreign key (completed_by_person_id, tenant_id) references public.persons (id, tenant_id) on delete set null;

drop policy if exists routine_items_rw_within_tenant on public.routine_items;
create policy routine_items_access on public.routine_items for all to authenticated
  using (app.is_current_tenant(tenant_id) and exists (
    select 1 from public.routines r where r.id = routine_items.routine_id
      and app.has_domain_access(r.tenant_id, r.subject_person_id, app.routine_domain(r.category), 'VIEW')
  ))
  with check (app.is_current_tenant(tenant_id));

-- ---------------------------------------------------------------- checklist_items

alter table public.checklist_items
  drop constraint if exists checklist_items_checklist_id_fkey,
  drop constraint if exists checklist_items_checked_by_person_id_fkey;
alter table public.checklist_items
  add constraint checklist_items_checklist_id_fkey foreign key (checklist_id, tenant_id) references public.checklists (id, tenant_id) on delete cascade,
  add constraint checklist_items_checked_by_person_id_fkey foreign key (checked_by_person_id, tenant_id) references public.persons (id, tenant_id) on delete set null;

drop policy if exists checklist_items_rw_within_tenant on public.checklist_items;
create policy checklist_items_access on public.checklist_items for all to authenticated
  using (app.is_current_tenant(tenant_id) and exists (
    select 1 from public.checklists c where c.id = checklist_items.checklist_id
      and (app.person_id_in_tenant(c.tenant_id) in (c.created_by_person_id, c.subject_person_id) or app.has_any_family_admin_role(c.tenant_id))
  ))
  with check (app.is_current_tenant(tenant_id));
