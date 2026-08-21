import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Thin, typed Supabase client factory.
 *
 * apps/web and apps/mobile MUST use `createAnonClient` (anon key, subject
 * to RLS). apps/api MAY use `createServiceRoleClient` for operations that
 * legitimately need to bypass RLS (e.g. the signup RPC, admin jobs) — and
 * only apps/api ever sees `SUPABASE_SERVICE_ROLE_KEY` (§10, §70).
 */
export function createAnonClient(supabaseUrl: string, anonKey: string): SupabaseClient {
  if (!supabaseUrl || !anonKey) {
    throw new Error('createAnonClient: supabaseUrl and anonKey are required (see .env.example).');
  }
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

export function createServiceRoleClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('createServiceRoleClient: supabaseUrl and serviceRoleKey are required.');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
