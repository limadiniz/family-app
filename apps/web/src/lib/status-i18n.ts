/**
 * Tradução central de status/enums para pt-BR (ZELII P0 §6.3). Nunca
 * exibir um valor de enum bruto (`PENDING`, `TODO`, `CALENDAR_EVENT`,
 * `RESPONSIBILITY_TRANSFER`, ...) diretamente na interface — todo lugar
 * que hoje faz `{item.status}` deve passar por `translateStatus` (ou pelo
 * componente `StatusBadge`, que já usa isso por baixo).
 *
 * `tone` decide a cor semântica (ver `packages/ui/src/tokens.ts` para as
 * notas de contraste) — o texto do badge nunca é a própria cor de acento,
 * sempre `ink`; `tone` só escolhe a cor do tint de fundo e do indicador.
 */
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'critical';

export type StatusDomain =
  | 'task'
  | 'request'
  | 'requestAction'
  | 'capture'
  | 'captureCategory'
  | 'captureProposal'
  | 'captureProposalTarget'
  | 'handoff'
  | 'responsibility'
  | 'calendarCategory'
  | 'notificationLevel';

interface StatusEntry {
  label: string;
  tone: StatusTone;
}

const DICTIONARIES: Record<StatusDomain, Record<string, StatusEntry>> = {
  task: {
    TODO: { label: 'A fazer', tone: 'neutral' },
    IN_PROGRESS: { label: 'Em andamento', tone: 'info' },
    DONE: { label: 'Concluída', tone: 'success' },
    CANCELLED: { label: 'Cancelada', tone: 'neutral' },
    OVERDUE: { label: 'Atrasada', tone: 'critical' },
  },
  request: {
    DRAFT: { label: 'Rascunho', tone: 'neutral' },
    SENT: { label: 'Enviada', tone: 'info' },
    VIEWED: { label: 'Vista', tone: 'info' },
    ACCEPTED: { label: 'Aceita', tone: 'success' },
    DECLINED: { label: 'Recusada', tone: 'critical' },
    CANCELLED: { label: 'Cancelada', tone: 'neutral' },
    EXPIRED: { label: 'Expirada', tone: 'warning' },
    DISPUTED: { label: 'Em contestação', tone: 'critical' },
  },
  requestAction: {
    CREATED: { label: 'Criada', tone: 'neutral' },
    SENT: { label: 'Enviada', tone: 'info' },
    VIEWED: { label: 'Vista', tone: 'info' },
    ACCEPTED: { label: 'Aceita', tone: 'success' },
    DECLINED: { label: 'Recusada', tone: 'critical' },
    CANCELLED: { label: 'Cancelada', tone: 'neutral' },
    DISPUTED: { label: 'Contestada', tone: 'critical' },
    COMMENTED: { label: 'Comentário adicionado', tone: 'neutral' },
    COMPLETED: { label: 'Concluída', tone: 'success' },
  },
  capture: {
    RECEIVED: { label: 'Recebido', tone: 'neutral' },
    PROCESSING: { label: 'Processando', tone: 'info' },
    NEEDS_REVIEW: { label: 'Precisa de revisão', tone: 'warning' },
    READY: { label: 'Pronto para revisão', tone: 'info' },
    CONFIRMED: { label: 'Confirmado', tone: 'success' },
    REJECTED: { label: 'Rejeitado', tone: 'neutral' },
    FAILED: { label: 'Falhou', tone: 'critical' },
    ARCHIVED: { label: 'Arquivado', tone: 'neutral' },
  },
  captureCategory: {
    // MEDICAL_* em tone 'critical' de propósito — mesmo tratamento visual
    // de dado de saúde que calendarCategory.HEALTH/MEDICATION (§4).
    SCHOOL_ANNOUNCEMENT: { label: 'Comunicado escolar', tone: 'info' },
    SCHOOL_ASSIGNMENT: { label: 'Tarefa escolar', tone: 'info' },
    SCHOOL_EXAM: { label: 'Prova', tone: 'info' },
    MEDICAL_PRESCRIPTION: { label: 'Receita médica', tone: 'critical' },
    MEDICAL_EXAM: { label: 'Exame médico', tone: 'critical' },
    MEDICAL_APPOINTMENT: { label: 'Consulta médica', tone: 'critical' },
    ACTIVITY: { label: 'Atividade', tone: 'success' },
    CALENDAR_EVENT: { label: 'Evento', tone: 'neutral' },
    TASK: { label: 'Tarefa', tone: 'neutral' },
    PAYMENT: { label: 'Pagamento', tone: 'warning' },
    DOCUMENT: { label: 'Documento', tone: 'neutral' },
    TRANSPORTATION: { label: 'Transporte', tone: 'neutral' },
    OTHER: { label: 'Outro', tone: 'neutral' },
  },
  captureProposalTarget: {
    CALENDAR_EVENT: { label: 'Vai virar um evento na agenda', tone: 'info' },
    TASK: { label: 'Vai virar uma tarefa', tone: 'info' },
    CHECKLIST: { label: 'Vai virar um item de checklist', tone: 'info' },
    DOCUMENT: { label: 'Vai virar um documento', tone: 'info' },
  },
  captureProposal: {
    PENDING: { label: 'Aguardando confirmação', tone: 'warning' },
    CONFIRMED: { label: 'Confirmado', tone: 'success' },
    EDITED_AND_CONFIRMED: { label: 'Editado e confirmado', tone: 'success' },
    DISCARDED: { label: 'Descartado', tone: 'neutral' },
  },
  handoff: {
    EXPECTED: { label: 'Previsto', tone: 'neutral' },
    CONFIRMED: { label: 'Confirmado', tone: 'info' },
    COMPLETED: { label: 'Concluído', tone: 'success' },
    DELAYED: { label: 'Atrasado', tone: 'warning' },
    CANCELLED: { label: 'Cancelado', tone: 'neutral' },
    DISPUTED: { label: 'Em contestação', tone: 'critical' },
  },
  responsibility: {
    PROPOSED: { label: 'Proposta', tone: 'neutral' },
    SENT: { label: 'Enviada', tone: 'info' },
    VIEWED: { label: 'Vista', tone: 'info' },
    ACCEPTED: { label: 'Aceita', tone: 'success' },
    DECLINED: { label: 'Recusada', tone: 'critical' },
    EXPIRED: { label: 'Expirada', tone: 'warning' },
    CANCELLED: { label: 'Cancelada', tone: 'neutral' },
    ACTIVE: { label: 'Em andamento', tone: 'info' },
    COMPLETED: { label: 'Concluída', tone: 'success' },
    FAILED: { label: 'Não realizada', tone: 'critical' },
  },
  calendarCategory: {
    SCHOOL: { label: 'Escola', tone: 'info' },
    HEALTH: { label: 'Saúde', tone: 'critical' },
    SPORT: { label: 'Atividade', tone: 'success' },
    FAMILY: { label: 'Família', tone: 'neutral' },
    MEDICATION: { label: 'Medicação', tone: 'critical' },
    DOCUMENT: { label: 'Documento', tone: 'neutral' },
    FINANCE: { label: 'Financeiro', tone: 'warning' },
    OTHER: { label: 'Outro', tone: 'neutral' },
  },
  notificationLevel: {
    CRITICAL: { label: 'Urgente', tone: 'critical' },
    IMPORTANT: { label: 'Importante', tone: 'warning' },
    INFORMATIONAL: { label: 'Informativo', tone: 'info' },
  },
};

/**
 * Traduz um valor de enum para pt-BR. Se o valor não estiver no
 * dicionário (schema evoluiu e a tradução ficou pra trás), cai para uma
 * versão "title case" legível em vez de mostrar o `SCREAMING_CASE` cru —
 * nunca falha silenciosamente mostrando algo pior que o valor original,
 * mas também nunca expõe o enum técnico intacto.
 */
export function translateStatus(domain: StatusDomain, value: string): StatusEntry {
  const entry = DICTIONARIES[domain]?.[value];
  if (entry) return entry;
  const humanized = value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return { label: humanized, tone: 'neutral' };
}
