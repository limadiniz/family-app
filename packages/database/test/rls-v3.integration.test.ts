import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

/**
 * RLS-level security isolation tests for the Extended Care Network
 * adendo tables (responsibility_assignments, care_network_members,
 * delegation_policies). Same pattern as rls-v2.integration.test.ts:
 * proves the database itself refuses cross-tenant access even before the
 * Policy Engine / bundle-authority checks in CareNetworkService run.
 */

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

const TENANT_A = '40000000-0000-0000-0000-00000000000a';
const TENANT_B = '40000000-0000-0000-0000-00000000000b';
const AUTH_USER_A = '40000000-0000-0000-0000-0000000000a1';
const PERSON_A = '40000000-0000-0000-0000-0000000000a2';
const PERSON_A_CHILD = '40000000-0000-0000-0000-0000000000a3';
const PERSON_A_CAREGIVER = '40000000-0000-0000-0000-0000000000a4';
const PERSON_B = '40000000-0000-0000-0000-0000000000b2';
const PERSON_B_CHILD = '40000000-0000-0000-0000-0000000000b3';

const describeIfDb = DATABASE_URL ? describe : describe.skip;

describeIfDb('RLS — Extended Care Network tables (real Postgres)', () => {
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: DATABASE_URL });
    await admin.connect();

    await admin.query('delete from public.tenants where id in ($1, $2)', [TENANT_A, TENANT_B]);
    await admin.query('delete from public.accounts where id = $1', [AUTH_USER_A]);
    await admin.query('insert into public.tenants (id, name) values ($1, $2), ($3, $4)', [
      TENANT_A,
      'Tenant A (care network teste)',
      TENANT_B,
      'Tenant B (care network teste)',
    ]);
    await admin.query(
      `insert into public.persons (id, tenant_id, display_name, person_type, is_minor) values
         ($1, $2, 'Ana (Guardian A)', 'ADULT', false),
         ($3, $2, 'Pedro (Child A)', 'MINOR', true),
         ($4, $2, 'Maria (Avó A)', 'ADULT', false)`,
      [PERSON_A, TENANT_A, PERSON_A_CHILD, PERSON_A_CAREGIVER],
    );
    await admin.query(
      `insert into public.persons (id, tenant_id, display_name, person_type, is_minor) values
         ($1, $2, 'Guardian B', 'ADULT', false),
         ($3, $2, 'Child B', 'MINOR', true)`,
      [PERSON_B, TENANT_B, PERSON_B_CHILD],
    );
    await admin.query('insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing', [
      AUTH_USER_A,
      'ana-care-network@example.com',
    ]);
    await admin.query(`insert into public.accounts (id, email, status) values ($1, $2, 'ACTIVE')`, [
      AUTH_USER_A,
      'ana-care-network@example.com',
    ]);
    await admin.query(
      `insert into public.account_memberships (account_id, tenant_id, person_id, status) values ($1, $2, $3, 'ACTIVE')`,
      [AUTH_USER_A, TENANT_A, PERSON_A],
    );
  });

  afterAll(async () => {
    await admin.query('delete from public.tenants where id in ($1, $2)', [TENANT_A, TENANT_B]);
    await admin.query('delete from public.accounts where id = $1', [AUTH_USER_A]);
    await admin.end();
  });

  async function asUser<T>(authUserId: string, fn: (client: Client) => Promise<T>): Promise<T> {
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE authenticated');
      await admin.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [authUserId]);
      return await fn(admin);
    } finally {
      await admin.query('ROLLBACK');
    }
  }

  it('cannot INSERT a responsibility_assignment into another tenant (WITH CHECK enforcement)', async () => {
    await expect(
      asUser(AUTH_USER_A, (c) =>
        c.query(
          `insert into public.responsibility_assignments
             (tenant_id, subject_person_id, responsibility_type, assigned_to_person_id, assigned_by_person_id,
              accountable_person_id, starts_at, ends_at)
           values ($1, $2, 'PICKUP', $2, $2, $2, now(), now() + interval '1 hour')`,
          [TENANT_B, PERSON_B_CHILD],
        ),
      ),
    ).rejects.toThrow();
  });

  it("cannot read another tenant's responsibility_assignments even by guessing the exact subject id (IDOR)", async () => {
    await admin.query(
      `insert into public.responsibility_assignments
         (tenant_id, subject_person_id, responsibility_type, assigned_to_person_id, assigned_by_person_id,
          accountable_person_id, starts_at, ends_at)
       values ($1, $2, 'PICKUP', $3, $3, $3, now(), now() + interval '1 hour')`,
      [TENANT_B, PERSON_B_CHILD, PERSON_B],
    );
    const { rows } = await asUser(AUTH_USER_A, (c) =>
      c.query('select * from public.responsibility_assignments where subject_person_id = $1', [PERSON_B_CHILD]),
    );
    expect(rows).toHaveLength(0);
  });

  it('reads its own tenant responsibility_assignments normally', async () => {
    await admin.query(
      `insert into public.responsibility_assignments
         (tenant_id, subject_person_id, responsibility_type, assigned_to_person_id, assigned_by_person_id,
          accountable_person_id, starts_at, ends_at)
       values ($1, $2, 'PICKUP', $3, $4, $4, now(), now() + interval '1 hour')`,
      [TENANT_A, PERSON_A_CHILD, PERSON_A_CAREGIVER, PERSON_A],
    );
    const { rows } = await asUser(AUTH_USER_A, (c) =>
      c.query('select * from public.responsibility_assignments where subject_person_id = $1', [PERSON_A_CHILD]),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].responsibility_type).toBe('PICKUP');
  });

  it("cannot read another tenant's care_network_members (Caregiver Pool cross-tenant isolation)", async () => {
    await admin.query(
      `insert into public.care_network_members (tenant_id, subject_person_id, person_id, status, added_by_person_id)
       values ($1, $2, $3, 'ACTIVE', $3)`,
      [TENANT_B, PERSON_B_CHILD, PERSON_B],
    );
    const { rows } = await asUser(AUTH_USER_A, (c) => c.query('select * from public.care_network_members where tenant_id = $1', [TENANT_B]));
    expect(rows).toHaveLength(0);
  });

  it("cannot read another tenant's delegation_policies", async () => {
    await admin.query(`insert into public.delegation_policies (tenant_id, person_id, updated_by_person_id) values ($1, $2, $2)`, [
      TENANT_B,
      PERSON_B,
    ]);
    const { rows } = await asUser(AUTH_USER_A, (c) => c.query('select * from public.delegation_policies where tenant_id = $1', [TENANT_B]));
    expect(rows).toHaveLength(0);
  });

  it('the ends_at > starts_at constraint is enforced at the database level (defense in depth alongside the zod schema)', async () => {
    await expect(
      asUser(AUTH_USER_A, (c) =>
        c.query(
          `insert into public.responsibility_assignments
             (tenant_id, subject_person_id, responsibility_type, assigned_to_person_id, assigned_by_person_id,
              accountable_person_id, starts_at, ends_at)
           values ($1, $2, 'PICKUP', $3, $4, $4, now(), now() - interval '1 hour')`,
          [TENANT_A, PERSON_A_CHILD, PERSON_A_CAREGIVER, PERSON_A],
        ),
      ),
    ).rejects.toThrow();
  });
});
