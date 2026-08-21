# SECURITY.md

## Threat model summary

The platform stores data about children — the highest-sensitivity category it handles. The primary threats we
design against, in priority order: (1) one family reading another family's data, (2) a caregiver with narrow,
time-boxed authority reading beyond their scope (finance, full medical history) or retaining access after that
scope ends, (3) a client-side bug or malicious client bypassing server-side checks (IDOR/BOLA), (4) an LLM
integration becoming an unauthorized data-access path, (5) credential/secret leakage.

## Defense in depth

Two independent layers, deliberately not collapsed into one:

1. **Row Level Security (Postgres)** — the tenant wall. See DATABASE.md. Enforced even if application code has
   a bug; every table is `FORCE ROW LEVEL SECURITY`.
2. **Family Policy Engine (application layer)** — fine-grained, within-tenant authorization
   (`packages/policy-engine`). Pure, unit-tested, called from exactly one place in `apps/api`
   (`common/policy.service.ts`). No controller/service implements its own `if (role === ...)` shortcut (§25) —
   this is enforced by convention and a linked ESLint rule (`.eslintrc.json`'s `no-restricted-syntax`) that
   flags direct `role === '<value>'` comparisons.

Neither layer alone is sufficient: RLS can't reasonably express "temporary caregiver, active care window,
health domain view-only, no finance" as a static per-row policy; the Policy Engine alone would leave a bug in
`apps/api` able to read across tenants.

## Secrets

`SUPABASE_SERVICE_ROLE_KEY` is read only by `apps/api` (`common/supabase.service.ts`) and is never sent to
`apps/web` or `apps/mobile` — those only ever hold the anon key, which is safe to ship client-side because RLS
governs what it can do. `.env.example` documents every variable with no real values; `.gitignore` excludes all
`.env*` files except the example. See DEPLOYMENT.md for how each environment's secrets are actually stored
(never in the repo).

## AuthN / AuthZ

- Supabase Auth issues the session; `apps/api`'s `AuthGuard` verifies every bearer token server-side via
  Supabase's `/auth/v1/user` introspection before trusting any identity claim (§67) — the client-supplied
  `Authorization` header is the only thing trusted, never a body-supplied user/tenant/person id.
  MFA is available via Supabase Auth (enable per-project in Supabase Auth settings — see infra checklist);
  passkey support is a documented future upgrade (ADR-0007).
- `tenantId`/`personId` are always resolved server-side from `public.users` (self-select RLS policy), never
  taken from client input.

## IDOR / BOLA protection

`packages/database/test/rls.integration.test.ts` proves that guessing another tenant's exact row ID returns
zero rows. `packages/policy-engine/test/isolation.test.ts` proves the same at the business-authorization layer
(a TEEN substituting a sibling's ID into a FINANCE request is denied). Both suites run in CI on every PR.

## AI

`packages/ai/src/ai-gateway.ts` cannot retrieve a fact for a domain the Policy Engine hasn't just authorized for
that exact (actor, subject, domain) triple — see AI_ARCHITECTURE.md. There is no code path from `apps/web` or
`apps/mobile` directly to an LLM or directly to Postgres for AI purposes (§54); both hold only the Supabase anon
key and the API base URL.

## Storage (Phase 4+ — documented ahead of implementation)

Planned buckets: `private-documents`, `medical-documents`, `school-documents`, `avatars`, `temporary-uploads`.
All non-avatar buckets default to private with short-lived signed URLs; MIME-type verification and file-size
limits are enforced server-side before persistence, never trusted from the client `Content-Type` header alone.

## Logging

`packages/observability`'s `redact()` strips any key matching a sensitive-name pattern (password, token,
secret, prescription, diagnosis, cpf, health, ...) at any nesting depth before a log line or `AuditEvent.context`
is persisted (§76). Tested in `packages/observability/test/redaction.test.ts`.

## Rate limiting, CORS, headers

`apps/api` restricts CORS to `CORS_ALLOWED_ORIGINS` (env-configured, no wildcard in staging/production).
Rate limiting (per-IP and per-account) and standard security headers (HSTS, CSP, X-Content-Type-Options) are
Phase 7 hardening items — tracked, not yet wired into `main.ts`; see the Phase 7 checklist below.

## Security test coverage (§89) — status

| Test | Location | Status |
|---|---|---|
| Family A never reads Family B | `packages/database/test/rls.integration.test.ts` | ✅ |
| IDOR by guessing an ID | same file | ✅ |
| Babá does not access finance | `packages/policy-engine/test/isolation.test.ts` | ✅ |
| Expired caregiver loses access | same file | ✅ |
| Teen cannot self-escalate | same file | ✅ |
| AI never bypasses Policy Engine | `packages/ai/test/ai-gateway.test.ts` | ✅ |
| Audit log is immutable | `packages/database/test/rls.integration.test.ts` | ✅ |
| Signed document URL expires | — | Pending Phase 10 (storage not yet implemented) |
| Revoked access stops working immediately | Covered structurally (grants are read live, no caching) — dedicated test pending | Partial |
| Cross-tenant isolation on Universal Inbox / Request Engine / Emergency Profile | `packages/database/test/rls-v2.integration.test.ts` | ✅ |
| `request_actions` trail is append-only (no UPDATE/DELETE) | same file | ✅ |
| Capture pipeline never persists a downstream record without human confirmation | `packages/capture-engine/test/pipeline.test.ts`, `packages/domain/test/capture.test.ts` | ✅ |
| Request effect never applies before acceptance | `packages/domain/test/request.test.ts` (state machine); full HTTP-level integration test blocked on a real Supabase/PostgREST instance (see gap-analysis-v2.md) | Partial |
| Emergency Profile access is always audited (allow AND deny) | `apps/api/test/wellbeing.emergency-audit.test.ts` | ✅ |
| Cross-tenant isolation on ResponsibilityAssignment / CareNetworkMember / DelegationPolicy | `packages/database/test/rls-v3.integration.test.ts` | ✅ |
| Babá (can_delegate=false) cannot delegate a responsibility | `apps/api/test/care-network.test.ts` | ✅ |
| Nobody can grant a permission bundle broader than their own authority (§8) | same file | ✅ |
| A narrow responsibility type (PICKUP) never mints a CareWindow or HEALTH/DOCUMENTS/FINANCE access | same file | ✅ |
| Only the assigned person may accept/decline/complete a responsibility | same file | ✅ |

## Phase 7 hardening checklist (not yet done — tracked here so it isn't lost)

- [ ] Rate limiting middleware in `apps/api`
- [ ] CSP / security headers (`helmet` or equivalent)
- [ ] Load testing
- [ ] Dependency vulnerability scanning in CI
- [ ] Signed-URL expiry tests once Storage buckets exist
- [ ] Penetration test / external security review before production launch
