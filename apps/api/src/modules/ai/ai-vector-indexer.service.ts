import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  VectorIndexingPipeline,
  type EmbeddedChunk,
  type EmbeddingProvider,
  type VectorIndexRepository,
  type VectorInvalidationEvent,
  type VectorSource,
} from '@family-app/ai';
import { loadFeatureFlags, resolveAiCapabilityGate } from '@family-app/config';
import type { PermissionDomain } from '@family-app/domain';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../../common/supabase.service';
import { AI_CAPABILITY_READINESS } from './ai-capability-readiness';

export const AI_EMBEDDING_PROVIDER = Symbol('AI_EMBEDDING_PROVIDER');

type InvalidationRow = {
  id: string;
  tenant_id: string;
  subject_person_id: string | null;
  domain: PermissionDomain;
  source_type: VectorInvalidationEvent['sourceType'];
  source_id: string;
  source_version: number;
  event_type: VectorInvalidationEvent['eventType'];
};

function toEvent(row: InvalidationRow): VectorInvalidationEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    subjectPersonId: row.subject_person_id,
    domain: row.domain,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceVersion: Number(row.source_version),
    eventType: row.event_type,
  };
}

function captureSensitivity(category: string | null): VectorSource['sensitivity'] {
  if (!category || category.startsWith('MEDICAL_') || category === 'DOCUMENT') return 'SENSITIVE';
  return 'PERSONAL';
}

function domainSensitivity(domain: PermissionDomain): VectorSource['sensitivity'] {
  return ['HEALTH', 'MEDICATION', 'VACCINATION', 'EMERGENCY', 'FINANCE'].includes(domain)
    ? 'SENSITIVE'
    : 'PERSONAL';
}

export class SupabaseVectorIndexRepository implements VectorIndexRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly workerId: string,
  ) {}

  async loadCurrentSource(event: VectorInvalidationEvent): Promise<VectorSource | null> {
    if (event.sourceType === 'CAPTURE_ITEM') {
      const { data, error } = await this.client
        .from('capture_items')
        .select(
          'id, tenant_id, subject_person_id, raw_text, category, status, ai_index_version, deleted_at',
        )
        .eq('id', event.sourceId)
        .eq('tenant_id', event.tenantId)
        .maybeSingle();
      if (error) throw new Error('VECTOR_SOURCE_LOAD_FAILED');
      if (
        !data ||
        data.deleted_at ||
        !data.subject_person_id ||
        !data.raw_text ||
        !['READY', 'CONFIRMED'].includes(data.status as string)
      ) {
        return null;
      }
      return {
        tenantId: data.tenant_id as string,
        subjectPersonId: data.subject_person_id as string,
        domain: event.domain,
        sourceType: event.sourceType,
        sourceId: data.id as string,
        sourceVersion: Number(data.ai_index_version),
        text: data.raw_text as string,
        sensitivity: captureSensitivity((data.category as string | null) ?? null),
        verificationStatus: data.status === 'CONFIRMED' ? 'CONFIRMED' : 'EXTRACTED',
      };
    }

    if (event.sourceType === 'AI_MEMORY_ITEM') {
      const { data, error } = await this.client
        .from('ai_memory_items')
        .select(
          'id, tenant_id, subject_person_id, domain, summary, verification_status, ai_index_version, revoked_at',
        )
        .eq('id', event.sourceId)
        .eq('tenant_id', event.tenantId)
        .maybeSingle();
      if (error) throw new Error('VECTOR_SOURCE_LOAD_FAILED');
      if (!data || data.revoked_at || data.verification_status !== 'CONFIRMED') return null;
      const domain = data.domain as PermissionDomain;
      return {
        tenantId: data.tenant_id as string,
        subjectPersonId: data.subject_person_id as string,
        domain,
        sourceType: event.sourceType,
        sourceId: data.id as string,
        sourceVersion: Number(data.ai_index_version),
        text: data.summary as string,
        sensitivity: domainSensitivity(domain),
        verificationStatus: 'CONFIRMED',
      };
    }

    // Document extraction remains closed until a reviewed text extraction and
    // sensitivity-classification pipeline exists.
    return null;
  }

  async invalidateSource(event: VectorInvalidationEvent): Promise<void> {
    const { error } = await this.client
      .from('ai_content_chunks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('tenant_id', event.tenantId)
      .eq('source_type', event.sourceType)
      .eq('source_id', event.sourceId)
      .is('deleted_at', null);
    if (error) throw new Error('VECTOR_INVALIDATION_FAILED');
  }

  async replaceSourceChunks(input: {
    event: VectorInvalidationEvent;
    source: VectorSource;
    provider: Pick<EmbeddingProvider, 'provider' | 'model' | 'dimensions'>;
    chunks: EmbeddedChunk[];
  }): Promise<void> {
    const { error } = await this.client.rpc('replace_ai_content_chunks', {
      p_event_id: input.event.id,
      p_worker_id: this.workerId,
      p_embedding_provider: input.provider.provider,
      p_embedding_model: input.provider.model,
      p_embedding_dimensions: input.provider.dimensions,
      p_sensitivity: input.source.sensitivity,
      p_verification_status: input.source.verificationStatus,
      p_chunks: input.chunks,
    });
    if (error) throw new Error('VECTOR_CHUNK_REPLACE_FAILED');
  }

  async completeEvent(eventId: string): Promise<void> {
    const { error } = await this.client.rpc('complete_ai_invalidation_event', {
      p_event_id: eventId,
      p_worker_id: this.workerId,
    });
    if (error) throw new Error('VECTOR_EVENT_COMPLETE_FAILED');
  }

  async failEvent(eventId: string, errorCode: string): Promise<void> {
    const { error } = await this.client.rpc('fail_ai_invalidation_event', {
      p_event_id: eventId,
      p_worker_id: this.workerId,
      p_error_code: errorCode,
      p_retry_seconds: 60,
    });
    if (error) throw new Error('VECTOR_EVENT_FAIL_FAILED');
  }
}

@Injectable()
export class AiVectorIndexerService {
  constructor(
    private readonly supabase: SupabaseService,
    @Optional() @Inject(AI_EMBEDDING_PROVIDER) private readonly provider?: EmbeddingProvider,
  ) {}

  async processPendingBatch(workerId: string, limit = 20) {
    const flags = loadFeatureFlags();
    const gate = resolveAiCapabilityGate(
      'VECTOR_SEARCH',
      flags,
      AI_CAPABILITY_READINESS.VECTOR_SEARCH,
    );
    if (gate.mode !== 'SHADOW' && gate.mode !== 'ENABLED') {
      return {
        status: gate.mode,
        processed: 0,
        missingRequirements: gate.missingRequirements,
      } as const;
    }
    if (!this.provider) {
      return {
        status: 'BLOCKED',
        processed: 0,
        missingRequirements: ['EMBEDDING_PROVIDER_NOT_CONFIGURED'],
      } as const;
    }

    const client = this.supabase.serviceRole();
    const { data, error } = await client.rpc('claim_ai_invalidation_events', {
      p_worker_id: workerId,
      p_limit: Math.min(Math.max(Math.floor(limit), 1), 100),
    });
    if (error) throw new Error('VECTOR_EVENT_CLAIM_FAILED');

    const repository = new SupabaseVectorIndexRepository(client, workerId);
    const pipeline = new VectorIndexingPipeline(this.provider, repository);
    const results: Array<{ eventId: string; outcome: string }> = [];
    for (const row of (data ?? []) as InvalidationRow[]) {
      const event = toEvent(row);
      try {
        results.push({ eventId: event.id, outcome: await pipeline.process(event) });
      } catch {
        results.push({ eventId: event.id, outcome: 'FAILED' });
      }
    }
    return { status: gate.mode, processed: results.length, results } as const;
  }
}
