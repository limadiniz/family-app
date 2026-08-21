import type { CaptureCategory, CaptureProposalTarget, CaptureSource, CaptureStatus } from '@family-app/domain';

/**
 * Pluggable classification/extraction contracts (Prompt Mestre V2 §16-22).
 * The pipeline in `pipeline.ts` is written against these interfaces, not
 * against any concrete implementation, so a real OCR/Speech-to-Text/LLM
 * provider can be substituted later (Phase 9, Family Copilot) without
 * touching call sites in apps/api. `heuristics.ts` is today's
 * implementation: deterministic, keyword/regex-based, and — like every
 * extractor, real or heuristic — required to report a `confidence` below
 * 1.0 so downstream code never treats it as certain (§22).
 */
export interface ClassificationResult {
  category: CaptureCategory;
  confidence: number;
}

export type ClassifierFn = (rawText: string) => ClassificationResult;

export interface ExtractionFieldsResult {
  fields: Record<string, unknown>;
  confidence: number;
}

export type ExtractorFn = (rawText: string, category: CaptureCategory) => ExtractionFieldsResult;

export interface CapturePipelineInput {
  source: CaptureSource;
  rawText?: string | null;
}

export interface CapturePipelineDeps {
  classify?: ClassifierFn;
  extract?: ExtractorFn;
}

export interface CapturePipelineOutput {
  /** Only ever NEEDS_REVIEW or READY — the pipeline never produces CONFIRMED (§77). */
  status: Extract<CaptureStatus, 'NEEDS_REVIEW' | 'READY'>;
  category: CaptureCategory | null;
  extraction: {
    extractorName: string;
    extractedFields: Record<string, unknown>;
    confidence: number;
  } | null;
  proposal: {
    targetType: CaptureProposalTarget;
    proposedFields: Record<string, unknown>;
    confidence: number;
  } | null;
}
