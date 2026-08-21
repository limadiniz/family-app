/**
 * Server-side JWT verification helpers for apps/api. Supabase issues a
 * standard JWT (HS256 in the MVP, matching the project's JWT secret;
 * ES256/JWKS-based verification is the recommended upgrade path once
 * project settings expose an asymmetric signing key — track in
 * ADR-0007). apps/api verifies every inbound request's Authorization
 * header itself rather than trusting a client-supplied user id, since
 * the client (web/mobile) is never trusted (§10).
 */
export interface AuthenticatedRequestContext {
  authUserId: string;
  email?: string;
}

export class InvalidTokenError extends Error {
  constructor(message = 'Invalid or expired session.') {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

/**
 * ASSUMPTION: apps/api verifies tokens via Supabase's `/auth/v1/user`
 * introspection endpoint (using the anon key + the caller's bearer token)
 * rather than local JWT signature verification, trading a small amount
 * of latency for zero key-rotation risk. Revisit once request volume
 * justifies local JWKS verification.
 */
export async function resolveAuthContext(
  bearerToken: string,
  opts: { supabaseUrl: string; supabaseAnonKey: string; fetchImpl?: typeof fetch },
): Promise<AuthenticatedRequestContext> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${opts.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: opts.supabaseAnonKey,
      Authorization: `Bearer ${bearerToken}`,
    },
  });
  if (!res.ok) {
    throw new InvalidTokenError();
  }
  const body = (await res.json()) as { id?: string; email?: string };
  if (!body.id) {
    throw new InvalidTokenError();
  }
  return { authUserId: body.id, email: body.email };
}
