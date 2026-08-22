import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { RequestActor } from '../../common/auth.guard';
import { SupabaseService } from '../../common/supabase.service';

const RESPONSIBLE_ROLES = new Set(['GUARDIAN', 'CO_GUARDIAN']);

type InvitationDelivery = {
  channel: 'EMAIL';
  status: 'SENT' | 'FAILED';
};

@Injectable()
export class InvitationsService {
  constructor(private readonly supabase: SupabaseService) {}

  private db(actor: RequestActor) {
    return this.supabase.forUser(actor.bearerToken);
  }

  async create(
    actor: RequestActor,
    input: { familyUnitId: string; inviteeEmail: string; subjectPersonIds: string[]; role?: string },
  ) {
    if (!actor.tenantId || !actor.personId) throw new BadRequestException('Conclua o cadastro inicial primeiro.');
    const inviteeEmail = input.inviteeEmail?.trim().toLowerCase();
    if (!inviteeEmail || !/^\S+@\S+\.\S+$/.test(inviteeEmail)) {
      throw new BadRequestException('Informe um e-mail válido.');
    }
    if (inviteeEmail === actor.email?.trim().toLowerCase()) {
      throw new BadRequestException('Use o e-mail do outro responsável, não o seu.');
    }
    const role = input.role ?? 'CO_GUARDIAN';
    if (!RESPONSIBLE_ROLES.has(role)) throw new BadRequestException('Perfil de responsável inválido.');
    const subjectPersonIds = [...new Set(input.subjectPersonIds ?? [])];
    if (subjectPersonIds.length === 0) {
      throw new BadRequestException('Selecione ao menos um filho para compartilhar o cuidado.');
    }

    const db = this.db(actor);
    const { data: membership, error: membershipError } = await db
      .from('family_memberships')
      .select('role, is_active')
      .eq('family_unit_id', input.familyUnitId)
      .eq('person_id', actor.personId)
      .eq('is_active', true)
      .maybeSingle();
    if (membershipError) throw new BadRequestException(membershipError.message);
    if (!membership || !['FAMILY_OWNER', 'GUARDIAN', 'CO_GUARDIAN'].includes(membership.role as string)) {
      throw new BadRequestException('Você não tem permissão para convidar responsáveis para esta família.');
    }

    const { data: subjects, error: subjectsError } = await db
      .from('family_memberships')
      .select('person_id, role')
      .eq('family_unit_id', input.familyUnitId)
      .eq('is_active', true)
      .in('person_id', subjectPersonIds);
    if (subjectsError) throw new BadRequestException(subjectsError.message);
    if (
      (subjects ?? []).length !== subjectPersonIds.length ||
      (subjects ?? []).some((subject) => !['CHILD', 'TEEN'].includes(subject.role as string))
    ) {
      throw new BadRequestException('Uma das pessoas selecionadas não pertence a esta família.');
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await db
      .from('invitations')
      .insert({
        tenant_id: actor.tenantId,
        family_unit_id: input.familyUnitId,
        invited_by_person_id: actor.personId,
        invitee_email: inviteeEmail,
        proposed_relationship: 'SPOUSE_PARTNER',
        proposed_role: role,
        permission_preset: role === 'GUARDIAN' ? 'RESPONSAVEL_COMPLETO' : 'RESPONSAVEL_COMPARTILHADO',
        subject_person_ids: subjectPersonIds,
        token,
        expires_at: expiresAt,
      })
      .select('id, invitee_email, proposed_role, status, expires_at, token')
      .single();
    if (error) {
      if (error.code === '23505') throw new BadRequestException('Já existe um convite pendente para este e-mail.');
      throw new BadRequestException(error.message);
    }
    const delivery = await this.sendInvitationEmail(data.invitee_email as string, data.token as string);
    return { ...data, delivery };
  }

  async resend(actor: RequestActor, invitationId: string) {
    if (!actor.tenantId || !actor.personId) throw new BadRequestException('Conclua o cadastro inicial primeiro.');

    const db = this.db(actor);
    const { data: invitation, error } = await db
      .from('invitations')
      .select('id, family_unit_id, invited_by_person_id, invitee_email, token, status, expires_at')
      .eq('id', invitationId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!invitation) throw new NotFoundException('Convite não encontrado.');
    if (invitation.status !== 'PENDING' || new Date(invitation.expires_at as string).getTime() <= Date.now()) {
      throw new BadRequestException('Este convite expirou, foi cancelado ou já foi usado.');
    }

    const { data: membership, error: membershipError } = await db
      .from('family_memberships')
      .select('role, is_active')
      .eq('family_unit_id', invitation.family_unit_id)
      .eq('person_id', actor.personId)
      .eq('is_active', true)
      .maybeSingle();
    if (membershipError) throw new BadRequestException(membershipError.message);
    if (!membership || !['FAMILY_OWNER', 'GUARDIAN', 'CO_GUARDIAN'].includes(membership.role as string)) {
      throw new BadRequestException('Você não tem permissão para reenviar este convite.');
    }

    return this.sendInvitationEmail(invitation.invitee_email as string, invitation.token as string);
  }

  async list(actor: RequestActor, familyUnitId?: string) {
    let query = this.db(actor)
      .from('invitations')
      .select('id, family_unit_id, invitee_email, proposed_role, status, expires_at, created_at')
      .order('created_at', { ascending: false });
    if (familyUnitId) query = query.eq('family_unit_id', familyUnitId);
    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async eligibleSubjects(actor: RequestActor, familyUnitId: string) {
    if (!familyUnitId) throw new BadRequestException('Selecione uma família.');
    const { data, error } = await this.db(actor)
      .from('family_memberships')
      .select('person_id, role, persons(id, display_name, person_type, is_minor)')
      .eq('family_unit_id', familyUnitId)
      .eq('is_active', true)
      .in('role', ['CHILD', 'TEEN']);
    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((membership) => {
      const relation = membership.persons as unknown as Record<string, unknown> | Record<string, unknown>[] | null;
      const person = Array.isArray(relation) ? relation[0] : relation;
      return person;
    }).filter(Boolean);
  }

  async lookup(actor: RequestActor, token: string) {
    const { data, error } = await this.db(actor).rpc('lookup_family_invitation', { p_token: token });
    if (error) throw new BadRequestException(this.friendlyRpcError(error.message));
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new NotFoundException('Este convite expirou, foi cancelado ou já foi usado.');
    return row;
  }

  async accept(actor: RequestActor, token: string, displayName: string) {
    if (!displayName?.trim()) throw new BadRequestException('Informe seu nome para entrar na família.');
    const { data, error } = await this.db(actor).rpc('accept_family_invitation', {
      p_token: token,
      p_display_name: displayName.trim(),
    });
    if (error) throw new BadRequestException(this.friendlyRpcError(error.message));
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new BadRequestException('Não foi possível concluir o vínculo familiar.');
    return { tenantId: row.tenant_id, personId: row.person_id, familyUnitId: row.family_unit_id };
  }

  private friendlyRpcError(message: string): string {
    if (message.includes('invitation_email_mismatch')) return 'Este convite foi enviado para outro e-mail. Entre com a conta correta.';
    if (message.includes('invalid_or_expired_invitation')) return 'Este convite expirou, foi cancelado ou já foi usado.';
    if (message.includes('authentication_required')) return 'Entre na sua conta para aceitar o convite.';
    if (message.includes('display_name_required')) return 'Informe seu nome para entrar na família.';
    return message;
  }

  private async sendInvitationEmail(inviteeEmail: string, token: string): Promise<InvitationDelivery> {
    const inviteUrl = `${this.supabase.webAppUrl}/convite/${token}`;
    try {
      const { error } = await this.supabase.anonymous().auth.signInWithOtp({
        email: inviteeEmail,
        options: {
          emailRedirectTo: inviteUrl,
          shouldCreateUser: true,
        },
      });
      return { channel: 'EMAIL', status: error ? 'FAILED' : 'SENT' };
    } catch {
      return { channel: 'EMAIL', status: 'FAILED' };
    }
  }
}
