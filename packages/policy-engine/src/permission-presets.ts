import type { PermissionAction, PermissionDomain, PermissionPreset, Role } from '@family-app/domain';

/**
 * Invitation-time presets (§87). Selecting a preset proposes a Role AND
 * a starting set of explicit AuthorityGrants to materialize on
 * acceptance. Both remain fully editable afterwards by whoever has
 * MANAGE permission on PROFILE for the subject — never hardcoded
 * elsewhere in the app.
 */
export const PERMISSION_PRESETS: Record<
  PermissionPreset,
  { role: Role; grants: Array<{ domain: PermissionDomain; action: PermissionAction }> }
> = {
  RESPONSAVEL_COMPLETO: { role: 'GUARDIAN', grants: [] }, // role default already grants everything needed
  RESPONSAVEL_COMPARTILHADO: { role: 'CO_GUARDIAN', grants: [] },
  AVO_AVO: {
    role: 'EXTENDED_FAMILY',
    grants: [
      { domain: 'HEALTH', action: 'VIEW' },
      { domain: 'MEDICATION', action: 'VIEW' },
    ],
  },
  BABA: {
    role: 'CAREGIVER',
    grants: [{ domain: 'EMERGENCY', action: 'VIEW' }],
  },
  CUIDADOR_TEMPORARIO: {
    role: 'TEMPORARY_CAREGIVER',
    grants: [], // access exclusively through CareWindow while active
  },
  ADOLESCENTE: {
    role: 'TEEN',
    grants: [],
  },
  PROFISSIONAL: {
    role: 'PROFESSIONAL',
    grants: [{ domain: 'HEALTH', action: 'VIEW' }],
  },
};
