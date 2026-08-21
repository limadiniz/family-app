import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

/**
 * RLS-level security isolation tests for the V2 (Prompt Mestre V2) tables
 * — Universal Family Inbox, Family Request Engine, Health Core/Emergency
 * Profile. Same pattern as rls.integration.test.ts: proves the database
 * itself refuses cross-tenant access even before the Policy Engine gets
 * a chance to run, and that request_actions is genuinely append-only.
 */

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

const TENANT_A = '30000000-0000-0000-0000-00000000000a';
const TENANT_B = '30000000-0000-0000-0000-00000000000b';
const AUTH_USER_A = '30000000-0000-0000-0000-0000000000a1';
const PERSON_A = '30000000-0000-0000-0000-0000000000a2';
const PERSON_A_CHILD = '30000000-0000-0000-0000-0000000000a3';
const PERSON_B = '30000000-0000-0000-0000-0000000000b2';

const describeIfDb = DATABASE_URL ? describe : describe.skip;

describeIfDb('RLS — V2 tables (capture, requests, health core, real Postgres)', () => {
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: DATABASE_URL });
    await admin.connect();

    await admin.query('delete from public.tenants where id in ($1, $2)', [TENANT_A, TENANT_B]);
    await admin.query('delete from public.accounts where id = $1', [AUTH_USER_A]);
    await admin.query('insert into public.tenants (id, name) values ($1, $2), ($3, $4)', [
      TENANT_A,
      'Tenant A (v2 teste)',
      TENANT_B,
      'Tenant B (v2 teste)',
    ]);
    await admin.query(
      `insert into public.persons (id, tenant_id, display_name, person_type, is_minor) values
         ($1, $2, 'Guardian A', 'ADULT', false),
         ($3, $2, 'Child A', 'MINOR', true)`,
      [PERSON_A, TENANT_A, PERSON_A_CHILD],
    );
    await admin.query(
      `insert into public.persons (id, tenant_id, display_name, person_type, is_minor) values ($1, $2, 'Guardian B', 'ADULT', false)`,
      [PERSON_B, TENANT_B],
    );
    // A FamilyUnit + FAMILY_OWNER membership for PERSON_A: the FASE 6
    // has_domain_access() gate now requires an explicit family-admin role
    // (or an authority grant, or self, or an active CareWindow) before a
    // guardian can read a child's HEALTH/EMERGENCY data — plain tenant
    // co-membership is no longer sufficient by itself.
    const familyUnitId = '30000000-0000-0000-0000-000000000f01';
    await admin.query(`insert into public.family_units (id, tenant_id, name, kind) values ($1, $2, 'Familia A (v2 teste)', 'NUCLEAR')`, [
      familyUnitId,
      TENANT_A,
    ]);
    await admin.query(
      `insert into public.family_memberships (tenant_id, family_unit_id, person_id, role) values
         ($1, $2, $3, 'FAMILY_OWNER'),
         ($1, $2, $4, 'CHILD')`,
      [TENANT_A, familyUnitId, PERSON_A, PERSON_A_CHILD],
    );
    await admin.query('insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing', [
      AUTH_USER_A,
      'guardian-a-v2@example.com',
    ]);
    await admin.query(`insert into public.accounts (id, email, status) values ($1, $2, 'ACTIVE')`, [
      AUTH_USER_A,
      'guardian-a-v2@example.com',
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

  it('cannot INSERT an emergency_profile into another tenant (WITH CHECK enforcement)', async () => {
    await expect(
      asUser(AUTH_USER_A, (c) =>
        c.query(`insert into public.emergency_profiles (tenant_id, subject_person_id) values ($1, $2)`, [TENANT_B, PERSON_B]),
      ),
    ).rejects.toThrow();
  });

  it("cannot read another tenant's emergency_profile even by guessing the exact person id (IDOR)", async () => {
    await admin.query(
      `insert into public.emergency_profiles (tenant_id, subject_person_id, blood_type) values ($1, $2, 'O+')
       on conflict (tenant_id, subject_person_id) do nothing`,
      [TENANT_B, PERSON_B],
    );
    const { rows } = await asUser(AUTH_USER_A, (c) =>
      c.query('select * from public.emergency_profiles where subject_person_id = $1', [PERSON_B]),
    );
    expect(rows).toHaveLength(0);
  });

  it('reads its own tenant emergency_profile normally', async () => {
    await admin.query(
      `insert into public.emergency_profiles (tenant_id, subject_person_id, blood_type) values ($1, $2, 'A+')
       on conflict (tenant_id, subject_person_id) do nothing`,
      [TENANT_A, PERSON_A_CHILD],
    );
    const { rows } = await asUser(AUTH_USER_A, (c) =>
      c.query('select * from public.emergency_profiles where subject_person_id = $1', [PERSON_A_CHILD]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].blood_type).toBe('A+');
  });

  it("cannot read another tenant's requests (Family Request Engine cross-tenant isolation)", async () => {
    await admin.query(
      `insert into public.requests (tenant_id, type, status, requested_by_person_id, requested_to_person_id)
       values ($1, 'PICKUP_REQUEST', 'SENT', $2, $2)`,
      [TENANT_B, PERSON_B],
    );
    const { rows } = await asUser(AUTH_USER_A, (c) => c.query('select * from public.requests where tenant_id = $1', [TENANT_B]));
    expect(rows).toHaveLength(0);
  });

  it('request_actions is insertable but not updatable/deletable (immutable trail, §35-36)', async () => {
    // Everything in one asUser() call: each call is its own
    // BEGIN...ROLLBACK transaction, so a row inserted in one call is
    // gone before the next call starts — the request + its action (and
    // the attempted update/delete) must share a transaction to test
    // against a row that still exists.
    await asUser(AUTH_USER_A, async (c) => {
      // Inserted as DRAFT: the requests_insert_as_requester RLS policy
      // (added by this design chat's FASE 5 hardening) only allows
      // self-inserting a request in DRAFT status — any other initial
      // status must go through the DRAFT->... transition trigger via an
      // UPDATE, which isn't what this test is exercising.
      const requestRow = await c.query(
        `insert into public.requests (tenant_id, type, status, requested_by_person_id, requested_to_person_id, subject_person_id)
         values ($1, 'PICKUP_REQUEST', 'DRAFT', $2, $2, $3) returning id`,
        [TENANT_A, PERSON_A, PERSON_A_CHILD],
      );
      const requestId = requestRow.rows[0].id;

      const actionRow = await c.query(
        `insert into public.request_actions (tenant_id, request_id, action_type, actor_person_id)
         values ($1, $2, 'CREATED', $3) returning id`,
        [TENANT_A, requestId, PERSON_A],
      );
      const actionId = actionRow.rows[0].id;

      // Each assertion gets its own SAVEPOINT so the first rejection
      // (which aborts the surrounding subtransaction in Postgres) doesn't
      // mask what the second statement actually fails on.
      await c.query('SAVEPOINT before_update');
      await expect(c.query('update public.request_actions set note = $1 where id = $2', ['edited', actionId])).rejects.toThrow();
      await c.query('ROLLBACK TO SAVEPOINT before_update');

      await c.query('SAVEPOINT before_delete');
      await expect(c.query('delete from public.request_actions where id = $1', [actionId])).rejects.toThrow();
      await c.query('ROLLBACK TO SAVEPOINT before_delete');
    });
  });

  it("cannot read another tenant's capture_items", async () => {
    await admin.query(
      `insert into public.capture_items (tenant_id, created_by_person_id, source, status)
       values ($1, $2, 'TEXT', 'RECEIVED')`,
      [TENANT_B, PERSON_B],
    );
    const { rows } = await asUser(AUTH_USER_A, (c) => c.query('select * from public.capture_items where tenant_id = $1', [TENANT_B]));
    expect(rows).toHaveLength(0);
  });
});
