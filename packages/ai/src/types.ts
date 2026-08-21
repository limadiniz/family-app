import type { PermissionDomain } from '@family-app/domain';

/**
 * A RetrievalRequest is what an intent resolver decides it NEEDS in order
 * to answer a question — before any authorization has happened. The AI
 * Gateway turns this into zero or more actually-permitted retrievals.
 */
export interface RetrievalRequest {
  domain: PermissionDomain;
  subjectPersonId: string;
}

export interface RetrievedFact {
  domain: PermissionDomain;
  subjectPersonId: string;
  summary: string;
  /** §56 — every fact-bearing answer must be traceable to its source. */
  source: { type: string; id: string; occurredAt?: string };
}

export interface AiAnswer {
  text: string;
  facts: RetrievedFact[];
  deniedDomains: PermissionDomain[];
  suggestedAction?: {
    type: string;
    payload: Record<string, unknown>;
  };
}

/** Retrieval is delegated to the caller (apps/api) — the AI package never queries Postgres directly. */
export type RetrievalFn = (request: RetrievalRequest) => Promise<RetrievedFact[]>;

/** LLM call is delegated too — no provider SDK is wired in Phase 0/1 (AI_ENABLED=false by default). */
export type LlmCompletionFn = (input: { question: string; facts: RetrievedFact[] }) => Promise<string>;
