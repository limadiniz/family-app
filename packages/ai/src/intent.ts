import type { PermissionDomain } from '@family-app/domain';
import type { RetrievalRequest } from './types';

/**
 * ASSUMPTION (§128): a real intent resolver is an LLM-assisted
 * classification step, planned for Phase 6. This keyword-based stand-in
 * exists ONLY so the surrounding Gateway plumbing — the part that
 * actually matters for security (§53-56) — is real and testable today.
 * It intentionally errs toward requesting MORE domains than strictly
 * needed; the Policy Engine, not this heuristic, is the security
 * boundary.
 */
const DOMAIN_KEYWORDS: Array<{ domain: PermissionDomain; keywords: string[] }> = [
  { domain: 'HEALTH', keywords: ['consulta', 'medic', 'pediatra', 'saude', 'historico', 'alergia', 'dentista', 'exame', 'vacina'] },
  { domain: 'MEDICATION', keywords: ['medicamento', 'remedio', 'dose', 'receita', 'farmaco'] },
  { domain: 'SCHOOL', keywords: ['escola', 'prova', 'dever', 'boletim', 'professor', 'colegio', 'comunicado'] },
  { domain: 'SCHEDULE', keywords: ['agenda', 'compromisso', 'evento', 'horario', 'hoje', 'amanha', 'semana', 'mes'] },
  { domain: 'ACTIVITIES', keywords: ['natacao', 'futebol', 'atividade', 'curso', 'aula', 'treino'] },
  { domain: 'FINANCE', keywords: ['gasto', 'despesa', 'pagamento', 'mensalidade', 'financeiro', 'boleto'] },
  { domain: 'DOCUMENTS', keywords: ['documento', 'carteirinha', 'certidao', 'autorizacao', 'passaporte'] },
  { domain: 'TRANSPORTATION', keywords: ['buscar', 'leva', 'transporte', 'carona', 'motorista'] },
  { domain: 'CONTACTS', keywords: ['contato', 'telefone', 'quem pode', 'disponivel'] },
  { domain: 'NOTES', keywords: ['observacao', 'anotacao', 'recado', 'lembrete'] },
  { domain: 'EMERGENCY', keywords: ['emergencia', 'urgencia', 'hospital'] },
];

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function resolveIntentDomains(question: string): PermissionDomain[] {
  const lower = normalizeText(question);
  const matched = DOMAIN_KEYWORDS.filter((entry) => entry.keywords.some((kw) => lower.includes(kw))).map(
    (e) => e.domain,
  );
  return matched.length > 0 ? matched : ['SCHEDULE'];
}

export function buildRetrievalRequests(
  question: string,
  subjectPersonIds: string[],
  timeWindow?: { startsAt: string; endsAt: string },
): RetrievalRequest[] {
  const domains = resolveIntentDomains(question);
  return domains.flatMap((domain) => subjectPersonIds.map((subjectPersonId) => ({
    domain,
    subjectPersonId,
    query: question,
    timeWindow: ['SCHEDULE', 'SCHOOL', 'ACTIVITIES', 'FINANCE'].includes(domain) ? timeWindow : undefined,
  })));
}

export function resolveTimeWindow(
  question: string,
  now = new Date(),
  timeZone = 'America/Sao_Paulo',
): { startsAt: string; endsAt: string } | undefined {
  const normalized = normalizeText(question);
  const today = startOfZonedDay(now, timeZone);
  const start = new Date(today);
  const end = new Date(today);

  if (normalized.includes('amanha')) {
    start.setUTCDate(start.getUTCDate() + 1);
    end.setUTCDate(end.getUTCDate() + 2);
  } else if (/(semana que vem|proxima semana)/.test(normalized)) {
    start.setUTCDate(start.getUTCDate() + 7);
    end.setUTCDate(end.getUTCDate() + 14);
  } else if (normalized.includes('semana')) {
    end.setUTCDate(end.getUTCDate() + 7);
  } else if (/(proximo mes|mes que vem)/.test(normalized)) {
    start.setUTCDate(start.getUTCDate() + 30);
    end.setUTCDate(end.getUTCDate() + 60);
  } else if (normalized.includes('mes')) {
    end.setUTCDate(end.getUTCDate() + 30);
  } else if (/(ultima|ultimo|historico|passad)/.test(normalized)) {
    start.setUTCDate(start.getUTCDate() - 180);
    end.setTime(now.getTime());
  } else if (normalized.includes('hoje')) {
    end.setUTCDate(end.getUTCDate() + 1);
  } else {
    return undefined;
  }
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

function startOfZonedDay(now: Date, timeZone: string): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  const year = parts.year ?? now.getUTCFullYear();
  const month = parts.month ?? now.getUTCMonth() + 1;
  const day = parts.day ?? now.getUTCDate();
  const localMidnightAsUtc = Date.UTC(year, month - 1, day);
  const localNowAsUtc = Date.UTC(year, month - 1, day, parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0);
  const offsetMs = localNowAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(localMidnightAsUtc - offsetMs);
}
