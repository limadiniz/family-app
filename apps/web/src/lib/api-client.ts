'use client';

import { getSupabaseBrowserClient } from './supabase-client';
import { getStoredTenantId } from './tenant-context';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/**
 * True for a genuine Policy Engine authorization denial (`POLICY_DENIED`,
 * see apps/api's HttpExceptionFilter) — deliberately excludes
 * `ONBOARDING_REQUIRED`, which is also a `PolicyDeniedError` under the
 * hood but is its own state (`OnboardingGate`/`OnboardingRequiredState`),
 * not "you're not allowed to see this" (§8, P0.5).
 */
export function isPermissionDenied(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'POLICY_DENIED';
}

/**
 * Thin fetch wrapper that attaches the current Supabase session's access
 * token — every real data operation goes through apps/api (§54), never
 * directly against Postgres/PostgREST from the browser except via the
 * Auth calls in supabase-client.ts.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Seletor multi-família (§10/§68): o backend só honra este header se ele
  // corresponder a uma membership ACTIVE da própria conta (AuthGuard
  // rejeita qualquer outro valor) — nunca é, por si só, uma alegação de
  // autorização, só a preferência de qual família esta chamada é sobre.
  const tenantId = getStoredTenantId();

  const res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
      ...init.headers,
    },
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(body?.error?.message ?? 'Erro inesperado.', body?.error?.code ?? 'UNKNOWN', res.status);
  }
  return body as T;
}
