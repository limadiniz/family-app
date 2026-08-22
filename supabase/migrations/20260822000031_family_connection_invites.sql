-- ============================================================================
-- 0031: secure, authenticated family-connection invitation flow.
--
-- The schema had invitation rows and an internal accept function, but no
-- public RPC/API/UI used them. More importantly, the original internal
-- function trusted caller-supplied account/email values. These public
-- wrappers derive identity exclusively from the verified Supabase JWT.
-- ============================================================================

revoke all on function app.accept_invitation(text, uuid, citext, text) from anon, authenticated;
revoke all on function app.decline_invitation(text) from anon, authenticated;

create or replace function public.lookup_family_invitation(p_token text)
returns table (
  family_unit_name text,
  invited_by_name text,
  proposed_role text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select fu.name, inviter.display_name, i.proposed_role, i.expires_at
  from public.invitations i
  join public.family_units fu
    on fu.id = i.family_unit_id and fu.tenant_id = i.tenant_id
  join public.persons inviter
    on inviter.id = i.invited_by_person_id and inviter.tenant_id = i.tenant_id
  where i.token = p_token
    and i.status = 'PENDING'
    and i.deleted_at is null
    and i.expires_at > now();
$$;

create or replace function public.accept_family_invitation(
  p_token text,
  p_display_name text
)
returns table (tenant_id uuid, person_id uuid, family_unit_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.invitations%rowtype;
  v_account_id uuid := auth.uid();
  v_email citext := nullif(auth.jwt() ->> 'email', '')::citext;
  v_person_id uuid;
begin
  if v_account_id is null or v_email is null then
    raise exception 'authentication_required';
  end if;

  if char_length(trim(coalesce(p_display_name, ''))) < 2 then
    raise exception 'display_name_required';
  end if;

  select * into v_inv
  from public.invitations
  where token = p_token
    and status = 'PENDING'
    and deleted_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'invalid_or_expired_invitation';
  end if;

  if lower(v_inv.invitee_email::text) <> lower(v_email::text) then
    raise exception 'invitation_email_mismatch';
  end if;

  insert into public.accounts (id, email, status)
  values (v_account_id, v_email, 'ACTIVE')
  on conflict (id) do update
    set status = 'ACTIVE', updated_at = now();

  select am.person_id into v_person_id
  from public.account_memberships am
  where am.account_id = v_account_id
    and am.tenant_id = v_inv.tenant_id
    and am.status = 'ACTIVE';

  if v_person_id is null then
    insert into public.persons (tenant_id, display_name, person_type, is_minor)
    values (v_inv.tenant_id, trim(p_display_name), 'ADULT', false)
    returning id into v_person_id;

    insert into public.account_memberships (account_id, tenant_id, person_id, status)
    values (v_account_id, v_inv.tenant_id, v_person_id, 'ACTIVE');
  end if;

  insert into public.family_memberships (
    tenant_id, family_unit_id, person_id, role, is_active
  ) values (
    v_inv.tenant_id, v_inv.family_unit_id, v_person_id, v_inv.proposed_role, true
  )
  on conflict (family_unit_id, person_id, role) do update
    set is_active = true, deleted_at = null, updated_at = now();

  insert into public.relationships (
    tenant_id, from_person_id, to_person_id, relationship_type
  ) values (
    v_inv.tenant_id, v_person_id, v_inv.invited_by_person_id, v_inv.proposed_relationship
  )
  on conflict (tenant_id, from_person_id, to_person_id, relationship_type) do nothing;

  update public.invitations
  set status = 'ACCEPTED', accepted_by_person_id = v_person_id
  where id = v_inv.id;

  return query select v_inv.tenant_id, v_person_id, v_inv.family_unit_id;
end;
$$;

revoke all on function public.lookup_family_invitation(text) from public, anon;
revoke all on function public.accept_family_invitation(text, text) from public, anon;
grant execute on function public.lookup_family_invitation(text) to authenticated;
grant execute on function public.accept_family_invitation(text, text) to authenticated;
