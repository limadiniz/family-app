# ZELII AI Decision Assistant — discovery, threat model and P0 plan

Date: 2026-08-22

## Discovery result

The repository already has the most important security boundary: the API resolves the actor and tenant, the
`AiGateway` authorizes each `(subject, domain)` through the Family Policy Engine, and only then calls a scoped
retriever. The web client has no provider key or direct AI database path. RLS provides the independent tenant
boundary.

The current implementation is still a narrow assistant scaffold:

- intent resolution is a keyword heuristic;
- facts have a source pointer, but not the complete provenance/authorization contract required by the UI;
- the answer is primarily text, not a decision card;
- only `PROPOSE_RESPONSIBILITY_ASSIGNMENT` exists and it has no persisted lifecycle;
- memory is explicit, confirmed, domain-scoped and revocable, but lacks correction/supersession, export,
  personalization controls, usage transparency and decision outcomes;
- family plan and deterministic conflict detection exist, but are not part of an authorized AI decision context;
- no dedicated prompt-injection/evaluation suite or AI metrics layer exists.

The requested `POLICY_ENGINE.md`, `FAMILY_CARE_GRAPH.md`, `RESPONSIBILITY_ENGINE.md` and `CAPTURE_ENGINE.md` files
do not exist. Their canonical equivalents are `ARCHITECTURE.md`, `packages/policy-engine`,
`packages/domain/src/entities/responsibility.ts`, `packages/capture-engine` and their tests. This documentation
gap must not be confused with a missing runtime control.

## Baseline

- Production CI for commit `8ff7f28` passed build, tests, migrations, deploy and smoke checks.
- A fresh local monorepo typecheck is currently blocked only in `apps/web` because declared testing dev
  dependencies are absent from the local `node_modules`; API and package typechecks pass. This is an environment
  baseline issue, not a source-code failure, and will be repaired before final validation.

## Threat model

| Threat | Attack/failure path | Required control | Verification |
|---|---|---|---|
| Cross-tenant disclosure | subject/resource id from another family | server-resolved tenant + RLS + Policy Engine | RLS and gateway isolation tests |
| Stale caregiver memory | CareWindow/grant expires after a prior read | authorize on every memory read; no authorization cache | expiry and revoked-access evals |
| Prompt injection | document/OCR/message contains instructions | typed untrusted-data envelope; never concatenate into privileged instructions | adversarial evals |
| Invented fact/source | model emits an unsupported claim | structured facts/signals from server; source ids required; UI separates suggestion | factuality/provenance evals |
| Unconfirmed execution | proposal calls a domain service directly | persisted proposal lifecycle; confirm and execute are separate; reauthorize at both | action lifecycle tests |
| Medical overreach | stale prescription or symptom becomes advice | medical domain guardrails, status/verification shown, no treatment actions | health safety evals |
| Sensitive logs | raw question, prompt or answer persisted | metadata-only audit + redaction + no raw chat persistence | audit/redaction tests |
| Replay/concurrency | expired or already-used proposal executes twice | expiry, version/state compare, idempotency key and terminal states | concurrency/idempotency tests |
| Silent memory drift | inference becomes a confirmed fact | explicit verification status; inferred items cannot be promoted automatically | memory transition tests |
| Provider retention | official memory depends on provider history | product-owned structured store; no provider memory API | configuration and architecture tests |

## Use-case and authorization matrix

| Use case | Required data | Authorization | Deterministic rule | AI role | Allowed action |
|---|---|---|---|---|---|
| Attention today | events, tasks, requests, conflicts | VIEW per subject/domain | due/overlap/status | summarize and prioritize | propose reminder/request |
| Prepare tomorrow | events, tasks, documents | VIEW SCHEDULE plus relevant domain | date/status/checklist | organize checklist | propose task/checklist |
| Three-child conflict | authorized events and assignments | VIEW SCHEDULE for every included child | conflict engine | explain alternatives | propose request/assignment |
| Who can help | care network, grants and current availability | VIEW CONTACTS/TRANSPORTATION and subject scope | eligibility, CareWindow and assignment state | rank options with uncertainty | draft request only |
| Consultation brief | event, health profile, documents, saved questions | VIEW HEALTH/DOCUMENTS/SCHEDULE | appointment window and document status | prepare, never diagnose | propose care brief/checklist |
| Unconfirmed responsibility | request/assignment state | VIEW SCHEDULE/TRANSPORTATION | status and deadline | explain urgency | draft reminder/fallback request |
| What changed | versioned/audited metadata | VIEW source domains | timestamp/version comparison | summarize deltas | no automatic write |
| Redistribute week | events, assignments, care network | VIEW per subject/domain | workload counts and eligibility | present non-blaming alternatives | draft requests |
| Remember preference | explicit user statement | CREATE AI + EDIT source domain | validity and confirmation | normalize minimally | store only after confirmation |
| Use prior memory | active memory item | current VIEW AI + current VIEW source domain | validity/revocation/purpose | contextualize and disclose use | no implicit action |

## Target architecture

```text
Authenticated user
  -> server-resolved actor/tenant
  -> preliminary intent/entities
  -> DecisionContextBuilder
       -> Policy Engine per subject/domain/action
       -> authorized minimal facts with provenance
       -> deterministic signals
       -> current authorized memory
       -> allowed proposal types
  -> structured answer (facts, signals, alternatives, suggestion, sources)
  -> human review
  -> persisted proposal
  -> explicit confirmation + policy/state revalidation
  -> separate domain execution
  -> metadata-only audit
```

The LLM is optional inside the structured-answer step. It never retrieves or executes.

## P0 implementation plan

1. Introduce typed `DecisionContext`, provenance, deterministic signals, structured response and proposal contracts.
2. Build context only from scopes authorized in the gateway; expose denied scopes without revealing hidden content.
3. Add deterministic family signals and source metadata to answers.
4. Add a persisted, expiring and versioned proposal lifecycle with confirmation revalidation.
5. Extend authorized memory with correction/supersession, provenance, usage disclosure, preferences and export.
6. Replace the isolated chat rendering with decision cards and memory controls.
7. Add factuality, authorization, memory, action, medical-safety and injection evals.
8. Keep a deterministic full-feature fallback when the provider is disabled or fails.

P1 proactivity and P2 multimodality may only be enabled after these controls are green.
