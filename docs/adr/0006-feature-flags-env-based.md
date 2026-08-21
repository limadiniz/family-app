# ADR-0006: Feature flags via environment variables (Phase 0/1), not a database table

## Status
Accepted — revisit at Phase 7

## Context
§110 requires feature flags (`AI_ENABLED`, `OCR_ENABLED`, `FINANCE_ENABLED`, `TEEN_ACCESS_ENABLED`). A
database-backed, per-tenant flag system is more powerful (gradual rollout, per-account overrides) but is not
needed yet — Phase 0/1 has no rollout audience to target.

## Decision
`packages/config/src/feature-flags.ts` reads flags from environment variables (`FF_*`), validated with Zod,
with safe defaults (AI and OCR off by default; finance and teen access on).

## Consequences
- Zero infrastructure needed today; flags are environment-wide, not per-tenant.
- Per-tenant/gradual-rollout flags (e.g. enabling AI for a beta cohort first) require a Phase 7 upgrade to a
  database-backed flag table plus a caching layer — not built yet, and intentionally deferred rather than
  over-engineered now.
