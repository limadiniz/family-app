import { z } from 'zod';
import { auditableFieldsSchema, uuidSchema } from '../common';

/**
 * Tenant is the top-level isolation boundary. In the MVP a Tenant maps
 * 1:1 with "the platform account that owns a set of Family Units", which
 * in practice is created automatically for every new signup. Keeping a
 * distinct Tenant concept (rather than keying everything off FamilyUnit)
 * leaves room for future B2B2C scenarios (e.g. a school or clinic
 * operating multiple family relationships under one contract) without a
 * migration.
 */
export const tenantSchema = z
  .object({
    id: uuidSchema,
    name: z.string().min(1).max(200),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING_DELETION']).default('ACTIVE'),
  })
  .merge(auditableFieldsSchema);

export type Tenant = z.infer<typeof tenantSchema>;
