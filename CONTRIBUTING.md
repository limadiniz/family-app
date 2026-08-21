# CONTRIBUTING.md

## Before you start

- Node 20+, pnpm 10+ (`corepack enable`).
- `pnpm install` at the repo root — the monorepo uses pnpm workspaces + Turborepo; never `npm install` inside a
  single package.

## Where things go

- Shared types/validation → `packages/domain` (Zod schemas are the source of truth; derive TS types from them,
  don't hand-write parallel interfaces).
- Any check that decides whether an action is allowed → `packages/policy-engine`, called through
  `apps/api/src/common/policy.service.ts`. Never write `if (role === '...')` in a controller or React component
  — an ESLint rule flags direct role-string comparisons for this reason.
- Structural graph invariants (e.g. "one FAMILY_OWNER per FamilyUnit") → `packages/business-rules`.
- Anything touching the schema → a new file in `supabase/migrations/`, never a hand-edit of an already-applied
  migration.

## Code style

- TypeScript strict mode everywhere (`tsconfig.base.json`); `noUncheckedIndexedAccess` is on — handle the
  `undefined` case rather than asserting it away.
- Prettier (`.prettierrc.json`) + ESLint (`.eslintrc.json`) — `pnpm lint` / `pnpm format` before opening a PR.
- Prefer explicit, human-readable error messages in pt-BR for anything user-facing (§118); keep technical detail
  in logs only.

## Tests

- `pnpm test` runs every package's Vitest suite, including the security isolation tests
  (`packages/policy-engine/test/isolation.test.ts`, `packages/database/test/rls.integration.test.ts`,
  `packages/ai/test/ai-gateway.test.ts`). A PR that touches authorization logic must keep these green and, in
  most cases, add a new case rather than modify an existing assertion's expected outcome.
- The RLS integration suite needs `TEST_DATABASE_URL` pointing at a scratch Postgres with migrations applied —
  CI provisions this automatically (see `.github/workflows/ci.yml`); locally, point it at your dev database.

## Commit / PR conventions

- Branch from `develop`: `feature/<short-description>` or `fix/<short-description>` (§101).
- Keep PRs scoped to one phase/concern where possible — this repo's history is organized by the phases in
  ARCHITECTURE.md §7.
- Migrations, domain schema changes, and Policy Engine changes should each be reviewable independently of
  unrelated UI changes when feasible.

## Documenting decisions

A non-trivial architectural choice gets an ADR in `docs/adr/` (copy the format of an existing one) rather than
just a comment — comments explain *what*, ADRs explain *why we chose this over the alternatives*.
