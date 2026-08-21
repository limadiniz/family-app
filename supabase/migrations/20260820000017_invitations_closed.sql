-- ============================================================================
-- 0025: closes `invitations` for real — composite tenant-consistent FKs
-- (nothing before this stopped family_unit_id/invited_by_person_id from
-- pointing at a different tenant than the invitation itself), immutability
-- after creation, subject_person_ids tenant-validation (array FK doesn't
-- exist in Postgres), and role-gated RLS instead of the old blanket
-- tenant-wide `for all`. Also wires accept/decline/lookup, which existed
-- as schema but no RPC before this round.
-- ============================================================================

-- Prerequisite for composite FKs used here and by later files in this batch.
alter table public.family_units add constraint family_units_id_tenant_uk unique (id, tenant_id);
alter table public.persons add constraint persons_id_tenant_uk unique (id, tenant_id);

alter table public.invitations
  drop constraint if exists invitations_family_unit_id_fkey,
  drop constraint if exists invitations_invited_by_person_id_fkey,
  drop constraint if exists invitations_accepted_by_user_id_fkey;

alter table public.invitations rename column accepted_by_user_id to accepted_by_person_id;
alter table public.invitations add column revoked_by_person_id uuid;

alter table public.invitations
  add constraint invitations_family_unit_id_fkey
    foreign key (family_unit_id, tenant_id) references public.family_units (id, tenant_id) on delete cascade,
  add constraint invitations_invited_by_person_id_fkey
    foreign key (invited_by_person_id, tenant_id) references public.persons (id, tenant_id),
  add constraint invitations_accepted_by_person_id_fkey
    foreign key (accepted_by_person_id, tenant_id) references public.persons (id, tenant_id),
  add constraint invitations_revoked_by_person_id_fkey
    foreign key (revoked_by_person_id, tenant_id) references public.persons (id, tenant_id);

alter table public.invitations
  drop constraint if exists invitations_proposed_role_check;
alter table public.invitations
  add constraint invitations_proposed_role_check check (proposed_role in (
    'FAMILY_OWNER', 'GUARDIAN', 'CO_GUARDIAN', 'CAREGIVER', 'TEMPORARY_CAREGIVER',
    'EXTENDED_FAMILY', 'TEEN', 'CHILD', 'PROFESSIONAL', 'EMERGENCY_ACCESS'
    -- PLATFORM_ADMIN intentionally removed: never mintable via invitation.
  ));

create unique index if not exists invitations_unique_pending_per_email
  on public.invitations (tenant_id, family_unit_id, invitee_email)
  where status = 'PENDING';

create or replace function app.validate_invitation_subjects()
returns trigger language plpgsql as $$
declare v_bad_count integer;
begin
  select count(*) into v_bad_count
  from unnest(new.subject_person_ids) as sid
  left join public.persons p on p.id = sid and p.tenant_id = new.tenant_id
  where p.id is null;
  if v_bad_count > 0 then
    raise exception 'subject_person_ids must all belong to the same tenant as the invitation';
  end if;
  return new;
end; $$;
drop trigger if exists invitations_validate_subjects on public.invitations;
create trigger invitations_validate_subjects
  before insert or update of subject_person_ids, tenant_id on public.invitations
  for each row execute function app.validate_invitation_subjects();

create or replace function app.protect_invitation_immutable_fields()
returns trigger language plpgsql as $$
begin
  if new.tenant_id <> old.tenant_id or new.family_unit_id <> old.family_unit_id
     or new.invited_by_person_id <> old.invited_by_person_id
     or new.invitee_email <> old.invitee_email
     or new.proposed_relationship <> old.proposed_relationship
     or new.proposed_role <> old.proposed_role
     or new.permission_preset <> old.permission_preset
     or new.subject_person_ids <> old.subject_person_ids
     or new.token <> old.token or new.expires_at <> old.expires_at
  then raise exception 'invitation core fields are immutable after creation; create a new invitation instead';
  end if;
  return new;
end; $$;
drop trigger if exists invitations_protect_immutable on public.invitations;
create trigger invitations_protect_immutable
  before update on public.invitations
  for each row execute function app.protect_invitation_immutable_fields();

drop policy if exists invitations_rw_within_tenant on public.invitations;

create policy invitations_select_own_or_admin
  on public.invitations for select to authenticated
  using (app.is_current_tenant(tenant_id) and (
    invited_by_person_id = app.person_id_in_tenant(tenant_id)
    or app.has_family_admin_role(tenant_id, family_unit_id)
  ));

create policy invitations_insert_admin_only
  on public.invitations for insert to authenticated
  with check (app.is_current_tenant(tenant_id)
    and invited_by_person_id = app.person_id_in_tenant(tenant_id)
    and app.has_family_admin_role(tenant_id, family_unit_id));

create policy invitations_update_revoke_only
  on public.invitations for update to authenticated
  using (app.is_current_tenant(tenant_id) and status = 'PENDING'
    and (invited_by_person_id = app.person_id_in_tenant(tenant_id)
         or app.has_family_admin_role(tenant_id, family_unit_id)))
  with check (app.is_current_tenant(tenant_id) and status = 'REVOKED'
    and revoked_by_person_id = app.person_id_in_tenant(tenant_id));

create or replace function app.accept_invitation(
  p_token text, p_auth_user_id uuid, p_email citext, p_display_name text
) returns table (tenant_id uuid, person_id uuid, family_unit_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_inv record;
  v_person_id uuid;
begin
  select * into v_inv from public.invitations
    where token = p_token and status = 'PENDING' and expires_at > now()
    for update;
  if not found then raise exception 'invalid_or_expired_invitation'; end if;

  insert into public.accounts (id, email, status) values (p_auth_user_id, p_email, 'ACTIVE')
    on conflict (id) do nothing;

  insert into public.persons (tenant_id, display_name, person_type, is_minor)
    values (v_inv.tenant_id, p_display_name, 'ADULT', false)
    returning id into v_person_id;

  insert into public.account_memberships (account_id, tenant_id, person_id, status)
    values (p_auth_user_id, v_inv.tenant_id, v_person_id, 'ACTIVE');

  insert into public.family_memberships (tenant_id, family_unit_id, person_id, role)
    values (v_inv.tenant_id, v_inv.family_unit_id, v_person_id, v_inv.proposed_role);

  update public.invitations set status = 'ACCEPTED', accepted_by_person_id = v_person_id
    where id = v_inv.id;

  return query select v_inv.tenant_id, v_person_id, v_inv.family_unit_id;
end; $$;

create or replace function app.decline_invitation(p_token text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.invitations set status = 'DECLINED'
  where token = p_token and status = 'PENDING' and expires_at > now();
  if not found then raise exception 'invalid_or_expired_invitation'; end if;
end; $$;

create or replace function app.lookup_invitation_by_token(p_token text)
returns table (family_unit_name text, invited_by_name text, proposed_role text, expires_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select fu.name, p.display_name, i.proposed_role, i.expires_at
  from public.invitations i
  join public.family_units fu on fu.id = i.family_unit_id
  join public.persons p on p.id = i.invited_by_person_id
  where i.token = p_token and i.status = 'PENDING' and i.expires_at > now();
$$;

grant execute on function app.accept_invitation(text, uuid, citext, text) to authenticated, anon;
grant execute on function app.decline_invitation(text) to authenticated, anon;
grant execute on function app.lookup_invitation_by_token(text) to authenticated, anon;
