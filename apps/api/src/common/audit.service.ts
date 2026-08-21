import { Injectable } from '@nestjs/common';
import type { AuditEventType } from '@family-app/domain';
import type { RequestActor } from './auth.guard';
import { SupabaseService } from './supabase.service';

@Injectable()
export class AuditService {
  constructor(private readonly supabase: SupabaseService) {}

  async record(
    actor: RequestActor,
    event: {
      eventType: AuditEventType;
      subjectPersonId?: string | null;
      resourceType?: string;
      resourceId?: string;
      result: 'SUCCESS' | 'DENIED' | 'ERROR';
      context?: Record<string, unknown>;
      correlationId?: string;
    },
  ): Promise<void> {
    if (!actor.tenantId) return; // pre-onboarding actions have nothing to attribute yet
    const client = this.supabase.forUser(actor.bearerToken);
    await client.from('audit_events').insert({
      tenant_id: actor.tenantId,
      event_type: event.eventType,
      actor_user_id: actor.authUserId,
      actor_person_id: actor.personId,
      subject_person_id: event.subjectPersonId ?? null,
      resource_type: event.resourceType ?? null,
      resource_id: event.resourceId ?? null,
      result: event.result,
      context: event.context ?? null,
      correlation_id: event.correlationId ?? null,
    });
  }
}
