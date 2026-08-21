import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { canTransitionRequest, type RequestStatus } from '@family-app/domain';
import type { RequestActor } from '../../common/auth.guard';
import { AuditService } from '../../common/audit.service';
import { SupabaseService } from '../../common/supabase.service';

/**
 * Family Request Engine (Prompt Mestre V2 §30-37, P0). The core
 * invariant under test in §80: before `requestedToPersonId` accepts,
 * nothing about the original schedule/responsibility changes; only
 * `accept()` is allowed to apply an effect, and every transition is
 * logged to the append-only `request_actions` trail (never overwritten,
 * §35-36) plus a regular AuditEvent.
 *
 * ASSUMPTION: only `PICKUP_REQUEST`/`DROPOFF_REQUEST`/
 * `RESPONSIBILITY_TRANSFER` requests that reference a `calendar_events`
 * row via `relatedResourceType`/`relatedResourceId` get an automatic
 * effect applied on acceptance (reassigning
 * transportation_person_id/responsible_person_id). Other request types
 * (SCHEDULE_CHANGE, RESIDENCE_CHANGE, EXPENSE_APPROVAL, etc.) reach
 * ACCEPTED/COMPLETED as a record of agreement; wiring their specific
 * downstream effects is left to a later phase and documented here
 * rather than guessed at.
 */
@Injectable()
export class RequestsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly audit: AuditService,
  ) {}

  private db(actor: RequestActor) {
    return this.supabase.forUser(actor.bearerToken);
  }

  private async logAction(actor: RequestActor, requestId: string, actionType: string, note?: string) {
    await this.db(actor).from('request_actions').insert({
      tenant_id: actor.tenantId,
      request_id: requestId,
      action_type: actionType,
      actor_person_id: actor.personId,
      note: note ?? null,
    });
  }

  async create(
    actor: RequestActor,
    input: {
      type: string;
      requestedToPersonId: string;
      subjectPersonId?: string;
      payload?: Record<string, unknown>;
      note?: string;
      relatedResourceType?: string;
      relatedResourceId?: string;
      expiresAt?: string;
    },
  ) {
    if (input.requestedToPersonId === actor.personId) {
      throw new BadRequestException('Não é possível criar uma solicitação para si mesmo.');
    }
    const db = this.db(actor);

    // A linha nasce DRAFT, nunca SENT direto: a policy de INSERT em
    // requests (migration 20260820000020) exige `status = 'DRAFT'` — o
    // caminho real de criação é sempre DRAFT->SENT por um UPDATE
    // separado, validado pelo trigger app.validate_request_transition()
    // e pelo mesmo canTransitionRequest que o resto deste service usa.
    // Inserir já como 'SENT' viola essa policy e a criação inteira falha.
    const { data: draft, error: insertError } = await db
      .from('requests')
      .insert({
        tenant_id: actor.tenantId,
        type: input.type,
        status: 'DRAFT',
        requested_by_person_id: actor.personId,
        requested_to_person_id: input.requestedToPersonId,
        subject_person_id: input.subjectPersonId ?? null,
        payload: input.payload ?? {},
        related_resource_type: input.relatedResourceType ?? null,
        related_resource_id: input.relatedResourceId ?? null,
        note: input.note ?? null,
        expires_at: input.expiresAt ?? null,
      })
      .select()
      .single();
    if (insertError) throw new BadRequestException(insertError.message);

    await this.logAction(actor, draft.id as string, 'CREATED');

    this.assertTransition('DRAFT', 'SENT');
    const { data, error } = await db.from('requests').update({ status: 'SENT' }).eq('id', draft.id as string).select().single();
    if (error) throw new BadRequestException(error.message);

    await this.logAction(actor, data.id as string, 'SENT');

    await this.audit.record(actor, {
      eventType: 'REQUEST_CREATED',
      subjectPersonId: input.subjectPersonId ?? null,
      resourceType: 'requests',
      resourceId: data.id as string,
      result: 'SUCCESS',
      context: { type: input.type, requestedToPersonId: input.requestedToPersonId },
    });

    return data;
  }

  async listIncoming(actor: RequestActor) {
    const { data, error } = await this.db(actor)
      .from('requests')
      .select('*')
      .eq('requested_to_person_id', actor.personId)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async listOutgoing(actor: RequestActor) {
    const { data, error } = await this.db(actor)
      .from('requests')
      .select('*')
      .eq('requested_by_person_id', actor.personId)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  private async loadRequestOrThrow(actor: RequestActor, id: string) {
    const { data, error } = await this.db(actor).from('requests').select('*').eq('id', id).maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Solicitação não encontrada.');
    return data;
  }

  private assertTransition(current: RequestStatus, next: RequestStatus) {
    if (!canTransitionRequest(current, next)) {
      throw new BadRequestException(`Não é possível mover a solicitação de "${current}" para "${next}".`);
    }
  }

  async markViewed(actor: RequestActor, id: string) {
    const request = await this.loadRequestOrThrow(actor, id);
    if (request.requested_to_person_id !== actor.personId) throw new ForbiddenException('Esta solicitação não é sua.');
    if (request.status !== 'SENT') return request; // idempotent no-op past SENT
    this.assertTransition(request.status as RequestStatus, 'VIEWED');

    const { data, error } = await this.db(actor).from('requests').update({ status: 'VIEWED' }).eq('id', id).select().single();
    if (error) throw new BadRequestException(error.message);
    await this.logAction(actor, id, 'VIEWED');
    return data;
  }

  async accept(actor: RequestActor, id: string, note?: string) {
    const request = await this.loadRequestOrThrow(actor, id);
    if (request.requested_to_person_id !== actor.personId) throw new ForbiddenException('Somente o destinatário pode aceitar esta solicitação.');
    this.assertTransition(request.status as RequestStatus, 'ACCEPTED');

    const db = this.db(actor);
    await this.applyAcceptanceEffect(actor, request);

    const { data, error } = await db
      .from('requests')
      .update({ status: 'ACCEPTED', responded_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    await this.logAction(actor, id, 'ACCEPTED', note);
    await this.audit.record(actor, {
      eventType: 'REQUEST_ACCEPTED',
      subjectPersonId: request.subject_person_id as string | null,
      resourceType: 'requests',
      resourceId: id,
      result: 'SUCCESS',
    });
    return data;
  }

  async decline(actor: RequestActor, id: string, note?: string) {
    const request = await this.loadRequestOrThrow(actor, id);
    if (request.requested_to_person_id !== actor.personId) throw new ForbiddenException('Somente o destinatário pode recusar esta solicitação.');
    this.assertTransition(request.status as RequestStatus, 'DECLINED');

    const { data, error } = await this.db(actor)
      .from('requests')
      .update({ status: 'DECLINED', responded_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    await this.logAction(actor, id, 'DECLINED', note);
    await this.audit.record(actor, {
      eventType: 'REQUEST_DECLINED',
      subjectPersonId: request.subject_person_id as string | null,
      resourceType: 'requests',
      resourceId: id,
      result: 'SUCCESS',
    });
    return data;
  }

  async cancel(actor: RequestActor, id: string) {
    const request = await this.loadRequestOrThrow(actor, id);
    if (request.requested_by_person_id !== actor.personId) throw new ForbiddenException('Somente quem criou pode cancelar esta solicitação.');
    this.assertTransition(request.status as RequestStatus, 'CANCELLED');

    const { data, error } = await this.db(actor).from('requests').update({ status: 'CANCELLED' }).eq('id', id).select().single();
    if (error) throw new BadRequestException(error.message);
    await this.logAction(actor, id, 'CANCELLED');
    return data;
  }

  /** §37: disputing never deletes prior state — it's just another logged transition. */
  async dispute(actor: RequestActor, id: string, note: string) {
    const request = await this.loadRequestOrThrow(actor, id);
    if (![request.requested_by_person_id, request.requested_to_person_id].includes(actor.personId)) {
      throw new ForbiddenException('Você não participa desta solicitação.');
    }
    this.assertTransition(request.status as RequestStatus, 'DISPUTED');

    const { data, error } = await this.db(actor).from('requests').update({ status: 'DISPUTED' }).eq('id', id).select().single();
    if (error) throw new BadRequestException(error.message);
    await this.logAction(actor, id, 'DISPUTED', note);
    return data;
  }

  private async applyAcceptanceEffect(actor: RequestActor, request: Record<string, unknown>) {
    const type = request.type as string;
    const relatedType = request.related_resource_type as string | null;
    const relatedId = request.related_resource_id as string | null;
    if (!relatedType || !relatedId) return;
    if (!['PICKUP_REQUEST', 'DROPOFF_REQUEST', 'RESPONSIBILITY_TRANSFER'].includes(type)) return;
    if (relatedType !== 'calendar_events') return;

    const column = type === 'RESPONSIBILITY_TRANSFER' ? 'responsible_person_id' : 'transportation_person_id';
    // calendar_events_access (migration 20260820000023) já exige
    // app.has_domain_access(..., 'EDIT') no WITH CHECK — mas um UPDATE
    // cujo WHERE não bate com nenhuma linha visível pela RLS não é um
    // erro do Postgres, é 0 linhas afetadas em silêncio. Sem checar
    // isso, quem aceita uma solicitação sem EDIT sobre o evento via um
    // "sucesso" e um REQUEST_ACCEPTED auditado, mas o efeito real nunca
    // aconteceu — pior que um 403 alto e claro (§10).
    const { data, error } = await this.db(actor)
      .from('calendar_events')
      .update({ [column]: request.requested_to_person_id })
      .eq('id', relatedId)
      .select('id')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) {
      throw new ForbiddenException('Você não tem permissão para aplicar o efeito desta solicitação a este evento.');
    }
  }
}
