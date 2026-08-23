import { createHash } from 'node:crypto';
import type { PermissionDomain } from '@family-app/domain';

export type VectorSourceType = 'CAPTURE_ITEM' | 'AI_MEMORY_ITEM' | 'DOCUMENT_EXTRACTION';
export type VectorSensitivity = 'PERSONAL' | 'SENSITIVE';

export type VectorInvalidationEvent = {
  id: string;
  tenantId: string;
  subjectPersonId: string | null;
  domain: PermissionDomain;
  sourceType: VectorSourceType;
  sourceId: string;
  sourceVersion: number;
  eventType: 'UPSERT' | 'DELETE';
};

export type VectorSource = {
  tenantId: string;
  subjectPersonId: string;
  domain: PermissionDomain;
  sourceType: VectorSourceType;
  sourceId: string;
  sourceVersion: number;
  text: string;
  sensitivity: VectorSensitivity;
  verificationStatus: 'DECLARED' | 'EXTRACTED' | 'CONFIRMED';
};

export type EmbeddedChunk = {
  chunkIndex: number;
  contentText: string;
  contentHash: string;
  embedding: number[];
};

export interface EmbeddingProvider {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export interface VectorIndexRepository {
  loadCurrentSource(event: VectorInvalidationEvent): Promise<VectorSource | null>;
  invalidateSource(event: VectorInvalidationEvent): Promise<void>;
  replaceSourceChunks(input: {
    event: VectorInvalidationEvent;
    source: VectorSource;
    provider: Pick<EmbeddingProvider, 'provider' | 'model' | 'dimensions'>;
    chunks: EmbeddedChunk[];
  }): Promise<void>;
  completeEvent(eventId: string): Promise<void>;
  failEvent(eventId: string, errorCode: string): Promise<void>;
}

export const VECTOR_SHADOW_ALLOWED_DOMAINS: ReadonlySet<PermissionDomain> = new Set([
  'SCHOOL',
  'DOCUMENTS',
  'ACTIVITIES',
  'NOTES',
]);

export function chunkVectorText(
  value: string,
  options: { maxCharacters?: number; overlapCharacters?: number } = {},
): Array<{ chunkIndex: number; contentText: string; contentHash: string }> {
  const maxCharacters = options.maxCharacters ?? 1200;
  const overlapCharacters = options.overlapCharacters ?? 150;
  if (maxCharacters < 100 || overlapCharacters < 0 || overlapCharacters >= maxCharacters) {
    throw new Error('INVALID_CHUNKING_CONFIGURATION');
  }

  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return [];

  const chunks: Array<{ chunkIndex: number; contentText: string; contentHash: string }> = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxCharacters, text.length);
    if (end < text.length) {
      const wordBoundary = text.lastIndexOf(' ', end);
      if (wordBoundary > start + Math.floor(maxCharacters / 2)) end = wordBoundary;
    }
    const contentText = text.slice(start, end).trim();
    if (contentText) {
      chunks.push({
        chunkIndex: chunks.length,
        contentText,
        contentHash: createHash('sha256').update(contentText, 'utf8').digest('hex'),
      });
    }
    if (end >= text.length) break;
    start = Math.max(end - overlapCharacters, start + 1);
  }
  return chunks;
}

export function isVectorSourceAllowed(source: VectorSource): boolean {
  return source.sensitivity === 'PERSONAL' && VECTOR_SHADOW_ALLOWED_DOMAINS.has(source.domain);
}

export class VectorIndexingPipeline {
  constructor(
    private readonly provider: EmbeddingProvider,
    private readonly repository: VectorIndexRepository,
  ) {}

  async process(event: VectorInvalidationEvent): Promise<'INDEXED' | 'DELETED' | 'SKIPPED'> {
    try {
      if (event.eventType === 'DELETE') {
        await this.repository.invalidateSource(event);
        await this.repository.completeEvent(event.id);
        return 'DELETED';
      }

      const source = await this.repository.loadCurrentSource(event);
      if (
        !source ||
        source.sourceVersion !== event.sourceVersion ||
        !isVectorSourceAllowed(source)
      ) {
        await this.repository.invalidateSource(event);
        await this.repository.completeEvent(event.id);
        return 'SKIPPED';
      }

      const chunks = chunkVectorText(source.text);
      if (chunks.length === 0) {
        await this.repository.invalidateSource(event);
        await this.repository.completeEvent(event.id);
        return 'SKIPPED';
      }

      const embeddings = await this.provider.embed(chunks.map((chunk) => chunk.contentText));
      if (
        embeddings.length !== chunks.length ||
        embeddings.some(
          (embedding) =>
            embedding.length !== this.provider.dimensions ||
            embedding.some((value) => !Number.isFinite(value)),
        )
      ) {
        throw new Error('INVALID_EMBEDDING_RESPONSE');
      }

      await this.repository.replaceSourceChunks({
        event,
        source,
        provider: this.provider,
        chunks: chunks.map((chunk, index) => ({ ...chunk, embedding: embeddings[index]! })),
      });
      await this.repository.completeEvent(event.id);
      return 'INDEXED';
    } catch (error) {
      await this.repository.failEvent(
        event.id,
        error instanceof Error ? error.message : 'UNKNOWN_INDEXING_ERROR',
      );
      throw error;
    }
  }
}

export type RankedSource = { sourceRef: string; rank: number };

export function compareVectorShadow(
  lexicalSourceRefs: string[],
  vectorSourceRefs: string[],
): {
  lexicalCandidateCount: number;
  vectorCandidateCount: number;
  overlapCount: number;
  fused: RankedSource[];
} {
  const lexical = [...new Set(lexicalSourceRefs)];
  const vector = [...new Set(vectorSourceRefs)];
  const overlapCount = lexical.filter((sourceRef) => vector.includes(sourceRef)).length;
  const scores = new Map<string, number>();
  for (const ranking of [lexical, vector]) {
    ranking.forEach((sourceRef, index) => {
      scores.set(sourceRef, (scores.get(sourceRef) ?? 0) + 1 / (60 + index + 1));
    });
  }
  const fused = [...scores.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([sourceRef], index) => ({ sourceRef, rank: index + 1 }));
  return {
    lexicalCandidateCount: lexical.length,
    vectorCandidateCount: vector.length,
    overlapCount,
    fused,
  };
}
