-- ============================================================================
-- 0027: FASE 4 closing — authority_grants is what the Policy Engine
-- actually reads to decide access. Its old blanket `for all` let any tenant
-- member self-mint any (domain,action) over any subject: the most direct
-- privilege-escalation path in the whole schema. Closed to SELECT-only for
-- `authenticated` (both RLS and table GRANT); all writes go through two new
-- SECURITY DEFINER RPCs (grant_authority / revoke_authority) enforcing
-- "you cannot grant what you do not have".
-- ============================================================================

alter table public.care_windows add constraint care_windows_id_tenant_uk unique (id, tenant_id);
alter table public.residences add constraint residences_id_tenant_uk unique (id, tenant_id);

alter table public.authority_grants
  drop constraint if exists authority_grants_grantee_person_id_fkey,
  drop constraint if exists authority_grants_subject_person_id_fkey,
  drop constraint if exists authority_grants_granted_by_person_id_fkey,
  drop constraint if exists authority_grants_revoked_by_person_id_fkey,
  drop constraint if exists authority_grants_residence_id_fkey,
  drop constraint if exists authority_grants_care_window_fk;
alter table public.authority_grants
  add constraint authority_grants_grantee_person_id_fkey foreign key (grantee_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade,
  add constraint authority_grants_subject_person_id_fkey foreign key (subject_person_id, tenant_id) references public.persons (id, tenant_id) on delete cascade,
  add constraint authority_grants_granted_by_person_id_fkey foreign key (granted_by_person_id, tenant_id) references public.persons (id, tenant_id),
  add constraint authority_grants_revoked_by_person_id_fkey foreign key (revoked_by_person_id, tenant_id) references public.persons (id, tenant_id),
  add constraint authority_grants_residence_id_fkey foreign key (residence_id, tenant_id) references public.residences (id, tenant_id) on delete set null,
  add constraint authority_grants_care_window_fk foreign key (care_window_id, tenant_id) references public.care_windows (id, tenant_id) on delete set null;

create index if not exists authority_grants_active_lookup_idx
  on public.authority_grants (tenant_id, grantee_person_id, subject_person_id, domain, action)
  where revoked_at is null;

drop policy if exists authority_grants_rw_within_tenant on public.authority_grants;
create policy authority_grants_select_relevant_or_admin
  on public.authority_grants for select to authenticated
  using (app.is_current_tenant(tenant_id) and (
    app.person_id_in_tenant(tenant_id) in (grantee_person_id, subject_person_id, granted_by_person_id)
    or app.has_any_family_admin_role(tenant_id)
  ));

revoke insert, update, delete on public.authority_grants from authenticated;
grant select on public.authority_grants to authenticated;

create or replace function app.grant_authority(
  p_tenant_id uuid, p_grantee_person_id uuid, p_subject_person_id uuid,
  p_domain text, p_action text,
  p_valid_from timestamptz default null, p_valid_until timestamptz default null,
  p_care_window_id uuid default null, p_residence_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_grantor_person_id uuid;
  v_new_id uuid;
begin
  if not app.is_current_tenant(p_tenant_id) then raise exception 'not a member of this tenant'; end if;
  v_grantor_person_id := app.person_id_in_tenant(p_tenant_id);

  if not (
    app.has_any_family_admin_role(p_tenant_id)
    or exists (
      select 1 from public.authority_grants g
      where g.tenant_id = p_tenant_id and g.grantee_person_id = v_grantor_person_id
        and g.subject_person_id = p_subject_person_id and g.domain = p_domain and g.action = p_action
        and g.revoked_at is null
        and (g.valid_from is null or g.valid_from <= now())
        and (g.valid_until is null or g.valid_until >= now())
    )
  ) then
    raise exception 'grantor lacks the authority being granted';
  end if;

  insert into public.authority_grants (
    tenant_id, grantee_person_id, subject_person_id, domain, action,
    care_window_id, residence_id, valid_from, valid_until, granted_by_person_id
  ) values (
    p_tenant_id, p_grantee_person_id, p_subject_person_id, p_domain, p_action,
    p_care_window_id, p_residence_id, p_valid_from, p_valid_until, v_grantor_person_id
  ) returning id into v_new_id;

  return v_new_id;
end; $$;

create or replace function app.revoke_authority(p_grant_id uuid, p_tenant_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_revoker uuid;
begin
  if not app.is_current_tenant(p_tenant_id) then raise exception 'not a member of this tenant'; end if;
  v_revoker := app.person_id_in_tenant(p_tenant_id);

  update public.authority_grants
    set revoked_at = now(), revoked_by_person_id = v_revoker
  where id = p_grant_id and tenant_id = p_tenant_id and revoked_at is null
    and (granted_by_person_id = v_revoker or app.has_any_family_admin_role(p_tenant_id));

  if not found then raise exception 'grant not found, already revoked, or not authorized to revoke'; end if;
end; $$;

grant execute on function app.grant_authority(uuid, uuid, uuid, text, text, timestamptz, timestamptz, uuid, uuid) to authenticated;
grant execute on function app.revoke_authority(uuid, uuid) to authenticated;
