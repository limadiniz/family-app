import { Injectable } from '@nestjs/common';
import type { RequestActor } from '../../common/auth.guard';
import { SupabaseService } from '../../common/supabase.service';

export type AiMetricType =
  | 'SUGGESTION_DISPLAYED'
  | 'SUGGESTION_ACCEPTED'
  | 'SUGGESTION_REJECTED'
  | 'ACTION_EXECUTED'
  | 'FALLBACK_USED'
  | 'INSUFFICIENT_BASIS'
  | 'AUTHORIZATION_DENIED'
  | 'MEMORY_CREATED'
  | 'MEMORY_CORRECTED'
  | 'MEMORY_REVOKED'
  | 'MEMORY_USED'
  | 'INSIGHT_DISPLAYED'
  | 'FEEDBACK_RECORDED';

/** Best-effort product metrics. Never accepts arbitrary family content. */
@Injectable()
export class AiMetricsService {
  constructor(private readonly supabase: SupabaseService) {}

  async record(
    actor: RequestActor,
    metricType: AiMetricType,
    metadata: Record<string, string | number | boolean | null> = {},
    dedupeKey?: string,
  ): Promise<void> {
    const safeMetadata = Object.fromEntries(
      Object.entries(metadata)
        .filter(
          ([key, value]) =>
            /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) &&
            (['string', 'number', 'boolean'].includes(typeof value) || value === null),
        )
        .slice(0, 20),
    );
    const payload = {
      tenant_id: actor.tenantId,
      actor_person_id: actor.personId,
      metric_type: metricType,
      metadata: safeMetadata,
      dedupe_key: dedupeKey ?? null,
    };
    const query = this.supabase.forUser(actor.bearerToken).from('ai_metrics_events');
    const result = dedupeKey
      ? await query.upsert(payload, {
          onConflict: 'tenant_id,actor_person_id,metric_type,dedupe_key',
          ignoreDuplicates: true,
        })
      : await query.insert(payload);
    // Metrics must never block the family workflow.
    if (result.error) return;
  }
}
