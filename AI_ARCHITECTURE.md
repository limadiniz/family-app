# AI_ARCHITECTURE.md

## Status

Structural implementation only (Phase 0/1 deliverable). `AI_ENABLED` feature flag defaults to `false`
(`packages/config/src/feature-flags.ts`); no LLM provider is called yet. What exists today is the part that
matters most for safety: the Gateway shape that makes it *impossible* for a question to reach a model without
first clearing the Family Policy Engine, per domain, per subject.

## The mandatory path

```
User question (web/mobile)
        │  (bearer token only — no LLM key, no DB access from the client)
        ▼
apps/api  ──►  AiGateway.ask(actor, question, subjectPersonIds)   [packages/ai]
        │
        ├─ resolveIntentDomains(question)   → which PermissionDomains are implicated
        │     (keyword heuristic today — §128 ASSUMPTION; Phase 6 upgrades this to an
        │      LLM-assisted classifier, WITHOUT changing anything below this line)
        │
        ├─ for each (domain, subjectPersonId):
        │      FamilyPolicyEngine.authorize(...)  →  ALLOW | DENY | REQUIRE_CONFIRMATION
        │      ── only on ALLOW does `retrieve()` ever get called ──
        │
        ├─ retrieve() — scoped fetch, delegated to apps/api (never inside packages/ai itself)
        ├─ complete() — LLM call, delegated (no provider SDK wired yet)
        └─ recordAudit() — always, regardless of outcome (AI_QUERY / AI_ACTION events, §26)
```

This is enforced structurally, not just by convention: `AiGateway`'s constructor requires a `loadPolicyInput`
and calls `FamilyPolicyEngine.authorize` inline before ever invoking the injected `retrieve` function — see
`packages/ai/src/ai-gateway.ts`. `packages/ai/test/ai-gateway.test.ts` proves the exact scenario from §135:
a GUARDIAN asking "quando Pedro tem consulta?" gets an answer with a source; a babá asking for Pedro's full
medical history with no grant gets a denial, and `retrieve()`/`complete()` are never called at all.

## §54's prohibition, satisfied by construction

"Nunca permitir mobile/web → LLM → database": `apps/web` and `apps/mobile` never hold `AI_PROVIDER_API_KEY` or
`SUPABASE_SERVICE_ROLE_KEY`. The only network calls they make are to Supabase Auth (session management) and to
`apps/api` (bearer-token authenticated). `AiGateway` lives inside `apps/api`'s dependency graph only.

## Sources (§56)

`RetrievedFact.source` (`packages/ai/src/types.ts`) is mandatory on every fact the gateway assembles — the
answer text is built from facts that each carry a `{ type, id, occurredAt }` pointer back to the record that
justified them, so the eventual UI can always render "Fonte: Consulta pediátrica registrada em 03/08/2026"
rather than an unsourced claim.

## Guardrails for medical content (§40)

Not yet reachable (no LLM wired), but the constraint is recorded here so Phase 6 implements it correctly: the
AI may organize, summarize, and explain in general terms information already recorded by a human, and it may
remind about a registered treatment — it must never diagnose as fact, alter a dose, suggest compensating a
missed dose, suggest suspending treatment, or modify a prescription. This is a prompt-level and
output-validation concern for Phase 6, not something `packages/ai`'s current scaffolding can violate today
simply because it doesn't call a model yet.

## Confirmation loop for AI-suggested actions (§57)

Any AI-suggested write (e.g. "quer adicionar essa consulta à agenda?") must, once implemented, go through the
exact same `PolicyService.authorizeOrThrow(..., { confirmed: true })` path a human-initiated action would —
there is no separate, weaker "AI action" authorization path. `AiAnswer.suggestedAction` (`packages/ai/src/types.ts`)
is a proposal only; executing it is deliberately left to a normal, auditable API call, never performed
automatically by the Gateway itself.

## Event Bus for proactive AI (§58)

Not implemented in Phase 0/1. `packages/domain`'s event-shaped concerns (conflicts, medication due, document
expiring) are named in ARCHITECTURE.md's phase table; wiring a real event bus is a Phase 2-3 dependency
(notifications) that Phase 6's proactive AI will subscribe to.
