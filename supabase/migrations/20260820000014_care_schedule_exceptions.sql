-- ============================================================================
-- 0024 (Prompt Mestre V3 §31): care_schedules gains explicit exception dates
-- and an opt-in BR-national-holiday exclusion flag — "recorrência, férias,
-- exceções, feriados". Additive only; existing rows default to "no
-- exceptions, don't exclude holidays", which preserves today's behavior.
-- ============================================================================

alter table public.care_schedules
  add column exceptions date[] not null default '{}',
  add column exclude_br_national_holidays boolean not null default false;
