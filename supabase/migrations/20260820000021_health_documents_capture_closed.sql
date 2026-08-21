-- ============================================================================
-- 0029: FASE 6 closing. Two findings: (1) health_profiles/emergency_profiles
-- duplicate the same fields with nothing keeping them in sync — a stale
-- allergy in an emergency is a real hazard, not cosmetic, fixed with a
-- sync trigger; (2) every HEALTH/MEDICATION/EMERGENCY/DOCUMENTS table only
-- had the tenant wall, meaning a role the Policy Engine explicitly
-- excludes from HEALTH (e.g. CAREGIVER) could still read it directly via
-- the Supabase REST API, bypassing the Policy Engine entirely. Fixed with
-- app.has_domain_access, a conservative mirror of the Policy Engine's
-- decision order usable directly in RLS.
-- ============================================================================

create or replace function app.has_domain_access(
  p_tenant_id uuid, p_subject_person_id uuid, p_domain text, p_action text
) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_actor uuid := app.person_id_in_tenant(p_tenant_id);
begin
  if v_actor is null then return false; end if;
  if v_actor = p_subject_person_id and p_action in ('VIEW','EDIT','CREATE','COMMENT') then return true; end if;
  if exists (
    select 1 from public.authority_grants g
    where g.tenant_id = p_tenant_id and g.grantee_person_id = v_actor
      and g.subject_person_id = p_subject_person_id and g.domain = p_domain and g.action = p_action
      and g.revoked_at is null
      and (g.valid_from is null or g.valid_from <= now())
      and (g.valid_until is null or g.valid_until >= now())
  ) then return true; end if;
  if app.has_any_family_admin_role(p_tenant_id) then return true; end if;
  if p_domain = any(array['SCHEDULE','HEALTH','MEDICATION','CONTACTS','EMERGENCY','ACTIVITIES','TRANSPORTATION'])
     and exists (
       select 1 from public.care_windows w
       where w.tenant_id = p_tenant_id and w.caregiver_person_id = v_actor
         and w.child_person_id = p_subject_person_id and w.status in ('SCHEDULED','ACTIVE')
         and now() between w.starts_at and w.ends_at
     ) then return true;
  end if;
  return false;
end; $$;
grant execute on function app.has_domain_access(uuid, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------- health_profiles / emergency_profiles

alter table public.health_profiles
  drop constraint if exists health_profiles_person_id_fkey;
alter table public.health_profiles
  add constraint health_profiles_person_id_fkey foreign key (person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade;

alter table public.emergency_profiles
  drop constraint if exists emergency_profiles_subject_person_id_fkey;
alter table public.emergency_profiles
  add constraint emergency_profiles_subject_person_id_fkey foreign key (subject_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade;

create or replace function app.sync_health_profile_to_emergency()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.emergency_profiles (tenant_id, subject_person_id, blood_type, allergies, conditions, health_plan_name, health_plan_card_number)
  values (new.tenant_id, new.person_id, new.blood_type, new.allergies, new.conditions, new.health_plan_name, new.health_plan_card_number)
  on conflict (tenant_id, subject_person_id) do update set
    blood_type = excluded.blood_type, allergies = excluded.allergies, conditions = excluded.conditions,
    health_plan_name = excluded.health_plan_name, health_plan_card_number = excluded.health_plan_card_number,
    updated_at = now();
  return new;
end; $$;
drop trigger if exists health_profiles_sync_emergency on public.health_profiles;
create trigger health_profiles_sync_emergency after insert or update on public.health_profiles
  for each row execute function app.sync_health_profile_to_emergency();

drop policy if exists health_profiles_rw_within_tenant on public.health_profiles;
create policy health_profiles_access on public.health_profiles for all to authenticated
  using (app.is_current_tenant(tenant_id) and app.has_domain_access(tenant_id, person_id, 'HEALTH', 'VIEW'))
  with check (app.is_current_tenant(tenant_id) and app.has_domain_access(tenant_id, person_id, 'HEALTH', 'EDIT'));

drop policy if exists emergency_profiles_rw_within_tenant on public.emergency_profiles;
create policy emergency_profiles_access on public.emergency_profiles for all to authenticated
  using (app.is_current_tenant(tenant_id) and app.has_domain_access(tenant_id, subject_person_id, 'EMERGENCY', 'VIEW'))
  with check (app.is_current_tenant(tenant_id) and app.has_domain_access(tenant_id, subject_person_id, 'EMERGENCY', 'EDIT'));

-- ---------------------------------------------------------------- prescriptions / medications / schedules / administrations

alter table public.prescriptions add constraint prescriptions_id_tenant_uk unique (id, tenant_id);
alter table public.prescriptions
  drop constraint if exists prescriptions_subject_person_id_fkey;
alter table public.prescriptions
  add constraint prescriptions_subject_person_id_fkey foreign key (subject_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade;

drop policy if exists prescriptions_rw_within_tenant on public.prescriptions;
create policy prescriptions_access on public.prescriptions for all to authenticated
  using (app.is_current_tenant(tenant_id) and app.has_domain_access(tenant_id, subject_person_id, 'HEALTH', 'VIEW'))
  with check (app.is_current_tenant(tenant_id) and app.has_domain_access(tenant_id, subject_person_id, 'HEALTH', 'EDIT'));

alter table public.medications add constraint medications_id_tenant_uk unique (id, tenant_id);
alter table public.medications
  drop constraint if exists medications_subject_person_id_fkey,
  drop constraint if exists medications_prescription_id_fkey;
alter table public.medications
  add constraint medications_subject_person_id_fkey foreign key (subject_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade,
  add constraint medications_prescription_id_fkey foreign key (prescription_id, tenant_id) references public.prescriptions (id, tenant_id) on delete set null;

drop policy if exists medications_rw_within_tenant on public.medications;
create policy medications_access on public.medications for all to authenticated
  using (app.is_current_tenant(tenant_id) and app.has_domain_access(tenant_id, subject_person_id, 'MEDICATION', 'VIEW'))
  with check (app.is_current_tenant(tenant_id) and app.has_domain_access(tenant_id, subject_person_id, 'MEDICATION', 'EDIT'));

alter table public.medication_schedules add column if not exists subject_person_id uuid;
update public.medication_schedules ms set subject_person_id = m.subject_person_id
  from public.medications m where m.id = ms.medication_id and ms.subject_person_id is null;
alter table public.medication_schedules alter column subject_person_id set not null;
alter table public.medication_schedules
  drop constraint if exists medication_schedules_medication_id_fkey;
alter table public.medication_schedules
  add constraint medication_schedules_medication_id_fkey foreign key (medication_id, tenant_id) references public.medications (id, tenant_id) on delete cascade,
  add constraint medication_schedules_subject_person_id_fkey foreign key (subject_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade;

alter table public.medication_administrations add column if not exists subject_person_id uuid;
update public.medication_administrations ma set subject_person_id = m.subject_person_id
  from public.medications m where m.id = ma.medication_id and ma.subject_person_id is null;
alter table public.medication_administrations alter column subject_person_id set not null;
alter table public.medication_administrations
  drop constraint if exists medication_administrations_medication_id_fkey,
  drop constraint if exists medication_administrations_administered_by_person_id_fkey;
alter table public.medication_administrations
  add constraint medication_administrations_medication_id_fkey foreign key (medication_id, tenant_id) references public.medications (id, tenant_id) on delete cascade,
  add constraint medication_administrations_subject_person_id_fkey foreign key (subject_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade,
  add constraint medication_administrations_administered_by_person_id_fkey foreign key (administered_by_person_id, tenant_id) references public.persons (id, tenant_id) on delete set null;

create or replace function app.validate_denormalized_medication_subject()
returns trigger language plpgsql as $$
declare v_subject uuid;
begin
  select subject_person_id into v_subject from public.medications where id = new.medication_id;
  if v_subject is null or new.subject_person_id <> v_subject then
    raise exception 'subject_person_id must match the parent medication''s subject_person_id';
  end if;
  return new;
end; $$;
drop trigger if exists medication_schedules_validate_subject on public.medication_schedules;
create trigger medication_schedules_validate_subject before insert or update on public.medication_schedules
  for each row execute function app.validate_denormalized_medication_subject();
drop trigger if exists medication_administrations_validate_subject on public.medication_administrations;
create trigger medication_administrations_validate_subject before insert or update on public.medication_administrations
  for each row execute function app.validate_denormalized_medication_subject();

drop policy if exists medication_schedules_rw_within_tenant on public.medication_schedules;
create policy medication_schedules_access on public.medication_schedules for all to authenticated
  using (app.is_current_tenant(tenant_id) and app.has_domain_access(tenant_id, subject_person_id, 'MEDICATION', 'VIEW'))
  with check (app.is_current_tenant(tenant_id) and app.has_domain_access(tenant_id, subject_person_id, 'MEDICATION', 'EDIT'));

drop policy if exists medication_administrations_rw_within_tenant on public.medication_administrations;
create policy medication_administrations_access on public.medication_administrations for all to authenticated
  using (app.is_current_tenant(tenant_id) and app.has_domain_access(tenant_id, subject_person_id, 'MEDICATION', 'VIEW'))
  with check (app.is_current_tenant(tenant_id) and app.has_domain_access(tenant_id, subject_person_id, 'MEDICATION', 'EDIT'));

-- ---------------------------------------------------------------- documents / extracted_document_data + storage

alter table public.documents add constraint documents_id_tenant_uk unique (id, tenant_id);
alter table public.documents
  drop constraint if exists documents_subject_person_id_fkey;
alter table public.documents
  add constraint documents_subject_person_id_fkey foreign key (subject_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade;

drop policy if exists documents_rw_within_tenant on public.documents;
create policy documents_access on public.documents for all to authenticated
  using (app.is_current_tenant(tenant_id) and app.has_domain_access(tenant_id, subject_person_id, 'DOCUMENTS', 'VIEW'))
  with check (app.is_current_tenant(tenant_id) and app.has_domain_access(tenant_id, subject_person_id, 'DOCUMENTS', 'EDIT'));

alter table public.extracted_document_data
  drop constraint if exists extracted_document_data_document_id_fkey;
alter table public.extracted_document_data
  add constraint extracted_document_data_document_id_fkey foreign key (document_id, tenant_id) references public.documents (id, tenant_id) on delete cascade;

drop policy if exists extracted_document_data_rw_within_tenant on public.extracted_document_data;
create policy extracted_document_data_access on public.extracted_document_data for all to authenticated
  using (app.is_current_tenant(tenant_id) and exists (
    select 1 from public.documents d where d.id = extracted_document_data.document_id
      and app.has_domain_access(d.tenant_id, d.subject_person_id, 'DOCUMENTS', 'VIEW')
  ))
  with check (app.is_current_tenant(tenant_id));

insert into storage.buckets (id, name, public)
  values ('documents', 'documents', false), ('capture-attachments', 'capture-attachments', false)
  on conflict (id) do nothing;

drop policy if exists documents_storage_select on storage.objects;
create policy documents_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and exists (
    select 1 from public.documents d where d.storage_path = storage.objects.name
      and app.is_current_tenant(d.tenant_id) and app.has_domain_access(d.tenant_id, d.subject_person_id, 'DOCUMENTS', 'VIEW')
  ));
-- No insert/update/delete policy for `authenticated` on either bucket:
-- writes only via short-lived signed URLs minted by apps/api (service role).

-- ---------------------------------------------------------------- capture_*

create or replace function app.validate_capture_item_transition()
returns trigger language plpgsql as $$
declare v_allowed text[];
begin
  if new.status = old.status then return new; end if;
  v_allowed := case old.status
    when 'RECEIVED' then array['PROCESSING','FAILED']
    when 'PROCESSING' then array['NEEDS_REVIEW','READY','FAILED']
    when 'NEEDS_REVIEW' then array['READY','REJECTED','FAILED']
    when 'READY' then array['CONFIRMED','REJECTED']
    when 'CONFIRMED' then array['ARCHIVED']
    when 'REJECTED' then array['ARCHIVED']
    when 'FAILED' then array['ARCHIVED','PROCESSING']
    else array[]::text[] end;
  if not (new.status = any(v_allowed)) then
    raise exception 'invalid capture_item transition: % -> %', old.status, new.status;
  end if;
  return new;
end; $$;
drop trigger if exists capture_items_validate_transition on public.capture_items;
create trigger capture_items_validate_transition before update of status on public.capture_items
  for each row execute function app.validate_capture_item_transition();

drop policy if exists capture_items_rw_within_tenant on public.capture_items;
create policy capture_items_access on public.capture_items for all to authenticated
  using (app.is_current_tenant(tenant_id) and (
    app.person_id_in_tenant(tenant_id) in (created_by_person_id, subject_person_id) or app.has_any_family_admin_role(tenant_id)
  ))
  with check (app.is_current_tenant(tenant_id));

-- capture_attachments / capture_extractions / capture_proposals: child
-- tables keyed off capture_item_id, inherit the parent's scoping via join
-- (same pattern as extracted_document_data) instead of denormalizing.
drop policy if exists capture_attachments_rw_within_tenant on public.capture_attachments;
create policy capture_attachments_access on public.capture_attachments for all to authenticated
  using (app.is_current_tenant(tenant_id) and exists (
    select 1 from public.capture_items ci where ci.id = capture_attachments.capture_item_id
      and (app.person_id_in_tenant(ci.tenant_id) in (ci.created_by_person_id, ci.subject_person_id) or app.has_any_family_admin_role(ci.tenant_id))
  ))
  with check (app.is_current_tenant(tenant_id));

drop policy if exists capture_extractions_rw_within_tenant on public.capture_extractions;
create policy capture_extractions_access on public.capture_extractions for all to authenticated
  using (app.is_current_tenant(tenant_id) and exists (
    select 1 from public.capture_items ci where ci.id = capture_extractions.capture_item_id
      and (app.person_id_in_tenant(ci.tenant_id) in (ci.created_by_person_id, ci.subject_person_id) or app.has_any_family_admin_role(ci.tenant_id))
  ))
  with check (app.is_current_tenant(tenant_id));

drop policy if exists capture_proposals_rw_within_tenant on public.capture_proposals;
create policy capture_proposals_access on public.capture_proposals for all to authenticated
  using (app.is_current_tenant(tenant_id) and exists (
    select 1 from public.capture_items ci where ci.id = capture_proposals.capture_item_id
      and (app.person_id_in_tenant(ci.tenant_id) in (ci.created_by_person_id, ci.subject_person_id) or app.has_any_family_admin_role(ci.tenant_id))
  ))
  with check (app.is_current_tenant(tenant_id));
