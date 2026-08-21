import type { PermissionAction, PermissionDomain, Role } from '@family-app/domain';

/**
 * RBAC baseline (master prompt §21-24). These are DEFAULT grants derived
 * purely from the role a Person holds in a FamilyUnit shared with the
 * subject. They are intentionally conservative for non-guardian roles —
 * anything beyond this baseline must be an explicit AuthorityGrant
 * (§25: "É proibido espalhar `if role === 'mother'`" — this table is the
 * ONE place role defaults live, everything else calls the engine).
 *
 * ASSUMPTION (documented per §128): the exact default matrix is a
 * product decision that a PM/DPO should review; this is a sensible,
 * privacy-conservative starting point (e.g. extended family and
 * caregivers never get FINANCE or DOCUMENTS by default).
 */
export const ROLE_DEFAULT_PERMISSIONS: Record<
  Role,
  { domains: PermissionDomain[]; actions: PermissionAction[] } | 'ALL' | 'NONE'
> = {
  FAMILY_OWNER: 'ALL',
  GUARDIAN: {
    domains: [
      'PROFILE',
      'SCHEDULE',
      'HEALTH',
      'MEDICATION',
      'VACCINATION',
      'SCHOOL',
      'DOCUMENTS',
      'FINANCE',
      'ACTIVITIES',
      'TRANSPORTATION',
      'CONTACTS',
      'NOTES',
      'LOCATION',
      'EMERGENCY',
      'AI',
    ],
    actions: ['VIEW', 'COMMENT', 'CREATE', 'EDIT', 'DELETE', 'MANAGE', 'SHARE'],
  },
  CO_GUARDIAN: {
    domains: [
      'PROFILE',
      'SCHEDULE',
      'HEALTH',
      'MEDICATION',
      'VACCINATION',
      'SCHOOL',
      'DOCUMENTS',
      'FINANCE',
      'ACTIVITIES',
      'TRANSPORTATION',
      'CONTACTS',
      'NOTES',
      'LOCATION',
      'EMERGENCY',
      'AI',
    ],
    actions: ['VIEW', 'COMMENT', 'CREATE', 'EDIT', 'DELETE', 'MANAGE', 'SHARE'],
  },
  // Deliberately EXCLUDES HEALTH, MEDICATION, EMERGENCY, FINANCE, and
  // DOCUMENTS from the standing default — a nanny/babysitter does not
  // get medical history just by being a caregiver. Those domains only
  // open up via an active CareWindow (see CARE_WINDOW_BASELINE below)
  // or an explicit AuthorityGrant (see the BABA preset in
  // permission-presets.ts, which adds EMERGENCY VIEW explicitly).
  CAREGIVER: {
    domains: ['SCHEDULE', 'SCHOOL', 'ACTIVITIES', 'TRANSPORTATION', 'CONTACTS', 'NOTES'],
    actions: ['VIEW', 'COMMENT', 'CREATE', 'EDIT'],
  },
  // Temporary caregivers get NOTHING from the role default alone — their
  // access is only ever active while inside an explicit CareWindow (see
  // CARE_WINDOW_ALLOW rule in policy-engine.ts).
  TEMPORARY_CAREGIVER: 'NONE',
  EXTENDED_FAMILY: {
    domains: ['SCHEDULE', 'SCHOOL', 'ACTIVITIES', 'CONTACTS', 'NOTES'],
    actions: ['VIEW', 'COMMENT'],
  },
  TEEN: {
    domains: ['PROFILE', 'SCHEDULE', 'SCHOOL', 'ACTIVITIES', 'NOTES', 'AI'],
    actions: ['VIEW', 'COMMENT', 'CREATE', 'EDIT'],
  },
  CHILD: 'NONE',
  PROFESSIONAL: 'NONE',
  EMERGENCY_ACCESS: {
    domains: ['EMERGENCY'],
    actions: ['VIEW'],
  },
  // Platform admins are out of scope for the family-level engine entirely
  // — see PLATFORM_ADMIN_OUT_OF_SCOPE rule and RUNBOOK.md's
  // Just-In-Time support access process (§117).
  PLATFORM_ADMIN: 'NONE',
};

export function roleGrantsPermission(
  role: Role,
  domain: PermissionDomain,
  action: PermissionAction,
): boolean {
  const entry = ROLE_DEFAULT_PERMISSIONS[role];
  if (entry === 'ALL') return true;
  if (entry === 'NONE') return false;
  return entry.domains.includes(domain) && entry.actions.includes(action);
}

/**
 * Baseline permissions available to ANY caregiver-role actor while they
 * hold an active CareWindow over the subject, regardless of their
 * FamilyMembership role (covers babysitters/temporary caregivers with no
 * standing role default). Deliberately excludes FINANCE, DOCUMENTS
 * MANAGE/DELETE/SHARE, and ADMIN actions.
 */
export const CARE_WINDOW_BASELINE: Array<{ domain: PermissionDomain; action: PermissionAction }> = [
  { domain: 'SCHEDULE', action: 'VIEW' },
  { domain: 'HEALTH', action: 'VIEW' },
  { domain: 'MEDICATION', action: 'VIEW' },
  { domain: 'MEDICATION', action: 'EDIT' }, // recording administration
  { domain: 'CONTACTS', action: 'VIEW' },
  { domain: 'EMERGENCY', action: 'VIEW' },
  { domain: 'ACTIVITIES', action: 'VIEW' },
  { domain: 'TRANSPORTATION', action: 'VIEW' },
];

/**
 * Extended Care Network — default delegation ability per role (adendo
 * §11-12), used as the fallback when a Person has no explicit
 * `DelegationPolicy` row. Conservative on purpose: nobody delegates by
 * default except the people who structurally carry accountability
 * (FAMILY_OWNER/GUARDIAN/CO_GUARDIAN). A caregiver who receives a
 * delegated responsibility gets `canRedelegate: true` at a shallow depth
 * so "Carlos can ask Maria" (§10 worked example) works out of the box,
 * while a nanny/babysitter (CAREGIVER/TEMPORARY_CAREGIVER) explicitly
 * cannot delegate at all (§11 worked example) unless a PM overrides it
 * with an explicit `DelegationPolicy` row later.
 */
export const ROLE_DEFAULT_DELEGATION_POLICY: Record<
  Role,
  { canDelegate: boolean; canRedelegate: boolean; maxDelegationDepth: number }
> = {
  FAMILY_OWNER: { canDelegate: true, canRedelegate: true, maxDelegationDepth: 3 },
  GUARDIAN: { canDelegate: true, canRedelegate: true, maxDelegationDepth: 3 },
  CO_GUARDIAN: { canDelegate: true, canRedelegate: true, maxDelegationDepth: 3 },
  CAREGIVER: { canDelegate: false, canRedelegate: false, maxDelegationDepth: 1 },
  TEMPORARY_CAREGIVER: { canDelegate: false, canRedelegate: false, maxDelegationDepth: 1 },
  EXTENDED_FAMILY: { canDelegate: false, canRedelegate: true, maxDelegationDepth: 2 },
  TEEN: { canDelegate: false, canRedelegate: false, maxDelegationDepth: 1 },
  CHILD: { canDelegate: false, canRedelegate: false, maxDelegationDepth: 0 },
  PROFESSIONAL: { canDelegate: false, canRedelegate: false, maxDelegationDepth: 1 },
  EMERGENCY_ACCESS: { canDelegate: false, canRedelegate: false, maxDelegationDepth: 0 },
  PLATFORM_ADMIN: { canDelegate: false, canRedelegate: false, maxDelegationDepth: 0 },
};

export function getDefaultDelegationPolicy(role: Role) {
  return ROLE_DEFAULT_DELEGATION_POLICY[role];
}
