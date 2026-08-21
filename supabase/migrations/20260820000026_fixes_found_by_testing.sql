-- ============================================================================
-- 0034: two real bugs found by actually running the FASE 9 isolation tests
-- against Postgres, not just reasoning about the SQL:
--
-- 1. `grant usage on schema app to authenticated` was never issued —
--    anywhere, including for the original create_tenant_and_owner RPC that
--    predates this migration batch. RLS policies never surfaced this
--    because Postgres resolves a policy's function reference to a fixed
--    OID at CREATE POLICY time (run as the migration's own role), so
--    evaluating a policy at query time never re-checks schema USAGE for
--    the querying role. But a client calling a function directly — exactly
--    what grant_authority/revoke_authority/accept_invitation/
--    decline_invitation/lookup_invitation_by_token/create_tenant_and_owner
--    are FOR — parses `app.function_name` live and does need it. Latent
--    since Phase 0; only surfaced now because this is the first time an
--    app.* RPC was exercised end-to-end as `authenticated`/`anon` in a
--    test instead of only through apps/api (which, running as `service_role`
--    for RPC calls in some paths, would never have hit this either).
--
-- 2. app.has_domain_access's CareWindow baseline matched status IN
--    ('SCHEDULED','ACTIVE') — copied from the OLD policy.service.ts fix,
--    which existed because nothing ever transitioned SCHEDULED->ACTIVE, so
--    that fix widened the match to make the path reachable at all. This
--    round adds a REAL trigger-enforced activation gated by a COMPLETED
--    handoff (FASE 5), so ACTIVE now means something concrete: the
--    caregiver actually has the child right now. Matching SCHEDULED too
--    means a caregiver gets HEALTH/MEDICATION/EMERGENCY access to a child
--    they don't have yet, from the moment the window is merely on the
--    calendar — narrowed back to ACTIVE only.
-- ============================================================================

grant usage on schema app to authenticated, anon;

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
         and w.child_person_id = p_subject_person_id and w.status = 'ACTIVE'
         and now() between w.starts_at and w.ends_at
     ) then return true;
  end if;
  return false;
end; $$;
