import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

const TENANT = '33000000-0000-4000-8000-000000000001';
const PERSON = '33000000-0000-4000-8000-000000000002';
const ACCOUNT = '33000000-0000-4000-8000-000000000003';

describeIfDb('AI runtime hardening (real Postgres)', () => {
  let db: Client;

  beforeAll(async () => {
    db = new Client({ connectionString: DATABASE_URL });
    await db.connect();
    await db.query(`insert into public.tenants (id, name) values ($1, 'AI Runtime Test')`, [TENANT]);
    await db.query(
      `insert into public.persons (id, tenant_id, display_name, person_type) values ($1, $2, 'Responsável IA', 'ADULT')`,
      [PERSON, TENANT],
    );
    await db.query('insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing', [
      ACCOUNT,
      'ai-runtime-test@example.com',
    ]);
    await db.query(`insert into public.accounts (id, email, status) values ($1, $2, 'ACTIVE')`, [
      ACCOUNT,
      'ai-runtime-test@example.com',
    ]);
    await db.query(
      `insert into public.account_memberships (account_id, tenant_id, person_id, status) values ($1, $2, $3, 'ACTIVE')`,
      [ACCOUNT, TENANT, PERSON],
    );
  });

  afterAll(async () => {
    await db.query('delete from public.tenants where id = $1', [TENANT]);
    await db.query('delete from public.accounts where id = $1', [ACCOUNT]);
    await db.query('delete from auth.users where id = $1', [ACCOUNT]);
    await db.end();
  });

  async function asUser<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    await db.query('begin');
    try {
      await db.query('set local role authenticated');
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ACCOUNT]);
      return await fn(db);
    } finally {
      await db.query('rollback');
    }
  }

  it('allows only the configured number of AI requests in a shared minute bucket', async () => {
    const results = await asUser(async (client) => {
      const first = await client.query('select * from public.consume_ai_rate_limit($1, 2)', [TENANT]);
      const second = await client.query('select * from public.consume_ai_rate_limit($1, 2)', [TENANT]);
      const third = await client.query('select * from public.consume_ai_rate_limit($1, 2)', [TENANT]);
      return [first.rows[0], second.rows[0], third.rows[0]];
    });

    expect(results.map((result) => result.allowed)).toEqual([true, true, false]);
    expect(results.map((result) => result.remaining)).toEqual([1, 0, 0]);
  });

  it('creates searchable Portuguese vectors without storing a separate embedding', async () => {
    const { rows } = await db.query(
      `insert into public.capture_items
         (tenant_id, created_by_person_id, subject_person_id, source, status, raw_text, category)
       values ($1, $2, $2, 'TEXT', 'CONFIRMED', 'Autorização da escola entregue amanhã', 'SCHOOL_ANNOUNCEMENT')
       returning search_vector @@ websearch_to_tsquery('portuguese', 'autorização escola') as matches`,
      [TENANT, PERSON],
    );
    expect(rows[0].matches).toBe(true);
  });

  it('keeps raw prompt and answer fields out of AI telemetry by schema', async () => {
    const { rows } = await db.query(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'ai_runs'`,
    );
    const columns = rows.map((row) => row.column_name);
    expect(columns).not.toContain('question');
    expect(columns).not.toContain('prompt');
    expect(columns).not.toContain('answer');
  });
});
