import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

/**
 * RLS-level security isolation tests (§88-89), run against a real
 * Postgres instance with the actual `supabase/migrations/*.sql` applied
 * (via `pnpm --filter @family-app/database migrate`, which also applies
 * the local-dev shim). These complement — not replace — the pure
 * unit tests in packages/policy-engine/test/isolation.test.ts: this
 * suite proves the *database* itself refuses cross-tenant reads/writes
 * even if application code had a bug, which is the whole point of
 * defense-in-depth RLS (§10).
 *
 * Requires TEST_DATABASE_URL (or DATABASE_URL) to point at a Postgres
 * instance with migrations already applied. Skipped automatically if
 * neither is set, so `pnpm test` stays green in environments without a
 * database (e.g. a contributor's first `pnpm install`).
 */

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

const TENANT_A = '20000000-0000-0000-0000-00000000000a';
const TENANT_B = '20000000-0000-0000-0000-00000000000b';
const AUTH_USER_A = '20000000-0000-0000-0000-0000000000a1';
const PERSON_A_GUARDIAN = '20000000-0000-0000-0000-0000000000a2';
const PERSON_A_CHILD = '20000000-0000-0000-0000-0000000000a3';
const PERSON_B_GUARDIAN = '20000000-0000-0000-0000-0000000000b2';

const describeIfDb = DATABASE_URL ? describe : describe.skip;

describeIfDb('RLS — Family A never reads or writes Family B (real Postgres)', () => {
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: DATABASE_URL });
    await admin.connect();

    // Clean slate for this fixed pair of tenant ids, then create fixtures
    // as the superuser (bypasses RLS by design — this is fixture setup,
    // not something under test).
    await admin.query('delete from public.tenants where id in ($1, $2)', [TENANT_A, TENANT_B]);
    await admin.query('delete from public.accounts where id = $1', [AUTH_USER_A]);
    await admin.query('insert into public.tenants (id, name) values ($1, $2), ($3, $4)', [
      TENANT_A,
      'Tenant A (teste)',
      TENANT_B,
      'Tenant B (teste)',
    ]);
    await admin.query(
      `insert into public.persons (id, tenant_id, display_name, person_type, is_minor) values
         ($1, $2, 'Guardian A', 'ADULT', false),
         ($3, $2, 'Child A', 'MINOR', true)`,
      [PERSON_A_GUARDIAN, TENANT_A, PERSON_A_CHILD],
    );
    await admin.query(
      `insert into public.persons (id, tenant_id, display_name, person_type, is_minor) values ($1, $2, 'Guardian B', 'ADULT', false)`,
      [PERSON_B_GUARDIAN, TENANT_B],
    );
    await admin.query('insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing', [
      AUTH_USER_A,
      'guardian-a@example.com',
    ]);
    await admin.query(`insert into public.accounts (id, email, status) values ($1, $2, 'ACTIVE')`, [
      AUTH_USER_A,
      'guardian-a@example.com',
    ]);
    await admin.query(
      `insert into public.account_memberships (account_id, tenant_id, person_id, status) values ($1, $2, $3, 'ACTIVE')`,
      [AUTH_USER_A, TENANT_A, PERSON_A_GUARDIAN],
    );
  });

  afterAll(async () => {
    await admin.query('delete from public.tenants where id in ($1, $2)', [TENANT_A, TENANT_B]);
    await admin.query('delete from public.accounts where id = $1', [AUTH_USER_A]);
    await admin.end();
  });

  /** Runs `fn` inside a transaction impersonating the given auth user, then rolls back. */
  async function asUser<T>(authUserId: string, fn: (client: Client) => Promise<T>): Promise<T> {
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE authenticated');
      await admin.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [authUserId]);
      const result = await fn(admin);
      return result;
    } finally {
      await admin.query('ROLLBACK');
    }
  }

  it("cannot read another tenant's person even by guessing the exact ID (IDOR)", async () => {
    const { rows } = await asUser(AUTH_USER_A, (c) =>
      c.query('select * from public.persons where id = $1', [PERSON_B_GUARDIAN]),
    );
    expect(rows).toHaveLength(0);
  });

  it('reads its own tenant persons normally', async () => {
    const { rows } = await asUser(AUTH_USER_A, (c) =>
      c.query('select * from public.persons where tenant_id = $1 order by display_name', [TENANT_A]),
    );
    expect(rows.map((r) => r.display_name)).toEqual(['Child A', 'Guardian A']);
  });

  it("cannot read another tenant's row from the tenants table itself", async () => {
    const { rows } = await asUser(AUTH_USER_A, (c) => c.query('select * from public.tenants where id = $1', [TENANT_B]));
    expect(rows).toHaveLength(0);
  });

  it('cannot INSERT a person into another tenant (WITH CHECK enforcement)', async () => {
    await expect(
      asUser(AUTH_USER_A, (c) =>
        c.query(
          `insert into public.persons (tenant_id, display_name, person_type, is_minor) values ($1, 'Intruder', 'ADULT', false)`,
          [TENANT_B],
        ),
      ),
    ).rejects.toThrow();
  });

  it('audit_events are insertable but not updatable/deletable by authenticated (immutability)', async () => {
    const inserted = await asUser(AUTH_USER_A, (c) =>
      c.query(
        `insert into public.audit_events (tenant_id, event_type, actor_person_id, subject_person_id, result)
         values ($1, 'LOGIN', $2, $2, 'SUCCESS') returning id`,
        [TENANT_A, PERSON_A_GUARDIAN],
      ),
    );
    const auditId = inserted.rows[0].id;

    await expect(
      asUser(AUTH_USER_A, (c) => c.query('update public.audit_events set result = $1 where id = $2', ['ERROR', auditId])),
    ).rejects.toThrow();

    await expect(asUser(AUTH_USER_A, (c) => c.query('delete from public.audit_events where id = $1', [auditId]))).rejects.toThrow();
  });

  it('an unauthenticated session (no JWT claim) sees no rows at all', async () => {
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE authenticated');
      await admin.query(`SELECT set_config('request.jwt.claim.sub', '', true)`);
      const { rows } = await admin.query('select * from public.persons');
      expect(rows).toHaveLength(0);
    } finally {
      await admin.query('ROLLBACK');
    }
  });
});
