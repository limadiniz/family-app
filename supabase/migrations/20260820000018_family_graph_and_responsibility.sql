-- ============================================================================
-- 0026: FASE 3 closing — relationships (tenant-consistent composite FKs,
-- self-or-admin write instead of blanket tenant write), and
-- responsibility_assignments (the highest-stakes table of this batch: a
-- blanket `for all` let any tenant member self-mint an ACTIVE custodial
-- responsibility, bypassing the whole PROPOSED->ACCEPTED gate). Also closes
-- delegation_policies (self-escalation of delegation power) and
-- care_network_members/recurring_responsibilities/caregiver_availability.
-- ============================================================================

alter table public.relationships
  drop constraint if exists relationships_from_person_id_fkey,
  drop constraint if exists relationships_to_person_id_fkey;
alter table public.relationships
  add constraint relationships_from_person_id_fkey foreign key (from_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade,
  add constraint relationships_to_person_id_fkey foreign key (to_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade;

create unique index if not exists relationships_unique_edge
  on public.relationships (tenant_id, from_person_id, to_person_id, relationship_type);

drop policy if exists relationships_rw_within_tenant on public.relationships;
create policy relationships_select_within_tenant on public.relationships for select to authenticated
  using (app.is_current_tenant(tenant_id));
create policy relationships_write_self_or_admin on public.relationships for insert to authenticated
  with check (app.is_current_tenant(tenant_id)
    and (app.person_id_in_tenant(tenant_id) in (from_person_id, to_person_id) or app.has_any_family_admin_role(tenant_id)));
create policy relationships_update_self_or_admin on public.relationships for update to authenticated
  using (app.is_current_tenant(tenant_id)
    and (app.person_id_in_tenant(tenant_id) in (from_person_id, to_person_id) or app.has_any_family_admin_role(tenant_id)))
  with check (app.is_current_tenant(tenant_id));

-- ----------------------------------------------------------------------------
-- responsibility_assignments
-- ----------------------------------------------------------------------------

alter table public.responsibility_assignments add constraint responsibility_assignments_id_tenant_uk unique (id, tenant_id);
alter table public.responsibility_assignments
  drop constraint if exists responsibility_assignments_subject_person_id_fkey,
  drop constraint if exists responsibility_assignments_assigned_to_person_id_fkey,
  drop constraint if exists responsibility_assignments_assigned_by_person_id_fkey,
  drop constraint if exists responsibility_assignments_accountable_person_id_fkey,
  drop constraint if exists responsibility_assignments_fallback_assignment_id_fkey;
alter table public.responsibility_assignments
  add constraint responsibility_assignments_subject_person_id_fkey foreign key (subject_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade,
  add constraint responsibility_assignments_assigned_to_person_id_fkey foreign key (assigned_to_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade,
  add constraint responsibility_assignments_assigned_by_person_id_fkey foreign key (assigned_by_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade,
  add constraint responsibility_assignments_accountable_person_id_fkey foreign key (accountable_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade,
  add constraint responsibility_assignments_fallback_assignment_id_fkey foreign key (fallback_assignment_id, tenant_id) references public.responsibility_assignments (id, tenant_id);

create or replace function app.validate_responsibility_assignment_transition()
returns trigger language plpgsql as $$
declare v_allowed text[];
begin
  if new.status = old.status then return new; end if;
  v_allowed := case old.status
    when 'PROPOSED' then array['SENT','CANCELLED']
    when 'SENT' then array['VIEWED','ACCEPTED','DECLINED','EXPIRED','CANCELLED']
    when 'VIEWED' then array['ACCEPTED','DECLINED','EXPIRED','CANCELLED']
    when 'ACCEPTED' then array['ACTIVE','CANCELLED']
    when 'ACTIVE' then array['COMPLETED','FAILED','CANCELLED']
    else array[]::text[] end;
  if not (new.status = any(v_allowed)) then
    raise exception 'invalid responsibility_assignment transition: % -> %', old.status, new.status;
  end if;
  return new;
end; $$;
drop trigger if exists responsibility_assignments_validate_transition on public.responsibility_assignments;
create trigger responsibility_assignments_validate_transition
  before update of status on public.responsibility_assignments
  for each row execute function app.validate_responsibility_assignment_transition();

create or replace function app.validate_responsibility_delegation_chain()
returns trigger language plpgsql as $$
declare v_parent record;
begin
  if new.source_type = 'RESPONSIBILITY_ASSIGNMENT' and new.source_id is not null then
    select accountable_person_id, tenant_id into v_parent
    from public.responsibility_assignments where id = new.source_id;
    if v_parent is null then raise exception 'source responsibility_assignment not found'; end if;
    if v_parent.tenant_id <> new.tenant_id then raise exception 'delegation source must belong to the same tenant'; end if;
    if new.accountable_person_id <> v_parent.accountable_person_id then
      raise exception 'accountable_person_id must be preserved across a delegation chain';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists responsibility_assignments_validate_delegation on public.responsibility_assignments;
create trigger responsibility_assignments_validate_delegation
  before insert on public.responsibility_assignments
  for each row execute function app.validate_responsibility_delegation_chain();

create or replace function app.protect_responsibility_assignment_immutable_fields()
returns trigger language plpgsql as $$
begin
  if new.tenant_id <> old.tenant_id or new.subject_person_id <> old.subject_person_id
     or new.responsibility_type <> old.responsibility_type
     or new.assigned_to_person_id <> old.assigned_to_person_id
     or new.assigned_by_person_id <> old.assigned_by_person_id
     or new.accountable_person_id <> old.accountable_person_id
     or new.required_permissions is distinct from old.required_permissions
     or new.starts_at <> old.starts_at or new.ends_at <> old.ends_at
  then raise exception 'core fields of a responsibility_assignment are immutable; cancel and create a new one';
  end if;
  return new;
end; $$;
drop trigger if exists responsibility_assignments_protect_immutable on public.responsibility_assignments;
create trigger responsibility_assignments_protect_immutable
  before update on public.responsibility_assignments
  for each row execute function app.protect_responsibility_assignment_immutable_fields();

drop policy if exists responsibility_assignments_rw_within_tenant on public.responsibility_assignments;

create policy responsibility_assignments_select_participant_or_admin
  on public.responsibility_assignments for select to authenticated
  using (app.is_current_tenant(tenant_id) and (
    app.person_id_in_tenant(tenant_id) in (assigned_to_person_id, assigned_by_person_id, accountable_person_id)
    or app.person_id_in_tenant(tenant_id) = any(consulted_person_ids)
    or app.person_id_in_tenant(tenant_id) = any(informed_person_ids)
    or app.has_any_family_admin_role(tenant_id)
  ));

create policy responsibility_assignments_insert_proposed_only
  on public.responsibility_assignments for insert to authenticated
  with check (app.is_current_tenant(tenant_id) and status = 'PROPOSED'
    and assigned_by_person_id = app.person_id_in_tenant(tenant_id));

create policy responsibility_assignments_update_participant
  on public.responsibility_assignments for update to authenticated
  using (app.is_current_tenant(tenant_id)
    and app.person_id_in_tenant(tenant_id) in (assigned_to_person_id, assigned_by_person_id, accountable_person_id))
  with check (app.is_current_tenant(tenant_id));

-- ----------------------------------------------------------------------------
-- delegation_policies / care_network_members / recurring_responsibilities / caregiver_availability
-- ----------------------------------------------------------------------------

drop policy if exists delegation_policies_rw_within_tenant on public.delegation_policies;
create policy delegation_policies_select_self_or_admin on public.delegation_policies for select to authenticated
  using (app.is_current_tenant(tenant_id) and (person_id = app.person_id_in_tenant(tenant_id) or app.has_any_family_admin_role(tenant_id)));
create policy delegation_policies_admin_insert on public.delegation_policies for insert to authenticated
  with check (app.is_current_tenant(tenant_id) and app.has_any_family_admin_role(tenant_id)
    and updated_by_person_id = app.person_id_in_tenant(tenant_id));
create policy delegation_policies_admin_update on public.delegation_policies for update to authenticated
  using (app.is_current_tenant(tenant_id) and app.has_any_family_admin_role(tenant_id))
  with check (app.is_current_tenant(tenant_id) and app.has_any_family_admin_role(tenant_id)
    and updated_by_person_id = app.person_id_in_tenant(tenant_id));

drop policy if exists care_network_members_rw_within_tenant on public.care_network_members;
create policy care_network_members_select_within_tenant on public.care_network_members for select to authenticated
  using (app.is_current_tenant(tenant_id));
create policy care_network_members_admin_insert on public.care_network_members for insert to authenticated
  with check (app.is_current_tenant(tenant_id) and app.has_any_family_admin_role(tenant_id)
    and added_by_person_id = app.person_id_in_tenant(tenant_id));
create policy care_network_members_admin_update on public.care_network_members for update to authenticated
  using (app.is_current_tenant(tenant_id) and app.has_any_family_admin_role(tenant_id))
  with check (app.is_current_tenant(tenant_id));

drop policy if exists recurring_responsibilities_rw_within_tenant on public.recurring_responsibilities;
create policy recurring_responsibilities_select_within_tenant on public.recurring_responsibilities for select to authenticated
  using (app.is_current_tenant(tenant_id));
create policy recurring_responsibilities_admin_insert on public.recurring_responsibilities for insert to authenticated
  with check (app.is_current_tenant(tenant_id) and app.has_any_family_admin_role(tenant_id)
    and created_by_person_id = app.person_id_in_tenant(tenant_id));
create policy recurring_responsibilities_admin_update on public.recurring_responsibilities for update to authenticated
  using (app.is_current_tenant(tenant_id) and app.has_any_family_admin_role(tenant_id))
  with check (app.is_current_tenant(tenant_id));

drop policy if exists caregiver_availability_rw_within_tenant on public.caregiver_availability;
create policy caregiver_availability_select_within_tenant on public.caregiver_availability for select to authenticated
  using (app.is_current_tenant(tenant_id));
create policy caregiver_availability_self_or_admin_insert on public.caregiver_availability for insert to authenticated
  with check (app.is_current_tenant(tenant_id) and (person_id = app.person_id_in_tenant(tenant_id) or app.has_any_family_admin_role(tenant_id)));
create policy caregiver_availability_self_or_admin_update on public.caregiver_availability for update to authenticated
  using (app.is_current_tenant(tenant_id) and (person_id = app.person_id_in_tenant(tenant_id) or app.has_any_family_admin_role(tenant_id)))
  with check (app.is_current_tenant(tenant_id) and (person_id = app.person_id_in_tenant(tenant_id) or app.has_any_family_admin_role(tenant_id)));
