import { z } from 'zod';
import { auditableFieldsSchema, uuidSchema } from '../common';

/**
 * User represents an authenticated identity (Supabase Auth `auth.users`
 * row mirrored into our schema). A User always links to exactly one
 * Person (`user.personId`), but a Person can exist without a User
 * (§14, §62 — e.g. small children).
 */
export const userSchema = z
  .object({
    id: uuidSchema, // == auth.users.id in Supabase
    tenantId: uuidSchema,
    personId: uuidSchema,
    email: z.string().email(),
    mfaEnabled: z.boolean().default(false),
    lastLoginAt: z.string().datetime({ offset: true }).nullable().optional(),
    status: z.enum(['PENDING_VERIFICATION', 'ACTIVE', 'DISABLED']).default('PENDING_VERIFICATION'),
  })
  .merge(auditableFieldsSchema);

export type User = z.infer<typeof userSchema>;

export const createUserInputSchema = z.object({
  tenantId: uuidSchema,
  personId: uuidSchema,
  email: z.string().email(),
});
export type CreateUserInput = z.infer<typeof createUserInputSchema>;
