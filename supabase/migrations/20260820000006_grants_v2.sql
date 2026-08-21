-- ============================================================================
-- 0016: table-level grants for the `authenticated` role on every table
-- added in this phase — same rationale as 20260819000010_grants.sql.
-- request_actions gets no UPDATE/DELETE grant (immutable trail, belt and
-- suspenders on top of already having no UPDATE/DELETE policy).
-- ============================================================================

grant select, insert, update on public.calendar_events to authenticated;
grant select, insert, update on public.tasks to authenticated;
grant select, insert, update on public.routines to authenticated;
grant select, insert, update on public.routine_items to authenticated;
grant select, insert, update on public.checklists to authenticated;
grant select, insert, update on public.checklist_items to authenticated;

grant select, insert, update on public.capture_items to authenticated;
grant select, insert, update on public.capture_attachments to authenticated;
grant select, insert, update on public.capture_extractions to authenticated;
grant select, insert, update on public.capture_proposals to authenticated;

grant select, insert, update on public.requests to authenticated;
grant select, insert on public.request_actions to authenticated;

grant select, insert, update on public.health_profiles to authenticated;
grant select, insert, update on public.prescriptions to authenticated;
grant select, insert, update on public.medications to authenticated;
grant select, insert, update on public.medication_schedules to authenticated;
grant select, insert, update on public.medication_administrations to authenticated;
grant select, insert, update on public.emergency_profiles to authenticated;

grant select, insert, update on public.documents to authenticated;
grant select, insert, update on public.extracted_document_data to authenticated;
