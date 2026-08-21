-- ============================================================================
-- 0020 (adendo §1): extend relationships.relationship_type for the
-- Extended Care Network (tio/tia, padrinho/madrinha, pessoa de confiança,
-- profissional, motorista autorizado). Never edit an already-applied
-- migration file — this adds to the existing constraint instead.
-- ============================================================================

alter table public.relationships drop constraint relationships_relationship_type_check;

alter table public.relationships add constraint relationships_relationship_type_check check (relationship_type in (
  'PARENT', 'STEPPARENT', 'GUARDIAN', 'GRANDPARENT', 'SIBLING', 'HALF_SIBLING',
  'CAREGIVER', 'SPOUSE_PARTNER', 'AUNT_UNCLE', 'GODPARENT', 'TRUSTED_PERSON',
  'PROFESSIONAL', 'AUTHORIZED_DRIVER', 'OTHER'
));
