/**
 * Seeds the fictional "Família Silva" household described in the master
 * prompt §90, for local development and E2E tests. Never run against
 * production (the script refuses if DATABASE_URL looks like a hosted
 * Supabase project outside development).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL (or TEST_DATABASE_URL) is not set.');
    process.exit(1);
  }
  if (/supabase\.(co|in)/.test(databaseUrl) && process.env.APP_ENV !== 'development') {
    console.error('[seed] refusing to seed a hosted Supabase project outside APP_ENV=development.');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const sql = readFileSync(join(__dirname, '..', 'seed', 'familia-silva.sql'), 'utf8');
    await client.query(sql);
    console.log('[seed] Família Silva seeded.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
