import { describe, expect, it, vi } from 'vitest';
import {
  VectorIndexingPipeline,
  chunkVectorText,
  compareVectorShadow,
  type EmbeddingProvider,
  type VectorIndexRepository,
  type VectorInvalidationEvent,
  type VectorSource,
} from '../src/vector-pipeline';

const event: VectorInvalidationEvent = {
  id: 'event-1',
  tenantId: 'tenant-1',
  subjectPersonId: 'person-1',
  domain: 'SCHOOL',
  sourceType: 'CAPTURE_ITEM',
  sourceId: 'source-1',
  sourceVersion: 2,
  eventType: 'UPSERT',
};

const source: VectorSource = {
  tenantId: 'tenant-1',
  subjectPersonId: 'person-1',
  domain: 'SCHOOL',
  sourceType: 'CAPTURE_ITEM',
  sourceId: 'source-1',
  sourceVersion: 2,
  text: 'A autorização para o passeio pedagógico precisa ser entregue amanhã.',
  sensitivity: 'PERSONAL',
  verificationStatus: 'CONFIRMED',
};

function setup(sourceResult: VectorSource | null = source) {
  const provider: EmbeddingProvider = {
    provider: 'test-only',
    model: 'deterministic-3d',
    dimensions: 3,
    embed: vi.fn().mockImplementation(async (texts: string[]) => texts.map(() => [1, 0, 0])),
  };
  const repository: VectorIndexRepository = {
    loadCurrentSource: vi.fn().mockResolvedValue(sourceResult),
    invalidateSource: vi.fn().mockResolvedValue(undefined),
    replaceSourceChunks: vi.fn().mockResolvedValue(undefined),
    completeEvent: vi.fn().mockResolvedValue(undefined),
    failEvent: vi.fn().mockResolvedValue(undefined),
  };
  return { provider, repository, pipeline: new VectorIndexingPipeline(provider, repository) };
}

describe('vector indexing pipeline', () => {
  it('chunks deterministically with stable SHA-256 content hashes', () => {
    const first = chunkVectorText('  comunicado   da escola '.repeat(20), {
      maxCharacters: 120,
      overlapCharacters: 20,
    });
    const second = chunkVectorText('comunicado da escola '.repeat(20), {
      maxCharacters: 120,
      overlapCharacters: 20,
    });
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(1);
    expect(first.every((chunk) => /^[0-9a-f]{64}$/.test(chunk.contentHash))).toBe(true);
  });

  it('indexes an allowed current source and completes the event', async () => {
    const { pipeline, repository } = setup();
    await expect(pipeline.process(event)).resolves.toBe('INDEXED');
    expect(repository.replaceSourceChunks).toHaveBeenCalledWith(
      expect.objectContaining({
        event,
        source,
        chunks: [expect.objectContaining({ embedding: [1, 0, 0] })],
      }),
    );
    expect(repository.completeEvent).toHaveBeenCalledWith(event.id);
  });

  it('does not embed sensitive or stale sources', async () => {
    const sensitive = { ...source, domain: 'HEALTH' as const, sensitivity: 'SENSITIVE' as const };
    const { pipeline, provider, repository } = setup(sensitive);
    await expect(pipeline.process({ ...event, domain: 'HEALTH' })).resolves.toBe('SKIPPED');
    expect(provider.embed).not.toHaveBeenCalled();
    expect(repository.invalidateSource).toHaveBeenCalled();
  });

  it('invalidates a delete without loading or embedding content', async () => {
    const { pipeline, provider, repository } = setup();
    await expect(pipeline.process({ ...event, eventType: 'DELETE' })).resolves.toBe('DELETED');
    expect(repository.loadCurrentSource).not.toHaveBeenCalled();
    expect(provider.embed).not.toHaveBeenCalled();
    expect(repository.invalidateSource).toHaveBeenCalled();
  });

  it('fails closed when a provider returns the wrong dimensions', async () => {
    const { pipeline, provider, repository } = setup();
    vi.mocked(provider.embed).mockResolvedValue([[1, 0]]);
    await expect(pipeline.process(event)).rejects.toThrow('INVALID_EMBEDDING_RESPONSE');
    expect(repository.replaceSourceChunks).not.toHaveBeenCalled();
    expect(repository.failEvent).toHaveBeenCalledWith(event.id, 'INVALID_EMBEDDING_RESPONSE');
  });
});

describe('vector shadow comparison', () => {
  it('measures overlap and produces a deterministic fused ranking', () => {
    expect(compareVectorShadow(['a', 'b'], ['b', 'c'])).toEqual({
      lexicalCandidateCount: 2,
      vectorCandidateCount: 2,
      overlapCount: 1,
      fused: [
        { sourceRef: 'b', rank: 1 },
        { sourceRef: 'a', rank: 2 },
        { sourceRef: 'c', rank: 3 },
      ],
    });
  });
});
