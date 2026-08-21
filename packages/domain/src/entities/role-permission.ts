import { z } from 'zod';

/**
 * RBAC roles (master prompt §21). Roles are assigned per FamilyMembership
 * — the same Person can be GUARDIAN in one FamilyUnit and EXTENDED_FAMILY
 * in another.
 */
export const roleSchema = z.enum([
  'FAMILY_OWNER',
  'GUARDIAN',
  'CO_GUARDIAN',
  'CAREGIVER',
  'TEMPORARY_CAREGIVER',
  'EXTENDED_FAMILY',
  'TEEN',
  'CHILD',
  'PROFESSIONAL',
  'EMERGENCY_ACCESS',
  'PLATFORM_ADMIN',
]);
export type Role = z.infer<typeof roleSchema>;

/** Permission domains (§23). */
export const permissionDomainSchema = z.enum([
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
  'AUDIT',
]);
export type PermissionDomain = z.infer<typeof permissionDomainSchema>;

/** Permission actions (§24). */
export const permissionActionSchema = z.enum([
  'VIEW',
  'COMMENT',
  'CREATE',
  'EDIT',
  'DELETE',
  'MANAGE',
  'SHARE',
  'ADMIN',
]);
export type PermissionAction = z.infer<typeof permissionActionSchema>;

export const permissionSchema = z.object({
  domain: permissionDomainSchema,
  action: permissionActionSchema,
});
export type Permission = z.infer<typeof permissionSchema>;

/**
 * Permission presets used at invitation time (§87). These are starting
 * points only — every grant is stored explicitly and can be edited
 * subject to the inviter's own authority (never self-escalated).
 */
export const permissionPresetSchema = z.enum([
  'RESPONSAVEL_COMPLETO',
  'RESPONSAVEL_COMPARTILHADO',
  'AVO_AVO',
  'BABA',
  'CUIDADOR_TEMPORARIO',
  'ADOLESCENTE',
  'PROFISSIONAL',
]);
export type PermissionPreset = z.infer<typeof permissionPresetSchema>;
