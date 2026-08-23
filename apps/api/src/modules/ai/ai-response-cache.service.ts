import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  buildExactCacheDescriptor,
  type AuthorizedFact,
  type DecisionSignal,
  type EmbeddingProvider,
} from '@family-app/ai';
import { loadFeatureFlags, resolveAiCapabilityGate } from '@family-app/config';
import type { PermissionDomain } from '@family-app/domain';
import { z } from 'zod';
import type { RequestActor } from '../../common/auth.guard';
import { SupabaseService } from '../../common/supabase.service';
import { AI_CAPABILITY_READINESS } from './ai-capability-readiness';
import { AI_EMBEDDING_PROVIDER } from './ai-vector-indexer.service';

const cachedResponseSchema = z.object({
  answer: z.string().trim().min(1).max(4000),
  supportedFactIds: z.array(z.string().min(1).max(250)).max(60),
});

type CacheContext = {
  question: string;
  facts: AuthorizedFact[];
  signals: DecisionSignal[];
  allowedDomains: PermissionDomain[];
  promptVersion: string;
  modelVersion: string;
};

/**
 * Exact response cache. It is intentionally actor-, policy- and source-version
 * scoped. Cache failures never affect the answer path and the raw question is
 * never persisted.
 */
@Injectable()
export class AiResponseCacheService {
  constructor(
    private readonly supabase: SupabaseService,
    @Optional()
    @Inject(AI_EMBEDDING_PROVIDER)
    private readonly embeddingProvider?: EmbeddingProvider,
  ) {}

  async getExact(
    actor: RequestActor,
    input: CacheContext,
  ): Promise<{ answer: string; supportedFactIds: string[] } | null> {
    const startedAt = Date.now();
    const gate = resolveAiCapabilityGate(
      'EXACT_CACHE',
      loadFeatureFlags(),
      AI_CAPABILITY_READINESS.EXACT_CACHE,
    );
    if (gate.mode !== 'ENABLED' || !actor.tenantId || !actor.personId) return null;

    const descriptor = buildExactCacheDescriptor({
      tenantId: actor.tenantId,
      actorPersonId: actor.personId,
      ...input,
      locale: 'pt-BR',
      timeZone: process.env.APP_TIMEZONE ?? 'America/Sao_Paulo',
    });
    if (!descriptor) {
      await this.record(actor, 'SKIPPED', 'INELIGIBLE_CONTEXT', Date.now() - startedAt);
      return null;
    }

    try {
      const { data, error } = await this.supabase
        .serviceRole()
        .from('ai_response_cache')
        .select('response_payload, hit_count')
        .eq('tenant_id', actor.tenantId)
        .eq('actor_person_id', actor.personId)
        .eq('exact_key', descriptor.exactKey)
        .is('invalidated_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (error) throw new Error('EXACT_CACHE_READ_FAILED');
      if (!data) {
        await this.record(actor, 'MISS', undefined, Date.now() - startedAt);
        return null;
      }

      const parsed = cachedResponseSchema.safeParse(data.response_payload);
      const allowedFactIds = new Set(input.facts.map((fact) => fact.id));
      if (
        !parsed.success ||
        parsed.data.supportedFactIds.some((factId) => !allowedFactIds.has(factId))
      ) {
        await this.record(actor, 'REJECTED', 'STALE_OR_INVALID_PAYLOAD', Date.now() - startedAt);
        return null;
      }

      await this.supabase
        .serviceRole()
        .from('ai_response_cache')
        .update({ hit_count: Number(data.hit_count ?? 0) + 1 })
        .eq('tenant_id', actor.tenantId)
        .eq('actor_person_id', actor.personId)
        .eq('exact_key', descriptor.exactKey);
      await this.record(actor, 'HIT', undefined, Date.now() - startedAt);
      return parsed.data;
    } catch {
      await this.record(actor, 'ERROR', 'CACHE_READ_ERROR', Date.now() - startedAt);
      return null;
    }
  }

  async getSemantic(
    actor: RequestActor,
    input: CacheContext,
  ): Promise<{ answer: string; supportedFactIds: string[] } | null> {
    const startedAt = Date.now();
    const gate = resolveAiCapabilityGate(
      'SEMANTIC_CACHE',
      loadFeatureFlags(),
      AI_CAPABILITY_READINESS.SEMANTIC_CACHE,
    );
    if (gate.mode !== 'ENABLED' || !this.embeddingProvider || !actor.tenantId || !actor.personId) {
      return null;
    }
    const descriptor = buildExactCacheDescriptor({
      tenantId: actor.tenantId,
      actorPersonId: actor.personId,
      ...input,
      locale: 'pt-BR',
      timeZone: process.env.APP_TIMEZONE ?? 'America/Sao_Paulo',
    });
    if (!descriptor) return null;

    try {
      const [embedding] = await this.embeddingProvider.embed([input.question]);
      if (
        !embedding ||
        embedding.length !== this.embeddingProvider.dimensions ||
        embedding.some((value) => !Number.isFinite(value))
      ) {
        throw new Error('INVALID_CACHE_QUERY_EMBEDDING');
      }
      const { data, error } = await this.supabase.serviceRole().rpc('match_ai_semantic_cache', {
        p_tenant_id: actor.tenantId,
        p_actor_person_id: actor.personId,
        p_policy_fingerprint: descriptor.policyFingerprint,
        p_source_fingerprint: descriptor.sourceFingerprint,
        p_domains: descriptor.domains,
        p_prompt_version: input.promptVersion,
        p_model_version: input.modelVersion,
        p_locale: 'pt-BR',
        p_time_zone: process.env.APP_TIMEZONE ?? 'America/Sao_Paulo',
        p_query_embedding: JSON.stringify(embedding),
        p_embedding_model: this.embeddingProvider.model,
        p_limit: 1,
      });
      if (error) throw new Error('SEMANTIC_CACHE_READ_FAILED');
      const candidate = (
        data as Array<{ response_payload: unknown; distance: number }> | null
      )?.[0];
      const threshold = Math.min(
        0.15,
        Math.max(0.01, Number(process.env.AI_SEMANTIC_CACHE_MAX_DISTANCE ?? 0.08) || 0.08),
      );
      if (!candidate || Number(candidate.distance) > threshold) {
        await this.record(actor, 'MISS', undefined, Date.now() - startedAt, 'SEMANTIC');
        return null;
      }
      const parsed = cachedResponseSchema.safeParse(candidate.response_payload);
      const allowedFactIds = new Set(input.facts.map((fact) => fact.id));
      if (
        !parsed.success ||
        parsed.data.supportedFactIds.some((factId) => !allowedFactIds.has(factId))
      ) {
        await this.record(
          actor,
          'REJECTED',
          'STALE_OR_INVALID_PAYLOAD',
          Date.now() - startedAt,
          'SEMANTIC',
        );
        return null;
      }
      await this.record(actor, 'HIT', undefined, Date.now() - startedAt, 'SEMANTIC');
      return parsed.data;
    } catch {
      await this.record(actor, 'ERROR', 'CACHE_READ_ERROR', Date.now() - startedAt, 'SEMANTIC');
      return null;
    }
  }

  async putExact(
    actor: RequestActor,
    input: CacheContext,
    completion: { answer: string; supportedFactIds: string[] },
  ): Promise<void> {
    const startedAt = Date.now();
    const exactGate = resolveAiCapabilityGate(
      'EXACT_CACHE',
      loadFeatureFlags(),
      AI_CAPABILITY_READINESS.EXACT_CACHE,
    );
    const semanticGate = resolveAiCapabilityGate(
      'SEMANTIC_CACHE',
      loadFeatureFlags(),
      AI_CAPABILITY_READINESS.SEMANTIC_CACHE,
    );
    if (
      (exactGate.mode !== 'ENABLED' &&
        (semanticGate.mode !== 'ENABLED' || !this.embeddingProvider)) ||
      !actor.tenantId ||
      !actor.personId
    )
      return;

    const descriptor = buildExactCacheDescriptor({
      tenantId: actor.tenantId,
      actorPersonId: actor.personId,
      ...input,
      locale: 'pt-BR',
      timeZone: process.env.APP_TIMEZONE ?? 'America/Sao_Paulo',
    });
    if (!descriptor) return;

    const allowedFactIds = new Set(input.facts.map((fact) => fact.id));
    if (completion.supportedFactIds.some((factId) => !allowedFactIds.has(factId))) return;

    try {
      let queryEmbedding: number[] | null = null;
      let embeddingModel: string | null = null;
      if (semanticGate.mode === 'ENABLED' && this.embeddingProvider) {
        try {
          const [embedding] = await this.embeddingProvider.embed([input.question]);
          if (
            embedding &&
            embedding.length === this.embeddingProvider.dimensions &&
            embedding.every((value) => Number.isFinite(value))
          ) {
            queryEmbedding = embedding;
            embeddingModel = this.embeddingProvider.model;
          }
        } catch {
          if (exactGate.mode !== 'ENABLED') {
            await this.record(
              actor,
              'ERROR',
              'EMBEDDING_PROVIDER_ERROR',
              Date.now() - startedAt,
              'SEMANTIC',
            );
            return;
          }
        }
      }
      const ttlSeconds = Math.min(
        900,
        Math.max(30, Number(process.env.AI_EXACT_CACHE_TTL_SECONDS ?? 300) || 300),
      );
      const { error } = await this.supabase
        .serviceRole()
        .from('ai_response_cache')
        .upsert(
          {
            tenant_id: actor.tenantId,
            actor_person_id: actor.personId,
            exact_key: descriptor.exactKey,
            question_hash: descriptor.questionHash,
            policy_fingerprint: descriptor.policyFingerprint,
            source_fingerprint: descriptor.sourceFingerprint,
            subject_person_ids: descriptor.subjectPersonIds,
            domains: descriptor.domains,
            prompt_version: input.promptVersion,
            model_version: input.modelVersion,
            locale: 'pt-BR',
            time_zone: process.env.APP_TIMEZONE ?? 'America/Sao_Paulo',
            response_payload: completion,
            source_refs: descriptor.sourceRefs,
            query_embedding: queryEmbedding ? JSON.stringify(queryEmbedding) : null,
            embedding_model: embeddingModel,
            safety_classification: 'STANDARD',
            expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
            invalidated_at: null,
          },
          { onConflict: 'exact_key' },
        );
      if (error) throw new Error('EXACT_CACHE_WRITE_FAILED');
      await this.record(
        actor,
        'STORED',
        undefined,
        Date.now() - startedAt,
        queryEmbedding ? 'SEMANTIC' : 'EXACT',
      );
    } catch {
      await this.record(actor, 'ERROR', 'CACHE_WRITE_ERROR', Date.now() - startedAt);
    }
  }

  private async record(
    actor: RequestActor,
    outcome: 'HIT' | 'MISS' | 'SKIPPED' | 'REJECTED' | 'STORED' | 'ERROR',
    reasonCode: string | undefined,
    latencyMs: number,
    cacheType: 'EXACT' | 'SEMANTIC' = 'EXACT',
  ): Promise<void> {
    if (!actor.tenantId || !actor.personId) return;
    await this.supabase
      .forUser(actor.bearerToken)
      .from('ai_cache_events')
      .insert({
        tenant_id: actor.tenantId,
        actor_person_id: actor.personId,
        cache_type: cacheType,
        outcome,
        reason_code: reasonCode ?? null,
        latency_ms: Math.max(0, latencyMs),
      })
      .then(
        () => undefined,
        () => undefined,
      );
  }
}
