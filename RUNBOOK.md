# RUNBOOK.md

## Health check

`GET /health` (unauthenticated, outside the `/api/v1` prefix) returns `{ status: 'ok', time }`. Point uptime
monitoring (Phase 7 — not yet configured, e.g. Better Uptime / UptimeRobot / a Vercel/host-native check) here.

## Logs

Structured JSON via `packages/observability` (pino), redacted before emission (see SECURITY.md). Every request
carries an `x-correlation-id` (set by `CorrelationIdMiddleware`, generated if the client didn't send one) —
include it when searching logs for a specific user report.

## Common incidents

**A user reports seeing another family's data.** Highest severity — treat as a security incident, not a bug
report. Immediately: (1) reproduce with the reported `correlationId` in logs, (2) check whether the row came
back through RLS (would indicate a `tenant_id` mismatch bug or a service-role code path used incorrectly) or
through the Policy Engine (would indicate a `PolicyEngineInput` loading bug in `policy.service.ts`), (3) disable
the affected endpoint via feature flag if a fix isn't immediate, (4) this is also a Privacy incident — see
PRIVACY.md's incident section and loop in the DPO/legal contact once designated.

**AuthGuard rejecting valid sessions.** Check `SUPABASE_URL`/`SUPABASE_ANON_KEY` match the environment's actual
Supabase project; `resolveAuthContext` (`packages/auth/src/jwt.ts`) calls `/auth/v1/user` — a Supabase outage or
a wrong URL manifests as every request 401ing.

**Migrations failed mid-deploy.** `supabase/migrations/*.sql` are applied in filename order; Supabase's CLI
tracks applied migrations in its own history table. Do not hand-edit a migration that has already run in any
environment — add a new migration instead (§97).

## Support access to family data (§117)

There is no standing administrative view into family content. If a support engineer must look at a specific
family's data to resolve a ticket, that access must be: scoped to the specific tenant, time-boxed, tied to a
stated purpose (the ticket), and logged as an `AuditEvent`. The Just-In-Time mechanism itself (a temporary,
audited service-role-backed impersonation tool) is a Phase 7 deliverable — not implemented yet. Until it
exists, any support investigation requiring data access needs a service-role script written for that single
incident, reviewed by a second engineer, and its output treated as sensitive.

## Backups

Supabase manages automated backups per its plan tier (point-in-time recovery on paid tiers). RPO/RTO targets
and a periodic restore-drill process are a Phase 7 deliverable — not yet documented with concrete numbers,
since they depend on which Supabase plan the account owner selects (see infra checklist).

## Audit log retention / purge

`audit_events` rows are never deleted by application code (§26). If a retention policy requiring deletion after
N years is adopted (Phase 7, pending legal input per PRIVACY.md), it must run as a superuser/service-role
maintenance job outside the normal `authenticated` RLS path — documented here once it exists, not implemented
today.

## Rotating the Supabase service role key

1. Generate a new key in the Supabase dashboard for the affected project.
2. Update the secret in the API host's secret manager (never in `.env` files committed to git).
3. Redeploy `apps/api`.
4. Revoke the old key in Supabase once the new deploy is confirmed healthy.
