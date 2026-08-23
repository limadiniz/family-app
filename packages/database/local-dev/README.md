# local-dev

`00_dev_shim.sql` recreates just enough of Supabase's built-in `auth`
schema and roles to run `supabase/migrations/*.sql` against a bare local
Postgres for development and CI. It is applied automatically by
`pnpm --filter @family-app/database migrate` when `DATABASE_URL` points at
a non-Supabase host (i.e. every local/CI run).

Do not copy this file into `supabase/migrations/` — it must never run
against a real Supabase project, which already provides these primitives
natively.

Starting with AI Phase 1, the local PostgreSQL server must include the
`pgvector` extension. The CI reference image is `pgvector/pgvector:pg16`.

## Instância portátil deste computador

Uma instância isolada PostgreSQL 16.15 + pgvector 0.8.6 está instalada em:

```text
C:\Users\Daniel\Desktop\ZELII\.local-db
```

Ela não altera os serviços PostgreSQL 16/17 já instalados no Windows, escuta
somente em `127.0.0.1:55432` e usa autenticação `trust` exclusivamente para
desenvolvimento local.

```powershell
.\scripts\start-portable-postgres.ps1
.\scripts\test-portable-database.ps1
.\scripts\stop-portable-postgres.ps1
```

Conexões:

```text
DATABASE_URL=postgresql://postgres@127.0.0.1:55432/zelii_dev
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/zelii_test
```

`zelii_dev` contém o seed fictício Família Silva. `zelii_test` é descartável
e existe apenas para a suíte de integração.
