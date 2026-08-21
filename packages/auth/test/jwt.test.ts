import { describe, expect, it, vi } from 'vitest';
import { InvalidTokenError, resolveAuthContext } from '../src/jwt';

describe('resolveAuthContext', () => {
  it('returns the authenticated user id on a valid token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'user-1', email: 'a@example.com' }),
    });
    const ctx = await resolveAuthContext('token', {
      supabaseUrl: 'https://x.supabase.co',
      supabaseAnonKey: 'anon',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(ctx.authUserId).toBe('user-1');
  });

  it('throws InvalidTokenError on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    await expect(
      resolveAuthContext('bad', {
        supabaseUrl: 'https://x.supabase.co',
        supabaseAnonKey: 'anon',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(InvalidTokenError);
  });
});
