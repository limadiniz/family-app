import { z } from 'zod';

/**
 * Feature flags (§110). Source-of-truth for the MVP is environment
 * variables; a database-backed override (per-tenant flags, gradual
 * rollout) is a natural Phase 7+ upgrade — see ADR-0006.
 */
export const featureFlagsSchema = z.object({
  AI_ENABLED: z.boolean().default(false),
  OCR_ENABLED: z.boolean().default(false),
  FINANCE_ENABLED: z.boolean().default(true),
  TEEN_ACCESS_ENABLED: z.boolean().default(true),
});
export type FeatureFlags = z.infer<typeof featureFlagsSchema>;

function envBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}

export function loadFeatureFlags(env: NodeJS.ProcessEnv = process.env): FeatureFlags {
  return featureFlagsSchema.parse({
    AI_ENABLED: envBool(env.FF_AI_ENABLED, false),
    OCR_ENABLED: envBool(env.FF_OCR_ENABLED, false),
    FINANCE_ENABLED: envBool(env.FF_FINANCE_ENABLED, true),
    TEEN_ACCESS_ENABLED: envBool(env.FF_TEEN_ACCESS_ENABLED, true),
  });
}
