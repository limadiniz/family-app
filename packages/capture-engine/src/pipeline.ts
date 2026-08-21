import type { CaptureCategory, CaptureProposalTarget } from '@family-app/domain';
import { HEURISTIC_CLASSIFIER, HEURISTIC_EXTRACTOR } from './heuristics';
import type { CapturePipelineDeps, CapturePipelineInput, CapturePipelineOutput } from './types';

/**
 * Maps a classified category to which kind of downstream record a
 * confirmed proposal would create (§16-19). Kept as a pure lookup, not a
 * decision the classifier itself makes, so the mapping is auditable and
 * independent of whichever ClassifierFn implementation is plugged in.
 */
const CATEGORY_TARGET: Record<CaptureCategory, CaptureProposalTarget> = {
  SCHOOL_ANNOUNCEMENT: 'CALENDAR_EVENT',
  SCHOOL_ASSIGNMENT: 'TASK',
  SCHOOL_EXAM: 'CALENDAR_EVENT',
  MEDICAL_PRESCRIPTION: 'DOCUMENT',
  MEDICAL_EXAM: 'DOCUMENT',
  MEDICAL_APPOINTMENT: 'CALENDAR_EVENT',
  ACTIVITY: 'CALENDAR_EVENT',
  CALENDAR_EVENT: 'CALENDAR_EVENT',
  TASK: 'TASK',
  PAYMENT: 'TASK',
  DOCUMENT: 'DOCUMENT',
  TRANSPORTATION: 'CALENDAR_EVENT',
  OTHER: 'TASK',
};

const MIN_READY_CONFIDENCE = 0.5;

/**
 * Runs classification + extraction for one CaptureItem and returns a
 * proposal for a human to confirm, edit-and-confirm, or discard.
 * Deliberately pure and side-effect free — no DB access, no persistence
 * — so apps/api's CaptureService owns writing CaptureExtraction/
 * CaptureProposal rows and is the single place enforcing "never persist
 * a downstream record without confirmation" (§77).
 */
export function runCapturePipeline(
  input: CapturePipelineInput,
  deps: CapturePipelineDeps = {},
): CapturePipelineOutput {
  const classify = deps.classify ?? HEURISTIC_CLASSIFIER;
  const extract = deps.extract ?? HEURISTIC_EXTRACTOR;

  if (input.source !== 'TEXT' || !input.rawText || input.rawText.trim().length === 0) {
    // No OCR/Speech-to-Text provider wired yet (see heuristics.ts ASSUMPTION) —
    // route to manual review rather than fabricate an extraction.
    return { status: 'NEEDS_REVIEW', category: null, extraction: null, proposal: null };
  }

  const classification = classify(input.rawText);
  const extraction = extract(input.rawText, classification.category);
  const overallConfidence = Math.min(classification.confidence, extraction.confidence);

  const extractionResult = {
    extractorName: 'heuristic-v1',
    extractedFields: extraction.fields,
    confidence: overallConfidence,
  };

  const proposal = {
    targetType: CATEGORY_TARGET[classification.category],
    proposedFields: extraction.fields,
    confidence: overallConfidence,
  };

  return {
    status: overallConfidence >= MIN_READY_CONFIDENCE ? 'READY' : 'NEEDS_REVIEW',
    category: classification.category,
    extraction: extractionResult,
    proposal,
  };
}
