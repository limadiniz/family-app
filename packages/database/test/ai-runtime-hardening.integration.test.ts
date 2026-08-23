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
    await db.query(`insert into public.tenants (id, name) values ($1, 'AI Runtime Test')`, [
      TENANT,
    ]);
    await db.query(
      `insert into public.persons (id, tenant_id, display_name, person_type) values ($1, $2, 'Responsável IA', 'ADULT')`,
      [PERSON, TENANT],
    );
    await db.query(
      'insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing',
      [ACCOUNT, 'ai-runtime-test@example.com'],
    );
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
      const first = await client.query('select * from public.consume_ai_rate_limit($1, 2)', [
        TENANT,
      ]);
      const second = await client.query('select * from public.consume_ai_rate_limit($1, 2)', [
        TENANT,
      ]);
      const third = await client.query('select * from public.consume_ai_rate_limit($1, 2)', [
        TENANT,
      ]);
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

  it('queues a versioned rebuild and invalidates old chunks in the same source transaction', async () => {
    const capture = await db.query(
      `insert into public.capture_items
         (tenant_id, created_by_person_id, subject_person_id, source, status, raw_text, category)
       values ($1, $2, $2, 'TEXT', 'CONFIRMED', 'Levar autorização para o passeio', 'SCHOOL_ANNOUNCEMENT')
       returning id, ai_index_version`,
      [TENANT, PERSON],
    );
    const captureId = capture.rows[0].id as string;
    expect(capture.rows[0].ai_index_version).toBe('1');

    const event = await db.query(
      `select source_version, event_type, status
         from public.ai_invalidation_events
        where source_type = 'CAPTURE_ITEM' and source_id = $1`,
      [captureId],
    );
    expect(event.rows).toEqual([{ source_version: '1', event_type: 'UPSERT', status: 'PENDING' }]);

    await db.query(
      `insert into public.ai_content_chunks (
         tenant_id, subject_person_id, domain, source_type, source_id, source_version,
         chunk_index, content_text, content_hash, embedding_provider, embedding_model,
         embedding_dimensions, embedding, sensitivity, verification_status
       ) values ($1, $2, 'SCHOOL', 'CAPTURE_ITEM', $3, 1, 0, 'Autorização passeio',
                 repeat('a', 64), 'test-only', 'test-3d', 3, '[1,0,0]', 'PERSONAL', 'CONFIRMED')`,
      [TENANT, PERSON, captureId],
    );

    await db.query(
      `update public.capture_items set raw_text = 'Autorização atualizada' where id = $1`,
      [captureId],
    );
    const invalidated = await db.query(
      `select deleted_at is not null as invalidated
         from public.ai_content_chunks
        where source_type = 'CAPTURE_ITEM' and source_id = $1`,
      [captureId],
    );
    expect(invalidated.rows[0].invalidated).toBe(true);

    const versions = await db.query(
      `select source_version, event_type
         from public.ai_invalidation_events
        where source_type = 'CAPTURE_ITEM' and source_id = $1
        order by source_version`,
      [captureId],
    );
    expect(versions.rows).toEqual([
      { source_version: '1', event_type: 'UPSERT' },
      { source_version: '2', event_type: 'UPSERT' },
    ]);
  });

  it('matches vectors only inside the authenticated tenant, person and domain scope', async () => {
    const sourceId = '33000000-0000-4000-8000-000000000099';
    await db.query(
      `insert into public.ai_content_chunks (
         tenant_id, subject_person_id, domain, source_type, source_id, source_version,
         chunk_index, content_text, content_hash, embedding_provider, embedding_model,
         embedding_dimensions, embedding, sensitivity, verification_status
       ) values ($1, $2, 'SCHOOL', 'CAPTURE_ITEM', $3, 1, 0, 'Passeio pedagógico amanhã',
                 repeat('b', 64), 'test-only', 'test-3d', 3, '[1,0,0]', 'PERSONAL', 'CONFIRMED')`,
      [TENANT, PERSON, sourceId],
    );

    const matches = await asUser((client) =>
      client.query(
        `select source_id, similarity
           from public.match_ai_content_chunks($1, array[$2]::uuid[], array['SCHOOL'], '[1,0,0]', 'test-3d', 5)`,
        [TENANT, PERSON],
      ),
    );
    expect(matches.rows.some((row) => row.source_id === sourceId)).toBe(true);

    await expect(
      asUser((client) =>
        client.query(
          `select * from public.match_ai_content_chunks(
             '33000000-0000-4000-8000-000000000098', array[$1]::uuid[], array['SCHOOL'], '[1,0,0]', 'test-3d', 5
           )`,
          [PERSON],
        ),
      ),
    ).rejects.toThrow(/tenant scope denied/i);
  });

  it('does not expose the service-only invalidation outbox to authenticated clients', async () => {
    await expect(
      asUser((client) => client.query('select * from public.ai_invalidation_events')),
    ).rejects.toThrow(/permission denied/i);
  });

  it('invalidates an exact/semantic cache entry when a referenced source changes', async () => {
    const capture = await db.query(
      `insert into public.capture_items
         (tenant_id, created_by_person_id, subject_person_id, source, status, raw_text, category)
       values ($1, $2, $2, 'TEXT', 'CONFIRMED', 'Autorização entregue', 'SCHOOL_ANNOUNCEMENT')
       returning id`,
      [TENANT, PERSON],
    );
    const captureId = capture.rows[0].id as string;
    const cacheId = await db.query(
      `insert into public.ai_response_cache (
         tenant_id, actor_person_id, exact_key, question_hash, policy_fingerprint,
         source_fingerprint, subject_person_ids, domains, prompt_version, model_version,
         response_payload, source_refs, expires_at
       ) values (
         $1, $2, repeat('a', 64), repeat('b', 64), repeat('c', 64), repeat('d', 64),
         array[$2]::uuid[], array['SCHOOL'], 'v1', 'model-1',
         '{"answer":"Entregue","supportedFactIds":[]}'::jsonb,
         jsonb_build_array(jsonb_build_object('type', 'capture_items', 'id', $3::text, 'version', '1')),
         now() + interval '5 minutes'
       ) returning id`,
      [TENANT, PERSON, captureId],
    );

    await db.query(
      `update public.capture_items set raw_text = 'Autorização revisada' where id = $1`,
      [captureId],
    );
    const invalidated = await db.query(
      'select invalidated_at is not null as invalidated from public.ai_response_cache where id = $1',
      [cacheId.rows[0].id],
    );
    expect(invalidated.rows[0].invalidated).toBe(true);
  });

  it('keeps cache payloads service-only and tool/agent telemetry metadata-only', async () => {
    await expect(
      asUser((client) => client.query('select * from public.ai_response_cache')),
    ).rejects.toThrow(/permission denied/i);

    const { rows } = await db.query(
      `select table_name, column_name
         from information_schema.columns
        where table_schema = 'public'
          and table_name in ('ai_tool_runs', 'ai_agent_runs')`,
    );
    const columns = rows.map((row) => `${row.table_name}.${row.column_name}`);
    expect(columns).not.toContain('ai_tool_runs.arguments');
    expect(columns).not.toContain('ai_tool_runs.result');
    expect(columns).not.toContain('ai_agent_runs.objective');
    expect(columns).not.toContain('ai_agent_runs.tool_results');
  });
});
