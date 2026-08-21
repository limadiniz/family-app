/**
 * Applies supabase/migrations/*.sql (in filename order) to whatever
 * Postgres DATABASE_URL points at.
 *
 * - Local/CI: point DATABASE_URL at a scratch Postgres and this script
 *   also applies packages/database/local-dev/00_dev_shim.sql first, so the
 *   Supabase-specific bits of the migrations (auth.uid(), authenticated
 *   role, etc.) resolve.
 * - Real Supabase (staging/production): prefer `supabase db push` via the
 *   Supabase CLI, which tracks a migration history table and is what
 *   DEPLOYMENT.md documents for CD. This script is for local dev + the CI
 *   integration-test job only; it does NOT apply the dev shim if
 *   DATABASE_URL host looks like a supabase.co / supabase.in host.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL (or TEST_DATABASE_URL) is not set. See .env.example.');
    process.exit(1);
  }

  const isHostedSupabase = /supabase\.(co|in)/.test(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    if (!isHostedSupabase) {
      const shimPath = join(__dirname, '..', 'local-dev', '00_dev_shim.sql');
      console.log('[migrate] applying local-dev Supabase compatibility shim...');
      // The shim recreates the `auth` schema/roles for local Postgres and is
      // safe to re-run (its statements are themselves idempotent —
      // `create schema if not exists`, `do $$ ... if not exists ...`), so it
      // is intentionally NOT tracked in schema_migrations below.
      await client.query(readFileSync(shimPath, 'utf8'));
    }

    // Track applied migrations so re-running this script (normal in local
    // dev, across sessions, and in CI re-runs) only applies new files
    // instead of re-executing `create table` on tables that already exist.
    // Real Supabase environments should prefer `supabase db push`
    // (DEPLOYMENT.md) which has its own tracking; this table is harmless
    // there too since it only ever gets read/written by this script.
    await client.query(`
      create table if not exists public._schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const { rows: appliedRows } = await client.query<{ filename: string }>(
      'select filename from public._schema_migrations',
    );
    const applied = new Set(appliedRows.map((r) => r.filename));

    const migrationsDir = join(__dirname, '..', '..', '..', 'supabase', 'migrations');
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }
      console.log(`[migrate] applying ${file} ...`);
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into public._schema_migrations (filename) values ($1)', [file]);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw err;
      }
      appliedCount += 1;
    }

    console.log(`[migrate] done — applied ${appliedCount} new migration(s), ${files.length} total on disk.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
