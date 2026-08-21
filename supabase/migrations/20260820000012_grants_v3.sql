-- ============================================================================
-- 0022: table-level grants for the `authenticated` role on every table
-- added by the Extended Care Network adendo — same rationale as
-- 20260819000010_grants.sql / 20260820000006_grants_v2.sql.
-- ============================================================================

grant select, insert, update on public.responsibility_assignments to authenticated;
grant select, insert, update on public.delegation_policies to authenticated;
grant select, insert, update on public.care_network_members to authenticated;
grant select, insert, update on public.recurring_responsibilities to authenticated;
grant select, insert, update on public.caregiver_availability to authenticated;
