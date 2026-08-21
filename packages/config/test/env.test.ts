import { describe, expect, it } from 'vitest';
import { loadServerEnv } from '../src/env';

const validEnv = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

describe('loadServerEnv', () => {
  it('parses a valid minimal environment with sensible defaults', () => {
    const env = loadServerEnv(validEnv as NodeJS.ProcessEnv);
    expect(env.APP_ENV).toBe('development');
    expect(env.API_PORT).toBe(4000);
    expect(env.CORS_ALLOWED_ORIGINS).toEqual([]);
  });

  it('throws a clear error when SUPABASE_URL is missing', () => {
    expect(() => loadServerEnv({} as NodeJS.ProcessEnv)).toThrow(/Invalid environment configuration/);
  });

  it('splits CORS_ALLOWED_ORIGINS on commas', () => {
    const env = loadServerEnv({
      ...validEnv,
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000, http://localhost:8081',
    } as NodeJS.ProcessEnv);
    expect(env.CORS_ALLOWED_ORIGINS).toEqual(['http://localhost:3000', 'http://localhost:8081']);
  });
});
