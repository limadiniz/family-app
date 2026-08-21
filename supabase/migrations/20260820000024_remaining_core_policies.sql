-- ============================================================================
-- 0032: converts the last 8 policies still on the old single-tenant
-- app.current_tenant_id() (tenants, persons, family_units,
-- family_memberships, residences, residence_memberships) to
-- app.is_current_tenant(). These tables' shape does not change — only the
-- RLS condition, so an account with membership in more than one tenant
-- sees rows from all of them instead of being silently limited to one.
-- ============================================================================

drop policy if exists tenants_select_own on public.tenants;
create policy tenants_select_own on public.tenants for select to authenticated
  using (app.is_current_tenant(id));

drop policy if exists persons_select_within_tenant on public.persons;
drop policy if exists persons_insert_within_tenant on public.persons;
drop policy if exists persons_update_within_tenant on public.persons;
create policy persons_select_within_tenant on public.persons for select to authenticated
  using (app.is_current_tenant(tenant_id));
create policy persons_insert_within_tenant on public.persons for insert to authenticated
  with check (app.is_current_tenant(tenant_id));
create policy persons_update_within_tenant on public.persons for update to authenticated
  using (app.is_current_tenant(tenant_id)) with check (app.is_current_tenant(tenant_id));

drop policy if exists family_units_rw_within_tenant on public.family_units;
create policy family_units_rw_within_tenant on public.family_units for all to authenticated
  using (app.is_current_tenant(tenant_id)) with check (app.is_current_tenant(tenant_id));

drop policy if exists family_memberships_rw_within_tenant on public.family_memberships;
create policy family_memberships_rw_within_tenant on public.family_memberships for all to authenticated
  using (app.is_current_tenant(tenant_id)) with check (app.is_current_tenant(tenant_id));

drop policy if exists residences_rw_within_tenant on public.residences;
create policy residences_rw_within_tenant on public.residences for all to authenticated
  using (app.is_current_tenant(tenant_id)) with check (app.is_current_tenant(tenant_id));

drop policy if exists residence_memberships_rw_within_tenant on public.residence_memberships;
create policy residence_memberships_rw_within_tenant on public.residence_memberships for all to authenticated
  using (app.is_current_tenant(tenant_id)) with check (app.is_current_tenant(tenant_id));
