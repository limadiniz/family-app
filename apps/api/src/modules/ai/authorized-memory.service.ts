import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { permissionDomainSchema } from '@family-app/domain';
import { z } from 'zod';
import type { RequestActor } from '../../common/auth.guard';
import { AuditService } from '../../common/audit.service';
import { PolicyService } from '../../common/policy.service';
import { SupabaseService } from '../../common/supabase.service';
import { AiService } from './ai.service';

const preferencesSchema = z.object({
  memoryEnabled: z.boolean(),
  proactiveEnabled: z.boolean().default(false),
  explanationDetail: z.enum(['CONCISE', 'BALANCED', 'DETAILED']).default('BALANCED'),
  quietHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  quietHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
});

const correctionSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  normalizedContent: z.record(z.unknown()).default({}),
  validUntil: z.string().datetime({ offset: true }).nullable().optional(),
  confirmed: z.literal(true),
});

@Injectable()
export class AuthorizedMemoryService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
    private readonly ai: AiService,
  ) {}

  private db(actor: RequestActor) {
    return this.supabase.forUser(actor.bearerToken);
  }

  async getPreferences(actor: RequestActor) {
    const { data, error } = await this.db(actor)
      .from('ai_memory_preferences')
      .select('*')
      .eq('person_id', actor.personId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    return (
      data ?? {
        tenant_id: actor.tenantId,
        person_id: actor.personId,
        memory_enabled: true,
        proactive_enabled: false,
        explanation_detail: 'BALANCED',
        quiet_hours_start: null,
        quiet_hours_end: null,
      }
    );
  }

  async updatePreferences(actor: RequestActor, input: z.input<typeof preferencesSchema>) {
    const parsed = preferencesSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Preferências inválidas.');
    const value = parsed.data;
    const { data, error } = await this.db(actor)
      .from('ai_memory_preferences')
      .upsert(
        {
          tenant_id: actor.tenantId,
          person_id: actor.personId,
          memory_enabled: value.memoryEnabled,
          proactive_enabled: value.proactiveEnabled,
          explanation_detail: value.explanationDetail,
          quiet_hours_start: value.quietHoursStart ?? null,
          quiet_hours_end: value.quietHoursEnd ?? null,
        },
        { onConflict: 'tenant_id,person_id' },
      )
      .select('*')
      .single();
    if (error) throw new BadRequestException(error.message);
    await this.audit.record(actor, {
      eventType: 'AI_ACTION',
      resourceType: 'ai_memory_preferences',
      resourceId: actor.personId as string,
      result: 'SUCCESS',
      context: {
        action: 'MEMORY_PREFERENCES_UPDATED',
        memoryEnabled: value.memoryEnabled,
        proactiveEnabled: value.proactiveEnabled,
      },
    });
    return data;
  }

  async correct(actor: RequestActor, memoryId: string, input: z.input<typeof correctionSchema>) {
    const parsed = correctionSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Correção inválida.');
    const { data: original, error } = await this.db(actor)
      .from('ai_memory_items')
      .select('id, subject_person_id, domain, summary, revoked_at')
      .eq('id', memoryId)
      .is('revoked_at', null)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!original) throw new NotFoundException('Memória não encontrada ou já esquecida.');
    const domain = permissionDomainSchema.parse(original.domain);
    await this.policy.authorizeOrThrow(actor, 'EDIT', 'AI', original.subject_person_id as string, {
      confirmed: true,
      purpose: 'correct_ai_memory',
    });
    await this.policy.authorizeOrThrow(actor, 'EDIT', domain, original.subject_person_id as string, {
      confirmed: true,
      purpose: 'correct_ai_memory',
    });

    const replacement = await this.ai.createMemory(actor, {
      subjectPersonId: original.subject_person_id as string,
      domain,
      memoryType: 'CORRECTION',
      summary: parsed.data.summary,
      normalizedContent: parsed.data.normalizedContent,
      sourceRefs: [{ type: 'ai_memory_items', id: memoryId }],
      purpose: 'correct_prior_memory',
      validUntil: parsed.data.validUntil ?? null,
      confirmed: true,
    });
    const { error: revokeError } = await this.db(actor)
      .from('ai_memory_items')
      .update({ revoked_at: new Date().toISOString(), superseded_by_id: replacement.id })
      .eq('id', memoryId)
      .is('revoked_at', null);
    if (revokeError) throw new BadRequestException(revokeError.message);

    await this.audit.record(actor, {
      eventType: 'AI_ACTION',
      subjectPersonId: original.subject_person_id as string,
      resourceType: 'ai_memory_items',
      resourceId: replacement.id as string,
      result: 'SUCCESS',
      context: { action: 'MEMORY_CORRECTED', supersedesMemoryId: memoryId, domain },
    });
    return replacement;
  }

  async export(actor: RequestActor, subjectPersonId: string) {
    const items = await this.ai.listMemory(actor, subjectPersonId);
    const preferences = await this.getPreferences(actor);
    return {
      format: 'ZELII_AUTHORIZED_MEMORY_V1',
      exportedAt: new Date().toISOString(),
      subjectPersonId,
      preferences: {
        memoryEnabled: preferences.memory_enabled,
        proactiveEnabled: preferences.proactive_enabled,
        explanationDetail: preferences.explanation_detail,
      },
      items,
    };
  }

  async usage(actor: RequestActor, memoryId: string) {
    const { data: memory } = await this.db(actor)
      .from('ai_memory_items')
      .select('id, subject_person_id, domain')
      .eq('id', memoryId)
      .maybeSingle();
    if (!memory) throw new NotFoundException('Memória não encontrada.');
    await this.policy.authorizeOrThrow(actor, 'VIEW', 'AI', memory.subject_person_id as string, {
      purpose: 'review_ai_memory_usage',
    });
    await this.policy.authorizeOrThrow(actor, 'VIEW', permissionDomainSchema.parse(memory.domain), memory.subject_person_id as string, {
      purpose: 'review_ai_memory_usage',
    });
    const { data, error } = await this.db(actor)
      .from('ai_memory_usage_events')
      .select('purpose, used_at')
      .eq('memory_id', memoryId)
      .order('used_at', { ascending: false })
      .limit(50);
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }
}
