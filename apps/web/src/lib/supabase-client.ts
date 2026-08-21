'use client';

import { createClient } from '@supabase/supabase-js';

/**
 * Browser-side Supabase client — anon key only, subject to RLS (§10).
 * Used directly for Auth (signUp/signInWithPassword/signOut), which is
 * the standard, most secure way to talk to Supabase Auth. All other data
 * access goes through apps/api (see api-client.ts), which additionally
 * enforces the Family Policy Engine.
 */
let client: ReturnType<typeof createClient> | null = null;

export function getSupabaseBrowserClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY não configurados. Veja .env.example.',
    );
  }
  client = createClient(url, anonKey);
  return client;
}
