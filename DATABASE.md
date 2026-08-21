# DATABASE.md

## Engine

PostgreSQL via Supabase (one project per environment — development / staging / production, §77, §95). All
migrations live in `supabase/migrations/*.sql`, applied via the Supabase CLI (`supabase db push`) in
staging/production, or via `pnpm --filter @family-app/database migrate` (plain `pg` client) in local dev/CI.

## Schema (Phase 0/1)

| Table | Purpose |
|---|---|
| `tenants` | Top-level isolation boundary — one per signup. |
| `persons` | Central entity of the Family Care Graph. May exist without a `users` row. |
| `users` | Authenticated identity, mirrors `auth.users`, links 1:1 to a `person`. |
| `family_units` / `family_memberships` | Many-to-many Person↔FamilyUnit with a `role`. |
| `relationships` | Descriptive kinship/care links — never authoritative for access. |
| `residences` / `residence_memberships` | Multiple households per child; never grants authority by itself. |
| `authority_grants` | Explicit, auditable, revocable, time-boxed permission grants — what the Policy Engine actually reads. |
| `care_schedules` / `care_windows` / `handoffs` | Recurring custody pattern, materialized time windows, handoff state machine. |
| `invitations` | Guardian/caregiver invitation flow with permission presets. |
| `audit_events` | Insert-only (no UPDATE/DELETE policy exists for any client role — immutable by omission). |

Full column definitions are the migrations themselves (`supabase/migrations/`) — treat this file as an index,
not a duplicate source of truth that can drift.

## IDs, timestamps, enums

- All external IDs are UUIDv4 (`gen_random_uuid()`), per §9.
- All timestamps are `timestamptz` (UTC in storage); locale/timezone conversion happens at the presentation
  layer. `residences.timezone` carries the IANA zone used to interpret CareSchedule recurrence locally (§121).
- Enumerated fields (`role`, `domain`, `action`, event types, statuses) are `text` + `CHECK` constraints, not
  native Postgres `ENUM` types — trades a marginally larger column for trivially alterable value sets (no
  `ALTER TYPE` migration dance). See ADR-0003.

## Row Level Security

Every table is `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`. The enforcement pattern is uniform:

```sql
create policy <table>_rw_within_tenant on public.<table>
  for all to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
```

`app.current_tenant_id()` (SECURITY DEFINER, `supabase/migrations/20260819000001_extensions_and_helpers.sql`)
resolves the tenant of `auth.uid()` by reading `public.users`. RLS is the **tenant** boundary; fine-grained,
per-Person authorization within a tenant (a caregiver seeing schedule but not finance) is the Family Policy
Engine's job — see ARCHITECTURE.md §4 and SECURITY.md for why both layers exist.

`audit_events` additionally has no UPDATE/DELETE policy for any client role at all — immutability is enforced
by the *absence* of a grant, which Postgres treats as a default deny even for the table owner once
`FORCE ROW LEVEL SECURITY` is set (superuser/service-role still bypasses, by design, for retention jobs).

## Local development without a hosted Supabase project

`packages/database/local-dev/00_dev_shim.sql` recreates the minimum Supabase primitives (`auth` schema,
`auth.uid()`, the `anon`/`authenticated`/`service_role` roles) on a bare Postgres instance, so
`supabase/migrations/*.sql` — and their RLS policies — can be exercised in CI without provisioning a real
Supabase project. It is applied automatically by the migrate script and is never applied to a real Supabase
database (that already has these primitives natively).

## Testing RLS

`packages/database/test/rls.integration.test.ts` runs real SQL against a live Postgres, impersonating different
`auth.uid()` values via `SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', ...)` — the
same mechanism PostgREST uses per-request in real Supabase. It proves: cross-tenant reads return zero rows
(including exact-ID guesses — IDOR protection), cross-tenant inserts are rejected by `WITH CHECK`, and
`audit_events` rows are insertable but not updatable/deletable.

## Seed data

`packages/database/seed/familia-silva.sql` — the fictional "Família Silva" household from §90: Ana (mãe) +
Carlos (pai) with guarda compartilhada of Mariana and Pedro, Roberto (padrasto), Maria (avó), Joana (babá),
Lucas (adolescente com login próprio). Two residences, two overlapping `FamilyUnit`s (proving the
many-to-many), one active `CareWindow`, one explicit `AuthorityGrant`. Never contains real personal data (§138).

## Migrations discipline

All schema changes go through a new file in `supabase/migrations/`, timestamp-prefixed, applied in filename
order. Production changes always run through the CD pipeline (see DEPLOYMENT.md) — never a manual `psql` session
against a hosted project (§97).
