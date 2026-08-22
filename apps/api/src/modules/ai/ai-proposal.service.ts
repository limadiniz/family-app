import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { getAiActionTool, PROPOSED_ACTION_TYPES } from '@family-app/ai';
import type { ProposedActionType } from '@family-app/ai';
import { permissionDomainSchema } from '@family-app/domain';
import type { PermissionAction, PermissionDomain } from '@family-app/domain';
import { z } from 'zod';
import type { RequestActor } from '../../common/auth.guard';
import { AuditService } from '../../common/audit.service';
import { PolicyService } from '../../common/policy.service';
import { SupabaseService } from '../../common/supabase.service';
import { CareNetworkService } from '../care-network/care-network.service';
import { CommandCenterService } from '../command-center/command-center.service';
import { RequestsService } from '../requests/requests.service';

const createProposalSchema = z.object({
  type: z.enum(PROPOSED_ACTION_TYPES),
  subjectPersonIds: z.array(z.string().uuid()).min(1).max(20),
  proposedData: z.record(z.unknown()),
  factIds: z.array(z.string().min(1).max(250)).max(100).default([]),
  uncertainFields: z.array(z.string().min(1).max(100)).max(30).default([]),
  expectedEffects: z.array(z.string().min(1).max(300)).max(30).default([]),
  informationToShare: z.array(permissionDomainSchema).max(16).default([]),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  idempotencyKey: z.string().min(8).max(120).optional(),
});

type CreateProposalInput = z.input<typeof createProposalSchema>;
type RequiredAuthorization = { domain: PermissionDomain; action: PermissionAction };
@Injectable()
export class AiProposalService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
    private readonly commandCenter: CommandCenterService,
    private readonly requests: RequestsService,
    private readonly careNetwork: CareNetworkService,
  ) {}

  private db(actor: RequestActor) {
    return this.supabase.forUser(actor.bearerToken);
  }

  async create(actor: RequestActor, input: CreateProposalInput) {
    const parsed = createProposalSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Proposta inválida.');
    const value = parsed.data;
    const subjectPersonIds = [...new Set(value.subjectPersonIds)];
    const tool = getAiActionTool(value.type);
    const requiredAuthorization = tool.requiredAuthorization;

    if (value.idempotencyKey) {
      const { data: existing } = await this.db(actor)
        .from('ai_action_proposals')
        .select('*')
        .eq('created_by_person_id', actor.personId)
        .eq('idempotency_key', value.idempotencyKey)
        .maybeSingle();
      if (existing) return existing;
    }

    for (const subjectPersonId of subjectPersonIds) {
      await this.policy.authorizeOrThrow(actor, 'CREATE', 'AI', subjectPersonId, {
        purpose: 'prepare_ai_action_proposal',
      });
      for (const requirement of requiredAuthorization) {
        await this.policy.authorizeOrThrow(actor, requirement.action, requirement.domain, subjectPersonId, {
          purpose: 'prepare_ai_action_proposal',
        });
      }
      for (const domain of value.informationToShare) {
        await this.policy.authorizeOrThrow(actor, 'VIEW', domain, subjectPersonId, {
          purpose: 'preview_ai_proposal_information',
        });
      }
    }

    const now = Date.now();
    const expiresAt = value.expiresAt ? new Date(value.expiresAt).getTime() : now + 24 * 60 * 60 * 1000;
    if (expiresAt <= now + 5 * 60 * 1000 || expiresAt > now + 7 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException('A proposta deve expirar entre 5 minutos e 7 dias.');
    }

    const { data, error } = await this.db(actor)
      .from('ai_action_proposals')
      .insert({
        tenant_id: actor.tenantId,
        created_by_person_id: actor.personId,
        subject_person_ids: subjectPersonIds,
        proposal_type: value.type,
        status: 'READY_FOR_REVIEW',
        proposed_data: value.proposedData,
        fact_ids: value.factIds,
        uncertain_fields: value.uncertainFields,
        expected_effects: value.expectedEffects,
        required_authorization: requiredAuthorization,
        information_to_share: value.informationToShare,
        idempotency_key: value.idempotencyKey ?? null,
        expires_at: new Date(expiresAt).toISOString(),
      })
      .select('*')
      .single();
    if (error) throw new BadRequestException(error.message);

    await this.audit.record(actor, {
      eventType: 'AI_ACTION',
      resourceType: 'ai_action_proposals',
      resourceId: data.id as string,
      result: 'SUCCESS',
      context: { action: 'PROPOSAL_PREPARED', type: value.type, factCount: value.factIds.length },
    });
    return data;
  }

  async list(actor: RequestActor, status?: string) {
    let query = this.db(actor)
      .from('ai_action_proposals')
      .select('*')
      .eq('created_by_person_id', actor.personId)
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async confirm(actor: RequestActor, id: string, expectedVersion: number, confirmed: boolean) {
    if (!confirmed) throw new BadRequestException('A confirmação explícita é obrigatória.');
    const proposal = await this.load(actor, id);
    this.assertReviewable(proposal, expectedVersion);
    await this.revalidate(actor, proposal, true);

    const { data, error } = await this.db(actor)
      .from('ai_action_proposals')
      .update({
        status: 'CONFIRMED',
        version: expectedVersion + 1,
        confirmed_by_person_id: actor.personId,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'READY_FOR_REVIEW')
      .eq('version', expectedVersion)
      .select('*')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new ConflictException('A proposta mudou. Revise a versão mais recente antes de confirmar.');

    await this.audit.record(actor, {
      eventType: 'AI_ACTION',
      resourceType: 'ai_action_proposals',
      resourceId: id,
      result: 'SUCCESS',
      context: { action: 'PROPOSAL_CONFIRMED', type: proposal.proposal_type },
    });
    return data;
  }

  async reject(actor: RequestActor, id: string, expectedVersion: number) {
    const proposal = await this.load(actor, id);
    this.assertReviewable(proposal, expectedVersion);
    const { data, error } = await this.db(actor)
      .from('ai_action_proposals')
      .update({ status: 'REJECTED', version: expectedVersion + 1, rejected_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'READY_FOR_REVIEW')
      .eq('version', expectedVersion)
      .select('*')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new ConflictException('A proposta mudou e não pode mais ser rejeitada nesta versão.');
    return data;
  }

  async execute(actor: RequestActor, id: string, expectedVersion: number, confirmed: boolean) {
    if (!confirmed) throw new BadRequestException('Confirme novamente antes de executar a ação.');
    const proposal = await this.load(actor, id);
    if (proposal.status !== 'CONFIRMED' || proposal.version !== expectedVersion) {
      throw new ConflictException('A proposta não está confirmada nesta versão.');
    }
    if (new Date(proposal.expires_at as string).getTime() <= Date.now()) {
      await this.expire(actor, proposal);
      throw new BadRequestException('A proposta expirou e precisa ser preparada novamente.');
    }
    await this.revalidate(actor, proposal, true);

    const executionStartedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await this.db(actor)
      .from('ai_action_proposals')
      .update({ execution_started_at: executionStartedAt, version: expectedVersion + 1 })
      .eq('id', id)
      .eq('status', 'CONFIRMED')
      .eq('version', expectedVersion)
      .is('execution_started_at', null)
      .select('*')
      .maybeSingle();
    if (claimError) throw new BadRequestException(claimError.message);
    if (!claimed) throw new ConflictException('A execução já foi iniciada ou a proposta mudou.');

    try {
      const result = await this.executeDomainAction(actor, proposal.proposal_type as ProposedActionType, proposal.proposed_data as Record<string, unknown>);
      const { data, error } = await this.db(actor)
        .from('ai_action_proposals')
        .update({ status: 'EXECUTED', version: expectedVersion + 2, executed_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'CONFIRMED')
        .eq('version', expectedVersion + 1)
        .eq('execution_started_at', executionStartedAt)
        .select('*')
        .single();
      if (error) throw new BadRequestException(error.message);
      await this.audit.record(actor, {
        eventType: 'AI_ACTION',
        resourceType: 'ai_action_proposals',
        resourceId: id,
        result: 'SUCCESS',
        context: { action: 'PROPOSAL_EXECUTED', type: proposal.proposal_type },
      });
      return { proposal: data, result };
    } catch (error) {
      await this.db(actor)
        .from('ai_action_proposals')
        .update({
          status: 'FAILED',
          version: expectedVersion + 2,
          failure_reason: error instanceof Error ? error.name : 'DOMAIN_ACTION_FAILED',
        })
        .eq('id', id)
        .eq('status', 'CONFIRMED')
        .eq('version', expectedVersion + 1);
      throw error;
    }
  }

  private async executeDomainAction(actor: RequestActor, type: ProposedActionType, data: Record<string, unknown>) {
    switch (type) {
      case 'PROPOSE_TASK':
      case 'PROPOSE_REMINDER':
      case 'PROPOSE_PREPARATION_CHECKLIST':
        return this.commandCenter.createTask(actor, data as Parameters<CommandCenterService['createTask']>[1]);
      case 'PROPOSE_CALENDAR_EVENT':
        return this.commandCenter.createCalendarEvent(actor, data as Parameters<CommandCenterService['createCalendarEvent']>[1]);
      case 'PROPOSE_REQUEST':
        return this.requests.create(actor, data as Parameters<RequestsService['create']>[1]);
      case 'PROPOSE_RESPONSIBILITY_ASSIGNMENT':
        return this.careNetwork.create(actor, data as Parameters<CareNetworkService['create']>[1]);
      default:
        throw new BadRequestException('Esta proposta exige revisão e execução manual na área correspondente.');
    }
  }

  private async load(actor: RequestActor, id: string) {
    const { data, error } = await this.db(actor).from('ai_action_proposals').select('*').eq('id', id).maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Proposta não encontrada.');
    return data;
  }

  private assertReviewable(proposal: Record<string, unknown>, expectedVersion: number) {
    if (proposal.status !== 'READY_FOR_REVIEW' || proposal.version !== expectedVersion) {
      throw new ConflictException('A proposta mudou. Atualize a tela e revise novamente.');
    }
    if (new Date(proposal.expires_at as string).getTime() <= Date.now()) {
      throw new BadRequestException('A proposta expirou.');
    }
  }

  private async revalidate(actor: RequestActor, proposal: Record<string, unknown>, confirmed: boolean) {
    const subjects = proposal.subject_person_ids as string[];
    const requirements = proposal.required_authorization as RequiredAuthorization[];
    const informationToShare = proposal.information_to_share as PermissionDomain[];
    for (const subjectPersonId of subjects) {
      await this.policy.authorizeOrThrow(actor, 'EDIT', 'AI', subjectPersonId, {
        confirmed,
        purpose: 'confirm_ai_action_proposal',
      });
      for (const requirement of requirements) {
        await this.policy.authorizeOrThrow(actor, requirement.action, requirement.domain, subjectPersonId, {
          confirmed,
          purpose: 'confirm_ai_action_proposal',
        });
      }
      for (const domain of informationToShare) {
        await this.policy.authorizeOrThrow(actor, 'SHARE', domain, subjectPersonId, {
          confirmed,
          purpose: 'confirm_ai_proposal_information_sharing',
        });
      }
    }
  }

  private async expire(actor: RequestActor, proposal: Record<string, unknown>) {
    await this.db(actor)
      .from('ai_action_proposals')
      .update({ status: 'EXPIRED', version: (proposal.version as number) + 1 })
      .eq('id', proposal.id as string)
      .eq('version', proposal.version as number);
  }
}
