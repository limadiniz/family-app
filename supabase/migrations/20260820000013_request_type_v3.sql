-- ============================================================================
-- 0023 (adendo §16): extend requests.type for RESPONSIBILITY_ASSIGNMENT —
-- a ResponsibilityAssignment proposal reuses the Family Request Engine's
-- proposal/accept/decline machinery rather than duplicating it. Never edit
-- an already-applied migration file — this adds to the existing
-- constraint instead.
-- ============================================================================

alter table public.requests drop constraint requests_type_check;

alter table public.requests add constraint requests_type_check check (type in (
  'RESPONSIBILITY_TRANSFER', 'SCHEDULE_CHANGE', 'PICKUP_REQUEST', 'DROPOFF_REQUEST', 'RESIDENCE_CHANGE',
  'EXPENSE_APPROVAL', 'PERMISSION_REQUEST', 'DOCUMENT_REQUEST', 'INFORMATION_REQUEST',
  'RESPONSIBILITY_ASSIGNMENT', 'OTHER'
));
