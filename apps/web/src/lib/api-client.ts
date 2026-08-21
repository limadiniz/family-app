'use client';

import { getSupabaseBrowserClient } from './supabase-client';

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

  const res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...init.headers,
    },
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(body?.error?.message ?? 'Erro inesperado.', body?.error?.code ?? 'UNKNOWN', res.status);
  }
  return body as T;
}
