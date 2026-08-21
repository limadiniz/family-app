-- ============================================================================
-- 0017: extend audit_events.event_type's check constraint for the new
-- V2 event types (Command Center / Universal Inbox / Request Engine,
-- §64). Never edit an already-applied migration file — this adds to the
-- existing constraint instead.
-- ============================================================================

alter table public.audit_events drop constraint audit_events_event_type_check;

alter table public.audit_events add constraint audit_events_event_type_check check (event_type in (
  'LOGIN', 'LOGOUT', 'VIEW_HEALTH', 'VIEW_DOCUMENT', 'CREATE_EVENT', 'UPDATE_MEDICATION',
  'ADMINISTER_MEDICATION', 'GRANT_PERMISSION', 'REVOKE_PERMISSION', 'SHARE_DOCUMENT',
  'EMERGENCY_ACCESS', 'AI_QUERY', 'AI_ACTION', 'EXPORT_DATA', 'DELETE_REQUEST',
  'PERSON_CREATED', 'FAMILY_UNIT_CREATED', 'FAMILY_MEMBER_ADDED', 'RELATIONSHIP_CREATED',
  'RESIDENCE_CREATED', 'INVITATION_SENT', 'INVITATION_ACCEPTED', 'POLICY_DECISION',
  'CALENDAR_EVENT_CREATED', 'TASK_CREATED', 'CAPTURE_ITEM_CREATED', 'CAPTURE_CONFIRMED',
  'CAPTURE_REJECTED', 'REQUEST_CREATED', 'REQUEST_ACCEPTED', 'REQUEST_DECLINED'
));
