import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createLogger } from '@family-app/observability';

// SUPABASE_* env vars are required by @family-app/config at module load
// time (loadServerEnv is called eagerly by SupabaseService). Set
// placeholder values so the app boots for this smoke test — no real
// network call happens for the routes exercised here.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'placeholder-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

describe('API boot smoke test', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module');
    const { HttpExceptionFilter } = await import('../src/common/http-exception.filter');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['/health'] });
    app.useGlobalFilters(new HttpExceptionFilter(createLogger({ name: 'api-test', level: 'silent' })));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('GET /health returns ok without authentication', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /api/v1/persons is rejected without a bearer token (§67)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/persons');
    expect(res.status).toBe(401);
    // Human-readable pt-BR message (§118), not a raw framework error.
    expect(res.body.error.message).toMatch(/sess(ã|a)o/i);
  });

  it('POST /api/v1/onboarding/bootstrap is rejected without a bearer token', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/onboarding/bootstrap').send({ displayName: 'Teste' });
    expect(res.status).toBe(401);
  });
});
