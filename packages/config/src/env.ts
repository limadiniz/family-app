import { z } from 'zod';

/**
 * Shared, validated environment schema for apps/api (server-side only —
 * apps/web and apps/mobile validate their own NEXT_PUBLIC_ and EXPO_PUBLIC_
 * variables separately since those are the only vars safe to ship client-side).
 * Fails fast and loudly on boot rather than at first use (§71: backend is
 * the source of truth for validation).
 */
export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_APP_URL: z.string().url().default('http://localhost:3100'),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),

  AI_PROVIDER_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),

  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function loadServerEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  const parsed = serverEnvSchema.safeParse(env);
  if (!parsed.success) {
    // Deliberately verbose — this is a boot-time failure, not a request-time one.
    // eslint-disable-next-line no-console
    console.error('[config] Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration. See .env.example for the full list of required variables.');
  }
  return parsed.data;
}
