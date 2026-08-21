import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { runCapturePipeline } from '@family-app/capture-engine';
import { canTransitionCaptureItem, type CaptureStatus } from '@family-app/domain';
import type { RequestActor } from '../../common/auth.guard';
import { AuditService } from '../../common/audit.service';
import { PolicyService } from '../../common/policy.service';
import { SupabaseService } from '../../common/supabase.service';

/**
 * Universal Family Inbox / Capture Engine (Prompt Mestre V2 §13-23, P0).
 *
 * Creating a CaptureItem is deliberately low-friction — any onboarded
 * family member can send something in without a Policy Engine check,
 * mirroring §14 ("não deverá precisar cadastrar manualmente tudo").
 * The check that matters happens at `confirmProposal`: that is the only
 * method in this whole codebase allowed to write a capture-derived
 * calendar_events/tasks row, and it requires (a) the proposal to exist
 * in a confirmable state per `canTransitionCaptureItem`, and (b) the
 * actor to hold CREATE on the target domain for the resolved subject —
 * exactly the same authorization a manually-created event would need.
 *
 * ASSUMPTION: capture item visibility is scoped to "my own inbox"
 * (created_by_person_id = actor) for this phase — a shared family inbox
 * view is a UX decision left for a later phase, not a security gap (RLS
 * + tenant scoping already prevent cross-tenant leakage regardless).
 */
@Injectable()
export class CaptureService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
  ) {}

  private db(actor: RequestActor) {
    return this.supabase.forUser(actor.bearerToken);
  }

  async createCaptureItem(actor: RequestActor, input: { source: string; rawText?: string; subjectPersonId?: string }) {
    const db = this.db(actor);
    const { data: item, error } = await db
      .from('capture_items')
      .insert({
        tenant_id: actor.tenantId,
        created_by_person_id: actor.personId,
        subject_person_id: input.subjectPersonId ?? null,
        source: input.source,
        raw_text: input.rawText ?? null,
        status: 'RECEIVED',
      })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    await this.audit.record(actor, {
      eventType: 'CAPTURE_ITEM_CREATED',
      subjectPersonId: input.subjectPersonId ?? null,
      resourceType: 'capture_items',
      resourceId: item.id as string,
      result: 'SUCCESS',
      context: { source: input.source },
    });

    return this.process(actor, item.id as string, input.source, input.rawText ?? null);
  }

  /** Runs the (currently heuristic — see packages/capture-engine) pipeline and persists its output. */
  private async process(actor: RequestActor, captureItemId: string, source: string, rawText: string | null) {
    const db = this.db(actor);
    await db.from('capture_items').update({ status: 'PROCESSING' }).eq('id', captureItemId);

    const output = runCapturePipeline({ source: source as never, rawText });

    if (output.extraction) {
      await db.from('capture_extractions').insert({
        tenant_id: actor.tenantId,
        capture_item_id: captureItemId,
        extractor_name: output.extraction.extractorName,
        extracted_fields: output.extraction.extractedFields,
        provenance: 'AI_INFERRED',
        confidence: output.extraction.confidence,
      });
    }

    let proposalId: string | null = null;
    if (output.proposal) {
      const { data: proposal, error: proposalError } = await db
        .from('capture_proposals')
        .insert({
          tenant_id: actor.tenantId,
          capture_item_id: captureItemId,
          target_type: output.proposal.targetType,
          proposed_fields: output.proposal.proposedFields,
          confidence: output.proposal.confidence,
          status: 'PENDING',
        })
        .select('id')
        .single();
      if (proposalError) throw new BadRequestException(proposalError.message);
      proposalId = proposal.id as string;
    }

    const { data: updated, error: updateError } = await db
      .from('capture_items')
      .update({ status: output.status, category: output.category })
      .eq('id', captureItemId)
      .select()
      .single();
    if (updateError) throw new BadRequestException(updateError.message);

    return { item: updated, proposalId };
  }

  async listMyCaptureItems(actor: RequestActor, status?: string) {
    let query = this.db(actor)
      .from('capture_items')
      .select('*, capture_proposals(*), capture_attachments(*)')
      .eq('created_by_person_id', actor.personId)
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async getCaptureItem(actor: RequestActor, id: string) {
    const { data, error } = await this.db(actor)
      .from('capture_items')
      .select('*, capture_proposals(*), capture_extractions(*), capture_attachments(*)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Item não encontrado.');
    if (data.created_by_person_id !== actor.personId) throw new ForbiddenException('Sem acesso a este item.');
    return data;
  }

  async confirmProposal(actor: RequestActor, proposalId: string, edits: Record<string, unknown> = {}) {
    const db = this.db(actor);
    const { data: proposal, error: findError } = await db
      .from('capture_proposals')
      .select('*, capture_items!inner(*)')
      .eq('id', proposalId)
      .maybeSingle();
    if (findError) throw new BadRequestException(findError.message);
    if (!proposal) throw new NotFoundException('Proposta não encontrada.');

    const item = proposal.capture_items as { id: string; status: CaptureStatus; created_by_person_id: string; subject_person_id: string | null };
    if (item.created_by_person_id !== actor.personId) throw new ForbiddenException('Sem acesso a este item.');
    if (!canTransitionCaptureItem(item.status, 'CONFIRMED')) {
      throw new BadRequestException(`Este item está em status "${item.status}" e não pode mais ser confirmado.`);
    }
    if (proposal.status !== 'PENDING') {
      throw new BadRequestException('Esta proposta já foi processada.');
    }

    const fields = { ...(proposal.proposed_fields as Record<string, unknown>), ...edits };
    const subjectPersonId = (edits['subjectPersonId'] as string | undefined) ?? item.subject_person_id ?? actor.personId!;

    let resultingRecordId: string;
    if (proposal.target_type === 'CALENDAR_EVENT') {
      const startsAt = this.resolveStartsAt(fields);
      if (!startsAt) throw new BadRequestException('Informe data e horário para confirmar este evento.');
      await this.policy.authorizeOrThrow(actor, 'CREATE', 'SCHEDULE', subjectPersonId, { purpose: 'confirm_capture_calendar_event' });
      const { data: created, error } = await db
        .from('calendar_events')
        .insert({
          tenant_id: actor.tenantId,
          subject_person_id: subjectPersonId,
          title: String(fields['title'] ?? 'Evento sem título'),
          category: 'OTHER',
          starts_at: startsAt,
          notes: 'Criado a partir do Universal Family Inbox.',
        })
        .select('id')
        .single();
      if (error) throw new BadRequestException(error.message);
      resultingRecordId = created.id as string;
    } else if (proposal.target_type === 'TASK') {
      await this.policy.authorizeOrThrow(actor, 'CREATE', 'SCHEDULE', subjectPersonId, { purpose: 'confirm_capture_task' });
      const { data: created, error } = await db
        .from('tasks')
        .insert({
          tenant_id: actor.tenantId,
          subject_person_id: subjectPersonId,
          title: String(fields['title'] ?? 'Tarefa sem título'),
          due_at: this.resolveStartsAt(fields),
        })
        .select('id')
        .single();
      if (error) throw new BadRequestException(error.message);
      resultingRecordId = created.id as string;
    } else {
      throw new BadRequestException(`Confirmação para o tipo "${proposal.target_type}" ainda não está disponível.`);
    }

    const nowIso = new Date().toISOString();
    const wasEdited = Object.keys(edits).length > 0;
    await db
      .from('capture_proposals')
      .update({
        status: wasEdited ? 'EDITED_AND_CONFIRMED' : 'CONFIRMED',
        confirmed_by_person_id: actor.personId,
        confirmed_at: nowIso,
        resulting_record_id: resultingRecordId,
      })
      .eq('id', proposalId);

    await db.from('capture_items').update({ status: 'CONFIRMED' }).eq('id', item.id);

    await this.audit.record(actor, {
      eventType: 'CAPTURE_CONFIRMED',
      subjectPersonId,
      resourceType: proposal.target_type as string,
      resourceId: resultingRecordId,
      result: 'SUCCESS',
      context: { captureItemId: item.id, proposalId },
    });

    return { resultingRecordId, targetType: proposal.target_type };
  }

  async rejectProposal(actor: RequestActor, proposalId: string) {
    const db = this.db(actor);
    const { data: proposal, error: findError } = await db
      .from('capture_proposals')
      .select('*, capture_items!inner(*)')
      .eq('id', proposalId)
      .maybeSingle();
    if (findError) throw new BadRequestException(findError.message);
    if (!proposal) throw new NotFoundException('Proposta não encontrada.');

    const item = proposal.capture_items as { id: string; status: CaptureStatus; created_by_person_id: string };
    if (item.created_by_person_id !== actor.personId) throw new ForbiddenException('Sem acesso a este item.');
    if (!canTransitionCaptureItem(item.status, 'REJECTED')) {
      throw new BadRequestException(`Este item está em status "${item.status}" e não pode mais ser rejeitado.`);
    }

    await db.from('capture_proposals').update({ status: 'DISCARDED' }).eq('id', proposalId);
    await db.from('capture_items').update({ status: 'REJECTED' }).eq('id', item.id);

    await this.audit.record(actor, {
      eventType: 'CAPTURE_REJECTED',
      resourceType: 'capture_proposals',
      resourceId: proposalId,
      result: 'SUCCESS',
    });

    return { rejected: true };
  }

  private resolveStartsAt(fields: Record<string, unknown>): string | null {
    if (typeof fields['startsAt'] === 'string') return fields['startsAt'] as string;
    const date = fields['date'];
    const time = fields['time'];
    if (typeof date === 'string' && typeof time === 'string') return `${date}T${time}:00.000Z`;
    if (typeof date === 'string') return `${date}T09:00:00.000Z`;
    return null;
  }
}
