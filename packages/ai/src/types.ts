import type { PermissionDomain } from '@family-app/domain';
import type { PolicyActor } from '@family-app/policy-engine';

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
  source: {
    type: string;
    id: string;
    occurredAt?: string;
    updatedAt?: string;
    provenance?: FactProvenance;
    verificationStatus?: VerificationStatus;
  };
}

export type FactProvenance =
  | 'USER_DECLARED'
  | 'DOCUMENT_EXTRACTED'
  | 'PROFESSIONAL_CONFIRMED'
  | 'SYSTEM_GENERATED'
  | 'AI_INFERRED';

export type VerificationStatus = 'DECLARED' | 'EXTRACTED' | 'CONFIRMED' | 'INFERRED' | 'OUTDATED';

export interface AuthorizedFact extends RetrievedFact {
  /** Stable source-backed identity; never generated from answer text. */
  id: string;
  /** Minimized structured value. Full database rows never belong here. */
  value: Record<string, unknown>;
  authorization: {
    action: 'VIEW';
    domain: PermissionDomain;
    subjectPersonId: string;
    decisionRule: string;
  };
  contextualValidity?: { validFrom?: string; validUntil?: string };
  verificationStatus: VerificationStatus;
}

export type DecisionSignalType =
  | 'SCHEDULE_CONFLICT'
  | 'RESPONSIBILITY_UNCONFIRMED'
  | 'DOCUMENT_EXPIRING'
  | 'APPOINTMENT_UPCOMING'
  | 'PREPARATION_INCOMPLETE'
  | 'HANDOFF_UPCOMING'
  | 'MEDICATION_CONFIRMATION_MISSING'
  | 'SCHOOL_NOTICE_PROCESSED';

export interface DecisionSignal {
  id: string;
  type: DecisionSignalType;
  severity: 'INFO' | 'ATTENTION' | 'BLOCKING';
  summary: string;
  subjectPersonIds: string[];
  sourceRefs: Array<{ type: string; id: string }>;
  calculatedAt: string;
  ruleId: string;
}

export const PROPOSED_ACTION_TYPES = [
  'PROPOSE_TASK',
  'PROPOSE_CALENDAR_EVENT',
  'PROPOSE_REQUEST',
  'PROPOSE_RESPONSIBILITY_ASSIGNMENT',
  'PROPOSE_REMINDER',
  'PROPOSE_PREPARATION_CHECKLIST',
  'PROPOSE_CARE_BRIEF',
  'PROPOSE_HANDOFF',
  'PROPOSE_SCHEDULE_ADJUSTMENT',
] as const;
export type ProposedActionType = (typeof PROPOSED_ACTION_TYPES)[number];

export type ActionProposalStatus =
  | 'DRAFT'
  | 'READY_FOR_REVIEW'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'EXECUTED'
  | 'FAILED';

export interface ActionProposal {
  proposalId: string;
  type: ProposedActionType;
  status: ActionProposalStatus;
  subjectPersonIds: string[];
  proposedData: Record<string, unknown>;
  factIds: string[];
  uncertainFields: string[];
  expectedEffects: string[];
  requiredAuthorization: Array<{ domain: PermissionDomain; action: 'CREATE' | 'EDIT' | 'MANAGE' }>;
  informationToShare: PermissionDomain[];
  expiresAt: string;
  version: number;
}

export interface DecisionContext {
  actor: Pick<PolicyActor, 'personId' | 'tenantId'>;
  questionIntent: string;
  subjectPersonIds: string[];
  timeWindow?: { startsAt: string; endsAt: string };
  authorizedFacts: AuthorizedFact[];
  deterministicSignals: DecisionSignal[];
  deniedDomains: PermissionDomain[];
  allowedDomains: PermissionDomain[];
  authorizedScopes: Array<{ subjectPersonId: string; domain: PermissionDomain; decisionRule: string }>;
  availableActions: ProposedActionType[];
}

export interface DecisionAlternative {
  id: string;
  title: string;
  impact: string;
  deadline?: string;
  informationShared: PermissionDomain[];
  dependencies: string[];
  uncertainty?: string;
  proposedActionType?: ProposedActionType;
}

export interface StructuredDecision {
  situation: string;
  attention: Array<{ severity: DecisionSignal['severity']; text: string; ruleId: string }>;
  alternatives: DecisionAlternative[];
  suggestion?: { text: string; criteria: string[]; uncertainty?: string };
  userActions: ProposedActionType[];
  sources: Array<{
    factId: string;
    label: string;
    sourceType: string;
    sourceId: string;
    updatedAt?: string;
    provenance: FactProvenance;
    verificationStatus: VerificationStatus;
  }>;
  accessedScope: { subjectPersonIds: string[]; domains: PermissionDomain[]; deniedDomains: PermissionDomain[] };
  safetyNotice?: string;
}

export interface AiAnswer {
  text: string;
  facts: RetrievedFact[];
  deniedDomains: PermissionDomain[];
  decision?: StructuredDecision;
  suggestedAction?: { type: ProposedActionType; payload: Record<string, unknown> };
}

/** Retrieval is delegated to the caller (apps/api) — the AI package never queries Postgres directly. */
export type RetrievalFn = (request: RetrievalRequest) => Promise<RetrievedFact[]>;

/** LLM call is delegated too — no provider SDK is wired in Phase 0/1 (AI_ENABLED=false by default). */
export type LlmCompletionFn = (input: {
  question: string;
  facts: AuthorizedFact[];
  signals: DecisionSignal[];
  allowedDomains: PermissionDomain[];
}) => Promise<string>;
