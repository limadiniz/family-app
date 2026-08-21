-- ============================================================================
-- 0033: final cleanup of this migration batch. Verified (via the live
-- schema, not just by inspection) that no policy and no other function
-- still calls app.current_tenant_id()/app.current_person_id(), and no FK
-- still points at public.users, before dropping both.
-- ============================================================================

drop function if exists app.current_tenant_id();
drop function if exists app.current_person_id();
drop table if exists public.users;
