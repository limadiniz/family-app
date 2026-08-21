import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

/**
 * RLS-level security isolation tests for care_schedules / care_windows /
 * handoffs (V3 §17-19, §31 — see gap-analysis-v3.md §9). These tables
 * were migrated in Fase 0 but never had a dedicated RLS test, and never
 * had an application layer until this delivery round; this closes both
 * gaps at once for the isolation half. Same pattern as
 * rls-v3.integration.test.ts.
 */

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

const TENANT_A = '50000000-0000-0000-0000-00000000000a';
const TENANT_B = '50000000-0000-0000-0000-00000000000b';
const AUTH_USER_A = '50000000-0000-0000-0000-0000000000a1';
const PERSON_A = '50000000-0000-0000-0000-0000000000a2';
const PERSON_A_CHILD = '50000000-0000-0000-0000-0000000000a3';
const PERSON_A_CAREGIVER = '50000000-0000-0000-0000-0000000000a4';
const PERSON_B = '50000000-0000-0000-0000-0000000000b2';
const PERSON_B_CHILD = '50000000-0000-0000-0000-0000000000b3';

const describeIfDb = DATABASE_URL ? describe : describe.skip;

describeIfDb('RLS — CareSchedule / CareWindow / Handoff tables (real Postgres)', () => {
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: DATABASE_URL });
    await admin.connect();

    await admin.query('delete from public.tenants where id in ($1, $2)', [TENANT_A, TENANT_B]);
    await admin.query('delete from public.accounts where id = $1', [AUTH_USER_A]);
    await admin.query('insert into public.tenants (id, name) values ($1, $2), ($3, $4)', [
      TENANT_A,
      'Tenant A (care schedule teste)',
      TENANT_B,
      'Tenant B (care schedule teste)',
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
    // A FamilyUnit + FAMILY_OWNER membership for PERSON_A (Ana): the
    // care_schedules SELECT policy only allows the schedule's own
    // caregiver_person_id (Maria here) or a family admin — plain tenant
    // co-membership is not enough, so Ana needs the admin role to read a
    // schedule she isn't the caregiver on.
    const familyUnitId = '50000000-0000-0000-0000-000000000f01';
    await admin.query(`insert into public.family_units (id, tenant_id, name, kind) values ($1, $2, 'Familia A (care schedule teste)', 'NUCLEAR')`, [
      familyUnitId,
      TENANT_A,
    ]);
    await admin.query(
      `insert into public.family_memberships (tenant_id, family_unit_id, person_id, role) values
         ($1, $2, $3, 'FAMILY_OWNER'),
         ($1, $2, $4, 'CHILD'),
         ($1, $2, $5, 'EXTENDED_FAMILY')`,
      [TENANT_A, familyUnitId, PERSON_A, PERSON_A_CHILD, PERSON_A_CAREGIVER],
    );
    await admin.query('insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing', [
      AUTH_USER_A,
      'ana-care-schedule@example.com',
    ]);
    await admin.query(`insert into public.accounts (id, email, status) values ($1, $2, 'ACTIVE')`, [
      AUTH_USER_A,
      'ana-care-schedule@example.com',
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

  it("cannot read another tenant's care_schedules", async () => {
    await admin.query(
      `insert into public.care_schedules (tenant_id, child_person_id, caregiver_person_id, rrule, start_date)
       values ($1, $2, $3, 'FREQ=WEEKLY;BYDAY=MO', '2026-08-03')`,
      [TENANT_B, PERSON_B_CHILD, PERSON_B],
    );
    const { rows } = await asUser(AUTH_USER_A, (c) => c.query('select * from public.care_schedules where tenant_id = $1', [TENANT_B]));
    expect(rows).toHaveLength(0);
  });

  it('reads its own tenant care_schedules, including the new exceptions/holiday columns', async () => {
    await admin.query(
      `insert into public.care_schedules
         (tenant_id, child_person_id, caregiver_person_id, rrule, start_date, exceptions, exclude_br_national_holidays)
       values ($1, $2, $3, 'FREQ=WEEKLY;BYDAY=MO,WE,FR', '2026-08-03', ARRAY['2026-08-10']::date[], true)`,
      [TENANT_A, PERSON_A_CHILD, PERSON_A_CAREGIVER],
    );
    const { rows } = await asUser(AUTH_USER_A, (c) =>
      c.query('select * from public.care_schedules where child_person_id = $1', [PERSON_A_CHILD]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].exclude_br_national_holidays).toBe(true);
    // node-pg parses `date[]` columns as JS Date objects, not ISO strings —
    // this is a driver-level quirk (the app layer, using
    // @supabase-js/postgrest over HTTP, gets plain "YYYY-MM-DD" strings
    // instead — see care-schedule.service.ts's occurrences()); assert on
    // the underlying date, not string equality.
    expect((rows[0].exceptions as Date[])[0].toISOString().slice(0, 10)).toBe('2026-08-10');
  });

  it('cannot INSERT a care_window into another tenant (WITH CHECK enforcement)', async () => {
    await expect(
      asUser(AUTH_USER_A, (c) =>
        c.query(
          `insert into public.care_windows (tenant_id, child_person_id, caregiver_person_id, starts_at, ends_at)
           values ($1, $2, $2, now(), now() + interval '1 hour')`,
          [TENANT_B, PERSON_B_CHILD],
        ),
      ),
    ).rejects.toThrow();
  });

  it("cannot read another tenant's care_windows (IDOR)", async () => {
    await admin.query(
      `insert into public.care_windows (tenant_id, child_person_id, caregiver_person_id, starts_at, ends_at)
       values ($1, $2, $2, now(), now() + interval '1 hour')`,
      [TENANT_B, PERSON_B_CHILD],
    );
    const { rows } = await asUser(AUTH_USER_A, (c) => c.query('select * from public.care_windows where child_person_id = $1', [PERSON_B_CHILD]));
    expect(rows).toHaveLength(0);
  });

  it("cannot read another tenant's handoffs", async () => {
    await admin.query(
      `insert into public.handoffs (tenant_id, child_person_id, from_person_id, to_person_id, scheduled_at)
       values ($1, $2, $3, $3, now())`,
      [TENANT_B, PERSON_B_CHILD, PERSON_B],
    );
    const { rows } = await asUser(AUTH_USER_A, (c) => c.query('select * from public.handoffs where child_person_id = $1', [PERSON_B_CHILD]));
    expect(rows).toHaveLength(0);
  });

  it('the handoffs status check constraint rejects a value outside the state machine', async () => {
    await expect(
      asUser(AUTH_USER_A, (c) =>
        c.query(
          `insert into public.handoffs (tenant_id, child_person_id, from_person_id, to_person_id, scheduled_at, status)
           values ($1, $2, $3, $4, now(), 'NOT_A_REAL_STATUS')`,
          [TENANT_A, PERSON_A_CHILD, PERSON_A, PERSON_A_CAREGIVER],
        ),
      ),
    ).rejects.toThrow();
  });

  it('the care_windows ends_at > starts_at constraint is enforced at the database level', async () => {
    await expect(
      asUser(AUTH_USER_A, (c) =>
        c.query(
          `insert into public.care_windows (tenant_id, child_person_id, caregiver_person_id, starts_at, ends_at)
           values ($1, $2, $3, now(), now() - interval '1 hour')`,
          [TENANT_A, PERSON_A_CHILD, PERSON_A_CAREGIVER],
        ),
      ),
    ).rejects.toThrow();
  });
});
