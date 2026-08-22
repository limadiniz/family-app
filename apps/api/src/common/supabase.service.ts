import { Injectable } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadServerEnv } from '@family-app/config';

/**
 * Central factory for Supabase clients used inside apps/api.
 *
 * - `forUser(bearerToken)` returns a client that forwards the caller's own
 *   JWT to PostgREST, so every query runs AS THAT USER and is subject to
 *   RLS — this is how the API gets tenant isolation "for free" on top of
 *   the Policy Engine's business-level checks (defense in depth, §10).
 * - `serviceRole()` bypasses RLS entirely and is used ONLY for the small
 *   set of operations that must legitimately act before a user row
 *   exists (onboarding bootstrap) or for background jobs. The service
 *   role key never leaves this process (§10, §70) — apps/web and
 *   apps/mobile never receive it.
 */
@Injectable()
export class SupabaseService {
  private readonly env = loadServerEnv();

  anonymous(): SupabaseClient {
    return createClient(this.env.SUPABASE_URL, this.env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  forUser(bearerToken: string): SupabaseClient {
    return createClient(this.env.SUPABASE_URL, this.env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${bearerToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  serviceRole(): SupabaseClient {
    return createClient(this.env.SUPABASE_URL, this.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  get anonKey() {
    return this.env.SUPABASE_ANON_KEY;
  }

  get url() {
    return this.env.SUPABASE_URL;
  }

  get webAppUrl() {
    return this.env.WEB_APP_URL.replace(/\/$/, '');
  }
}
