import { z } from 'zod';
import { auditableFieldsSchema, uuidSchema } from '../common';

/**
 * A child may have several residences (mother's house, father's house,
 * grandparents'). §16: "Residência principal não concede autoridade
 * automaticamente" — ResidenceMembership is purely locational/logistic,
 * never a source of permission by itself.
 */
export const residenceSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    label: z.string().min(1).max(150), // e.g. "Casa da mãe"
    addressLine: z.string().max(300).nullable().optional(),
    city: z.string().max(120).nullable().optional(),
    state: z.string().max(2).nullable().optional(), // UF
    postalCode: z.string().max(9).nullable().optional(), // CEP, formatted client-side
    timezone: z.string().default('America/Sao_Paulo'),
  })
  .merge(auditableFieldsSchema);
export type Residence = z.infer<typeof residenceSchema>;

export const residenceMembershipSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    residenceId: uuidSchema,
    personId: uuidSchema,
    isPrimary: z.boolean().default(false),
  })
  .merge(auditableFieldsSchema);
export type ResidenceMembership = z.infer<typeof residenceMembershipSchema>;

export const createResidenceInputSchema = residenceSchema.pick({
  tenantId: true,
  label: true,
  addressLine: true,
  city: true,
  state: true,
  postalCode: true,
  timezone: true,
});
export type CreateResidenceInput = z.infer<typeof createResidenceInputSchema>;
