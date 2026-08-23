import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiVectorIndexerService } from '../src/modules/ai/ai-vector-indexer.service';
import { AiVectorShadowService } from '../src/modules/ai/ai-vector-shadow.service';
import type { SupabaseService } from '../src/common/supabase.service';

afterEach(() => {
  delete process.env.FF_AI_ENABLED;
  delete process.env.FF_AI_VECTOR_SHADOW;
  delete process.env.FF_AI_VECTOR_SEARCH;
});

describe('AiVectorIndexerService rollout gate', () => {
  it('does not access the service-role database while the vector capability is disabled', async () => {
    const serviceRole = vi.fn();
    const service = new AiVectorIndexerService({ serviceRole } as unknown as SupabaseService);
    await expect(service.processPendingBatch('test-worker')).resolves.toEqual({
      status: 'DISABLED',
      processed: 0,
      missingRequirements: [],
    });
    expect(serviceRole).not.toHaveBeenCalled();
  });

  it('does not let shadow intent bypass provider, privacy and safety evidence', async () => {
    process.env.FF_AI_ENABLED = 'true';
    process.env.FF_AI_VECTOR_SHADOW = 'true';
    const serviceRole = vi.fn();
    const service = new AiVectorIndexerService({ serviceRole } as unknown as SupabaseService);
    const result = await service.processPendingBatch('test-worker');
    expect(result.status).toBe('BLOCKED');
    expect(result.missingRequirements).toEqual(
      expect.arrayContaining(['PROVIDER_APPROVED', 'PRIVACY_APPROVED', 'SAFETY_EVALUATED']),
    );
    expect(serviceRole).not.toHaveBeenCalled();
  });
});

describe('AiVectorShadowService rollout gate', () => {
  it('does not embed or query when shadow retrieval has not passed every gate', async () => {
    process.env.FF_AI_ENABLED = 'true';
    process.env.FF_AI_VECTOR_SHADOW = 'true';
    const forUser = vi.fn();
    const service = new AiVectorShadowService({ forUser } as unknown as SupabaseService);
    await service.evaluate({
      actor: {
        authUserId: 'auth-1',
        tenantId: 'tenant-1',
        personId: 'person-1',
        bearerToken: 'token',
      },
      question: 'O que a escola pediu?',
      subjectPersonIds: ['person-1'],
      domains: ['SCHOOL'],
      lexicalSourceRefs: [],
    });
    expect(forUser).not.toHaveBeenCalled();
  });
});
