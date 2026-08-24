-- A ZELII must distinguish a deliberate spoken confirmation from the normal
-- reviewed button flow.  The proposal still follows the same authorization,
-- revalidation, expiry and two-step execution rules.
alter table public.ai_action_proposals
  add column if not exists confirmation_method text not null default 'TEXT'
  check (confirmation_method in ('TEXT', 'VOICE'));
