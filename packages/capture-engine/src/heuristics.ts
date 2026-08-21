import type { CaptureCategory } from '@family-app/domain';
import type { ClassificationResult, ClassifierFn, ExtractionFieldsResult, ExtractorFn } from './types';

/**
 * ASSUMPTION (documented per project rule — never block on an
 * unavailable external decision, never invent a secret): no AI/OCR/
 * Speech-to-Text provider key is configured for this environment
 * (`.env.example`'s `AI_PROVIDER_API_KEY` is an empty placeholder). This
 * module is a deterministic, keyword/regex-based stand-in for `TEXT`
 * captures so the Universal Family Inbox pipeline is real and testable
 * today. It is intentionally conservative: confidence never reaches 1.0,
 * and anything it can't confidently place falls into `OTHER`/manual
 * review rather than guessing. Swap `HEURISTIC_CLASSIFIER`/
 * `HEURISTIC_EXTRACTOR` for a real provider-backed implementation in a
 * later phase — the `ClassifierFn`/`ExtractorFn` contracts do not change.
 */
const CATEGORY_KEYWORDS: Array<[CaptureCategory, string[]]> = [
  ['SCHOOL_EXAM', ['prova', 'avaliação', 'avaliacao', 'exame escolar']],
  ['SCHOOL_ASSIGNMENT', ['trabalho escolar', 'tarefa de casa', 'lição de casa', 'licao de casa', 'entrega do trabalho']],
  ['SCHOOL_ANNOUNCEMENT', ['comunicado', 'circular', 'reunião de pais', 'reuniao de pais', 'passeio escolar']],
  ['MEDICAL_PRESCRIPTION', ['receita médica', 'receita medica', 'prescrição', 'prescricao', 'mg,', 'comprimido']],
  ['MEDICAL_EXAM', ['resultado de exame', 'exame de sangue', 'laboratório', 'laboratorio']],
  ['MEDICAL_APPOINTMENT', ['consulta', 'pediatra', 'dentista', 'médico', 'medico', 'dra.', 'dr.']],
  ['ACTIVITY', ['natação', 'natacao', 'futebol', 'balé', 'bale', 'atividade extracurricular']],
  ['PAYMENT', ['pagamento', 'boleto', 'mensalidade', 'valor de']],
  ['TRANSPORTATION', ['transporte escolar', 'van escolar', 'buscar', 'levar até', 'levar ate']],
  ['CALENDAR_EVENT', ['reunião', 'reuniao', 'evento', 'passeio', 'museu']],
  ['TASK', ['levar', 'preparar', 'lembrar de']],
];

export const HEURISTIC_CLASSIFIER: ClassifierFn = (rawText: string): ClassificationResult => {
  const normalized = rawText.toLowerCase();
  let best: { category: CaptureCategory; score: number } = { category: 'OTHER', score: 0 };
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    const score = keywords.filter((kw) => normalized.includes(kw)).length;
    if (score > best.score) {
      best = { category, score };
    }
  }
  if (best.score === 0) {
    return { category: 'OTHER', confidence: 0.2 };
  }
  // Conservative, monotonic-but-capped confidence — never claims certainty.
  const confidence = Math.min(0.4 + best.score * 0.15, 0.85);
  return { category: best.category, confidence };
};

const DATE_PATTERN = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
const TIME_PATTERN = /\b(\d{1,2})[:h](\d{2})?\b/i;

function extractDateIso(rawText: string, referenceYear: number): string | null {
  const match = DATE_PATTERN.exec(rawText);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = match[3] ? Number(match[3]) : referenceYear;
  if (year < 100) year += 2000;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function extractTime(rawText: string): string | null {
  const match = TIME_PATTERN.exec(rawText);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (hour > 23 || minute > 59) return null;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function guessTitle(rawText: string): string {
  const firstLine = rawText.split(/\r?\n/).find((line) => line.trim().length > 0) ?? rawText;
  return firstLine.trim().slice(0, 150);
}

export function makeHeuristicExtractor(now: () => Date = () => new Date()): ExtractorFn {
  return (rawText: string, category: CaptureCategory): ExtractionFieldsResult => {
    const referenceYear = now().getUTCFullYear();
    const dateIso = extractDateIso(rawText, referenceYear);
    const time = extractTime(rawText);
    const title = guessTitle(rawText);

    const fields: Record<string, unknown> = { title, category };
    let hits = 0;
    if (dateIso) {
      fields['date'] = dateIso;
      hits += 1;
    }
    if (time) {
      fields['time'] = time;
      hits += 1;
    }
    const confidence = Math.min(0.3 + hits * 0.25, 0.8);
    return { fields, confidence };
  };
}

export const HEURISTIC_EXTRACTOR: ExtractorFn = makeHeuristicExtractor();
