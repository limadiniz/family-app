import { z } from 'zod';

/**
 * Feature flags (§110). Source-of-truth for the MVP is environment
 * variables; a database-backed override (per-tenant flags, gradual
 * rollout) is a natural Phase 7+ upgrade — see ADR-0006.
 */
export const featureFlagsSchema = z.object({
  AI_ENABLED: z.boolean().default(false),
  AI_VECTOR_SEARCH_ENABLED: z.boolean().default(false),
  AI_VECTOR_SHADOW_ENABLED: z.boolean().default(false),
  AI_EXACT_CACHE_ENABLED: z.boolean().default(false),
  AI_SEMANTIC_CACHE_ENABLED: z.boolean().default(false),
  AI_MCP_READ_ENABLED: z.boolean().default(false),
  AI_MCP_PROPOSALS_ENABLED: z.boolean().default(false),
  AI_AGENT_LOOP_ENABLED: z.boolean().default(false),
  AI_FINE_TUNED_MODEL_ENABLED: z.boolean().default(false),
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
    // FF_AI_ENABLED is canonical. AI_ENABLED remains a backwards-compatible
    // alias while existing production environments are migrated.
    AI_ENABLED: envBool(env.FF_AI_ENABLED ?? env.AI_ENABLED, false),
    AI_VECTOR_SEARCH_ENABLED: envBool(env.FF_AI_VECTOR_SEARCH, false),
    AI_VECTOR_SHADOW_ENABLED: envBool(env.FF_AI_VECTOR_SHADOW, false),
    AI_EXACT_CACHE_ENABLED: envBool(env.FF_AI_EXACT_CACHE, false),
    AI_SEMANTIC_CACHE_ENABLED: envBool(env.FF_AI_SEMANTIC_CACHE, false),
    AI_MCP_READ_ENABLED: envBool(env.FF_AI_MCP_READ, false),
    AI_MCP_PROPOSALS_ENABLED: envBool(env.FF_AI_MCP_PROPOSALS, false),
    AI_AGENT_LOOP_ENABLED: envBool(env.FF_AI_AGENT_LOOP, false),
    AI_FINE_TUNED_MODEL_ENABLED: envBool(env.FF_AI_FINE_TUNED_MODEL, false),
    OCR_ENABLED: envBool(env.FF_OCR_ENABLED, false),
    FINANCE_ENABLED: envBool(env.FF_FINANCE_ENABLED, true),
    TEEN_ACCESS_ENABLED: envBool(env.FF_TEEN_ACCESS_ENABLED, true),
  });
}
