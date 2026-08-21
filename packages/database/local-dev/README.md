# local-dev

`00_dev_shim.sql` recreates just enough of Supabase's built-in `auth`
schema and roles to run `supabase/migrations/*.sql` against a bare local
Postgres for development and CI. It is applied automatically by
`pnpm --filter @family-app/database migrate` when `DATABASE_URL` points at
a non-Supabase host (i.e. every local/CI run).

Do not copy this file into `supabase/migrations/` — it must never run
against a real Supabase project, which already provides these primitives
natively.
