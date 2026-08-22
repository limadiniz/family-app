-- ============================================================================
-- 0032: fixes invitation acceptance when the PL/pgSQL output variables
-- (`family_unit_id`, `person_id`) collide with columns in ON CONFLICT.
-- The previous function compiled, but PostgreSQL raised
-- "column reference family_unit_id is ambiguous" at execution time.
-- ============================================================================

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
  from public.invitations i
  where i.token = p_token
    and i.status = 'PENDING'
    and i.deleted_at is null
    and i.expires_at > now()
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
  on conflict on constraint family_memberships_family_unit_id_person_id_role_key do update
    set is_active = true, deleted_at = null, updated_at = now();

  insert into public.relationships (
    tenant_id, from_person_id, to_person_id, relationship_type
  ) values (
    v_inv.tenant_id, v_person_id, v_inv.invited_by_person_id, v_inv.proposed_relationship
  )
  on conflict do nothing;

  update public.invitations i
  set status = 'ACCEPTED', accepted_by_person_id = v_person_id
  where i.id = v_inv.id;

  return query select v_inv.tenant_id, v_person_id, v_inv.family_unit_id;
end;
$$;

revoke all on function public.accept_family_invitation(text, text) from public, anon;
grant execute on function public.accept_family_invitation(text, text) to authenticated;

-- Keep the database constraint aligned with the domain event emitted when a
-- person changes their own display name.
alter table public.audit_events drop constraint audit_events_event_type_check;

alter table public.audit_events add constraint audit_events_event_type_check check (event_type in (
  'LOGIN', 'LOGOUT', 'VIEW_HEALTH', 'VIEW_DOCUMENT', 'CREATE_EVENT', 'UPDATE_MEDICATION',
  'ADMINISTER_MEDICATION', 'GRANT_PERMISSION', 'REVOKE_PERMISSION', 'SHARE_DOCUMENT',
  'EMERGENCY_ACCESS', 'AI_QUERY', 'AI_ACTION', 'EXPORT_DATA', 'DELETE_REQUEST',
  'PERSON_CREATED', 'FAMILY_UNIT_CREATED', 'FAMILY_MEMBER_ADDED', 'RELATIONSHIP_CREATED',
  'RESIDENCE_CREATED', 'INVITATION_SENT', 'INVITATION_ACCEPTED', 'POLICY_DECISION',
  'PROFILE_UPDATED',
  'CALENDAR_EVENT_CREATED', 'TASK_CREATED', 'CAPTURE_ITEM_CREATED', 'CAPTURE_CONFIRMED',
  'CAPTURE_REJECTED', 'REQUEST_CREATED', 'REQUEST_ACCEPTED', 'REQUEST_DECLINED',
  'RESPONSIBILITY_ASSIGNMENT_CREATED', 'RESPONSIBILITY_ASSIGNMENT_ACCEPTED',
  'RESPONSIBILITY_ASSIGNMENT_DECLINED', 'RESPONSIBILITY_ASSIGNMENT_ACTIVATED',
  'RESPONSIBILITY_ASSIGNMENT_COMPLETED', 'RESPONSIBILITY_DELEGATED',
  'RESPONSIBILITY_DELEGATION_DENIED', 'CARE_NETWORK_MEMBER_ADDED',
  'CARE_SCHEDULE_CREATED', 'CARE_SCHEDULE_CANCELLED', 'CARE_WINDOW_CREATED',
  'CARE_WINDOW_ACTIVATED', 'CARE_WINDOW_COMPLETED', 'CARE_WINDOW_CANCELLED',
  'HANDOFF_CREATED', 'HANDOFF_CONFIRMED', 'HANDOFF_COMPLETED', 'HANDOFF_DELAYED',
  'HANDOFF_CANCELLED', 'HANDOFF_DISPUTED', 'HANDOFF_BRIEF_VIEWED', 'CARE_BRIEF_VIEWED'
));
