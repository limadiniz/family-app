# ADR-0003: `text` + `CHECK` constraints instead of native Postgres `ENUM` types

## Status
Accepted

## Context
The domain has many closed-value fields (`role`, `PermissionDomain`, `PermissionAction`, event types, statuses).
Postgres native `ENUM` types enforce the same constraint but are notoriously awkward to evolve: adding a value
is fine, but removing/renaming one requires recreating the type and every dependent column.

## Decision
Use `text` columns with `CHECK (col IN (...))` constraints, matching the Zod enums in `packages/domain` 1:1 by
convention (not by codegen, yet — see "Consequences").

## Consequences
- Adding, removing, or renaming a permitted value is a single, ordinary migration (`ALTER TABLE ... DROP
  CONSTRAINT ...; ALTER TABLE ... ADD CONSTRAINT ...`), no type-recreation dance.
- Trade-off accepted: the TypeScript enum (source of truth for the app) and the SQL `CHECK` list must be kept in
  sync by hand today. A Phase 2+ improvement is generating the SQL constraint from the Zod schema at migration-
  authoring time — tracked as a follow-up, not yet built.
