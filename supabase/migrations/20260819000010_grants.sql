-- ============================================================================
-- 0010: table-level grants for the `authenticated` role.
--
-- RLS policies only ever RESTRICT rows on top of a baseline table grant —
-- they cannot grant access a role doesn't already have at the table level.
-- Real Supabase projects grant broad table privileges to `authenticated`
-- by default and rely on RLS to do the real restriction; we make that
-- explicit and auditable here instead of relying on dashboard defaults.
--
-- audit_events deliberately gets no UPDATE/DELETE grant at all — belt and
-- suspenders on top of already having no UPDATE/DELETE policy.
-- ============================================================================

grant usage on schema public to authenticated;

grant select on public.tenants to authenticated;

grant select, insert, update on public.persons to authenticated;
grant select, update on public.users to authenticated;
grant select, insert, update on public.family_units to authenticated;
grant select, insert, update on public.family_memberships to authenticated;
grant select, insert, update on public.relationships to authenticated;
grant select, insert, update on public.residences to authenticated;
grant select, insert, update on public.residence_memberships to authenticated;
grant select, insert, update on public.authority_grants to authenticated;
grant select, insert, update on public.care_schedules to authenticated;
grant select, insert, update on public.care_windows to authenticated;
grant select, insert, update on public.handoffs to authenticated;
grant select, insert, update on public.invitations to authenticated;

grant select, insert on public.audit_events to authenticated;

grant execute on function app.current_tenant_id() to authenticated;
grant execute on function app.current_person_id() to authenticated;
