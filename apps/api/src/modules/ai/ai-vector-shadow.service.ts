import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  VECTOR_SHADOW_ALLOWED_DOMAINS,
  compareVectorShadow,
  type EmbeddingProvider,
} from '@family-app/ai';
import { loadFeatureFlags, resolveAiCapabilityGate } from '@family-app/config';
import type { PermissionDomain } from '@family-app/domain';
import type { RequestActor } from '../../common/auth.guard';
import { SupabaseService } from '../../common/supabase.service';
import { AI_CAPABILITY_READINESS } from './ai-capability-readiness';
import { AI_EMBEDDING_PROVIDER } from './ai-vector-indexer.service';

type VectorMatchRow = {
  source_type: string;
  source_id: string;
};

/**
 * Evaluates vector retrieval without adding its results to the model context.
 * Every error is contained and reported only as metadata; the user-facing
 * lexical/deterministic answer is never delayed or replaced by shadow output.
 */
@Injectable()
export class AiVectorShadowService {
  constructor(
    private readonly supabase: SupabaseService,
    @Optional() @Inject(AI_EMBEDDING_PROVIDER) private readonly provider?: EmbeddingProvider,
  ) {}

  async evaluate(input: {
    actor: RequestActor;
    question: string;
    subjectPersonIds: string[];
    domains: PermissionDomain[];
    lexicalSourceRefs: string[];
  }): Promise<void> {
    const gate = resolveAiCapabilityGate(
      'VECTOR_SEARCH',
      loadFeatureFlags(),
      AI_CAPABILITY_READINESS.VECTOR_SEARCH,
    );
    if (gate.mode !== 'SHADOW' || !this.provider || !input.actor.tenantId || !input.actor.personId)
      return;

    const domains = [...new Set(input.domains)];
    if (
      domains.length === 0 ||
      domains.some((domain) => !VECTOR_SHADOW_ALLOWED_DOMAINS.has(domain))
    )
      return;

    const startedAt = Date.now();
    const client = this.supabase.forUser(input.actor.bearerToken);
    try {
      const [embedding] = await this.provider.embed([input.question]);
      if (
        !embedding ||
        embedding.length !== this.provider.dimensions ||
        embedding.some((value) => !Number.isFinite(value))
      ) {
        throw new Error('INVALID_QUERY_EMBEDDING');
      }

      const { data, error } = await client.rpc('match_ai_content_chunks', {
        p_tenant_id: input.actor.tenantId,
        p_subject_person_ids: input.subjectPersonIds,
        p_domains: domains,
        p_query_embedding: JSON.stringify(embedding),
        p_embedding_model: this.provider.model,
        p_limit: 20,
      });
      if (error) throw new Error('VECTOR_SHADOW_QUERY_FAILED');

      const vectorSourceRefs = ((data ?? []) as VectorMatchRow[]).map(
        (row) => `${row.source_type}:${row.source_id}`,
      );
      const comparison = compareVectorShadow(input.lexicalSourceRefs, vectorSourceRefs);
      await this.record(client, input.actor, {
        mode: 'HYBRID_SHADOW',
        embeddingModel: this.provider.model,
        ...comparison,
        latencyMs: Date.now() - startedAt,
        outcome: 'SUCCESS',
      });
    } catch (error) {
      await this.record(client, input.actor, {
        mode: 'VECTOR_SHADOW',
        embeddingModel: this.provider.model,
        lexicalCandidateCount: input.lexicalSourceRefs.length,
        vectorCandidateCount: 0,
        overlapCount: 0,
        latencyMs: Date.now() - startedAt,
        outcome: 'ERROR',
        errorCode: error instanceof Error ? error.message : 'VECTOR_SHADOW_UNKNOWN_ERROR',
      }).catch(() => undefined);
    }
  }

  private async record(
    client: ReturnType<SupabaseService['forUser']>,
    actor: RequestActor,
    input: {
      mode: 'VECTOR_SHADOW' | 'HYBRID_SHADOW';
      embeddingModel: string;
      lexicalCandidateCount: number;
      vectorCandidateCount: number;
      overlapCount: number;
      latencyMs: number;
      outcome: 'SUCCESS' | 'ERROR';
      errorCode?: string;
    },
  ) {
    const { error } = await client.from('ai_retrieval_runs').insert({
      tenant_id: actor.tenantId,
      actor_person_id: actor.personId,
      mode: input.mode,
      embedding_model: input.embeddingModel,
      lexical_candidate_count: input.lexicalCandidateCount,
      vector_candidate_count: input.vectorCandidateCount,
      overlap_count: input.overlapCount,
      latency_ms: input.latencyMs,
      outcome: input.outcome,
      error_code: input.errorCode ?? null,
    });
    if (error) throw new Error('VECTOR_SHADOW_TELEMETRY_FAILED');
  }
}
