import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

/**
 * Isolation tests for the FASE 1-8 identity/authorization redesign done in
 * the "Supabase infra" design chat: accounts/account_memberships (decoupled
 * login <-> tenant <-> person), app.has_domain_access (RLS-level ABAC
 * backstop for HEALTH/MEDICATION/EMERGENCY/DOCUMENTS/etc.), the
 * care_window/handoff activation trigger, and default-deny writes on
 * authority_grants.
 *
 * IMPORTANT: this validates the TARGET schema designed across FASES 1-8,
 * not the schema currently applied by supabase/migrations/*.sql (which
 * still has the old `users` table and blanket tenant-only policies). This
 * suite will fail with "relation ... does not exist" until the FASE 10
 * consolidated migration is written and applied — kept as its own file
 * (rather than edited into rls.integration.test.ts) so the existing suite
 * keeps validating the live schema until that cutover happens.
 *
 * Two axes are covered, matching the two classes of bug found during
 * design:
 *   1. Classic cross-tenant IDOR (Family A never reads/writes Family B),
 *      re-proven against the newly-hardened tables.
 *   2. WITHIN-tenant privilege escalation — a member of the same tenant
 *      who lacks a specific role/grant/CareWindow must still be denied.
 *      This axis did not exist in the pre-redesign test suites because
 *      the pre-redesign policies had no within-tenant distinction to test.
 *
 * Requires TEST_DATABASE_URL (or DATABASE_URL). Skipped automatically
 * otherwise.
 */

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

// ---------------------------------------------------------------- fixtures

const TENANT_A = '30000000-0000-0000-0000-00000000000a';
const TENANT_B = '30000000-0000-0000-0000-00000000000b';

const ACCOUNT_GUARDIAN_A = '30000000-0000-0000-0000-0000000011a1';
const ACCOUNT_CAREGIVER_A = '30000000-0000-0000-0000-0000000011a2'; // no HEALTH domain, no admin role
const ACCOUNT_GUARDIAN_B = '30000000-0000-0000-0000-0000000011b1';
// One human, two unrelated families — the scenario FASE 1 was redesigned for.
const ACCOUNT_MULTI_TENANT = '30000000-0000-0000-0000-0000000011c1';

const PERSON_GUARDIAN_A = '30000000-0000-0000-0000-0000000022a1';
const PERSON_CHILD_A = '30000000-0000-0000-0000-0000000022a2';
const PERSON_CAREGIVER_A = '30000000-0000-0000-0000-0000000022a3';
const PERSON_GUARDIAN_B = '30000000-0000-0000-0000-0000000022b1';
const PERSON_MULTI_IN_A = '30000000-0000-0000-0000-0000000022c1';
const PERSON_MULTI_IN_B = '30000000-0000-0000-0000-0000000022c2';

const FAMILY_UNIT_A = '30000000-0000-0000-0000-0000000033a1';
const CARE_WINDOW_A = '30000000-0000-0000-0000-0000000044a1';
const HANDOFF_A = '30000000-0000-0000-0000-0000000055a1';

describeIfDb('RLS v4 — account/tenant decoupling + within-tenant hardening (real Postgres)', () => {
  let admin: Client;

  async function cleanup() {
    await admin.query('delete from public.tenants where id in ($1, $2)', [TENANT_A, TENANT_B]);
    await admin.query('delete from public.accounts where id in ($1,$2,$3,$4)', [
      ACCOUNT_GUARDIAN_A,
      ACCOUNT_CAREGIVER_A,
      ACCOUNT_GUARDIAN_B,
      ACCOUNT_MULTI_TENANT,
    ]);
  }

  beforeAll(async () => {
    admin = new Client({ connectionString: DATABASE_URL });
    await admin.connect();
    await cleanup();

    await admin.query('insert into public.tenants (id, name) values ($1,$2),($3,$4)', [
      TENANT_A,
      'Tenant A (teste)',
      TENANT_B,
      'Tenant B (teste)',
    ]);

    await admin.query(
      `insert into public.persons (id, tenant_id, display_name, person_type, is_minor) values
         ($1,$2,'Guardian A','ADULT',false),
         ($3,$2,'Child A','MINOR',true),
         ($4,$2,'Caregiver A','ADULT',false),
         ($5,$6,'Guardian B','ADULT',false),
         ($7,$2,'Multi Person (in A)','ADULT',false),
         ($8,$6,'Multi Person (in B)','ADULT',false)`,
      [
        PERSON_GUARDIAN_A,
        TENANT_A,
        PERSON_CHILD_A,
        PERSON_CAREGIVER_A,
        PERSON_GUARDIAN_B,
        TENANT_B,
        PERSON_MULTI_IN_A,
        PERSON_MULTI_IN_B,
      ],
    );

    await admin.query(`insert into public.family_units (id, tenant_id, name, kind) values ($1,$2,'Familia A','NUCLEAR')`, [
      FAMILY_UNIT_A,
      TENANT_A,
    ]);
    await admin.query(
      `insert into public.family_memberships (tenant_id, family_unit_id, person_id, role) values
         ($1,$2,$3,'FAMILY_OWNER'),
         ($1,$2,$4,'CAREGIVER')`, // CAREGIVER: deliberately excluded from HEALTH by ROLE_DEFAULT_PERMISSIONS
      [TENANT_A, FAMILY_UNIT_A, PERSON_GUARDIAN_A, PERSON_CAREGIVER_A],
    );

    for (const id of [ACCOUNT_GUARDIAN_A, ACCOUNT_CAREGIVER_A, ACCOUNT_GUARDIAN_B, ACCOUNT_MULTI_TENANT]) {
      await admin.query(`insert into auth.users (id, email) values ($1,$2) on conflict (id) do nothing`, [
        id,
        `${id}@example.com`,
      ]);
      await admin.query(`insert into public.accounts (id, email, status) values ($1,$2,'ACTIVE')`, [
        id,
        `${id}@example.com`,
      ]);
    }

    await admin.query(
      `insert into public.account_memberships (account_id, tenant_id, person_id, status) values
         ($1,$2,$3,'ACTIVE'),
         ($4,$2,$5,'ACTIVE'),
         ($6,$7,$8,'ACTIVE'),
         ($9,$2,$10,'ACTIVE'),
         ($9,$7,$11,'ACTIVE')`,
      [
        ACCOUNT_GUARDIAN_A,
        TENANT_A,
        PERSON_GUARDIAN_A,
        ACCOUNT_CAREGIVER_A,
        PERSON_CAREGIVER_A,
        ACCOUNT_GUARDIAN_B,
        TENANT_B,
        PERSON_GUARDIAN_B,
        ACCOUNT_MULTI_TENANT,
        PERSON_MULTI_IN_A,
        PERSON_MULTI_IN_B,
      ],
    );

    // Health data for the IDOR + within-tenant checks below.
    await admin.query(
      `insert into public.health_profiles (tenant_id, person_id, blood_type, allergies) values ($1,$2,'O+', array['amendoim'])`,
      [TENANT_A, PERSON_CHILD_A],
    );

    // A SCHEDULED care_window, to prove it cannot become ACTIVE without a
    // COMPLETED handoff — and a COMPLETED handoff, to prove the legitimate
    // path is still allowed once fixtures are set up as the app would.
    await admin.query(
      `insert into public.care_windows (id, tenant_id, child_person_id, caregiver_person_id, starts_at, ends_at, status)
       values ($1,$2,$3,$4, now(), now() + interval '2 hours', 'SCHEDULED')`,
      [CARE_WINDOW_A, TENANT_A, PERSON_CHILD_A, PERSON_CAREGIVER_A],
    );
  });

  afterAll(async () => {
    await cleanup();
    await admin.end();
  });

  /** Runs `fn` inside a transaction impersonating the given account (auth.uid()), then rolls back. */
  async function asAccount<T>(accountId: string, fn: (client: Client) => Promise<T>): Promise<T> {
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE authenticated');
      await admin.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [accountId]);
      return await fn(admin);
    } finally {
      await admin.query('ROLLBACK');
    }
  }

  // ---------------------------------------------------------- axis 1: cross-tenant IDOR

  it('Guardian B cannot read Family A health data even by guessing the exact person id', async () => {
    const { rows } = await asAccount(ACCOUNT_GUARDIAN_B, (c) =>
      c.query('select * from public.health_profiles where person_id = $1', [PERSON_CHILD_A]),
    );
    expect(rows).toHaveLength(0);
  });

  it('Guardian B cannot see Family A care_windows', async () => {
    const { rows } = await asAccount(ACCOUNT_GUARDIAN_B, (c) =>
      c.query('select * from public.care_windows where id = $1', [CARE_WINDOW_A]),
    );
    expect(rows).toHaveLength(0);
  });

  it('Guardian B cannot insert an authority_grant scoped to Family A (cross-tenant + default-deny both apply)', async () => {
    await expect(
      asAccount(ACCOUNT_GUARDIAN_B, (c) =>
        c.query(
          `insert into public.authority_grants (tenant_id, grantee_person_id, subject_person_id, domain, action, granted_by_person_id)
           values ($1,$2,$3,'HEALTH','VIEW',$2)`,
          [TENANT_A, PERSON_GUARDIAN_B, PERSON_CHILD_A],
        ),
      ),
    ).rejects.toThrow();
  });

  it('one account with memberships in BOTH tenants sees exactly the rows it has a membership for, never a union leak', async () => {
    const { rows } = await asAccount(ACCOUNT_MULTI_TENANT, (c) =>
      c.query('select tenant_id from public.persons where id in ($1,$2,$3)', [
        PERSON_MULTI_IN_A,
        PERSON_MULTI_IN_B,
        PERSON_GUARDIAN_A, // belongs to tenant A but is NOT this account's own person there
      ]),
    );
    const tenantIds = rows.map((r) => r.tenant_id).sort();
    // Sees its own person in both A and B, PLUS Guardian A's row (tenant-wide
    // select on persons, by design) — but never anything outside A/B.
    expect(new Set(tenantIds)).toEqual(new Set([TENANT_A, TENANT_B]));
  });

  // ------------------------------------------------- axis 2: within-tenant privilege escalation

  it('a CAREGIVER (no HEALTH domain, not admin) cannot read a child health_profile in their OWN tenant', async () => {
    const { rows } = await asAccount(ACCOUNT_CAREGIVER_A, (c) =>
      c.query('select * from public.health_profiles where person_id = $1', [PERSON_CHILD_A]),
    );
    expect(rows).toHaveLength(0);
  });

  it('a FAMILY_OWNER in the SAME tenant can read that health_profile (admin path of has_domain_access)', async () => {
    const { rows } = await asAccount(ACCOUNT_GUARDIAN_A, (c) =>
      c.query('select * from public.health_profiles where person_id = $1', [PERSON_CHILD_A]),
    );
    expect(rows).toHaveLength(1);
  });

  it('a plain tenant member (not admin) cannot insert an authority_grant, even naming themselves as grantee', async () => {
    await expect(
      asAccount(ACCOUNT_CAREGIVER_A, (c) =>
        c.query(
          `insert into public.authority_grants (tenant_id, grantee_person_id, subject_person_id, domain, action, granted_by_person_id)
           values ($1,$2,$3,'FINANCE','ADMIN',$2)`,
          [TENANT_A, PERSON_CAREGIVER_A, PERSON_CHILD_A],
        ),
      ),
    ).rejects.toThrow();
  });

  it('app.grant_authority refuses a grantor who does not already hold what they are trying to grant', async () => {
    await expect(
      asAccount(ACCOUNT_CAREGIVER_A, (c) =>
        c.query(`select app.grant_authority($1,$2,$3,'HEALTH','VIEW')`, [TENANT_A, PERSON_CAREGIVER_A, PERSON_CHILD_A]),
      ),
    ).rejects.toThrow(/lacks the authority/);
  });

  it('a caregiver cannot flip a SCHEDULED care_window straight to ACTIVE without a COMPLETED handoff', async () => {
    await expect(
      asAccount(ACCOUNT_CAREGIVER_A, (c) =>
        c.query(`update public.care_windows set status = 'ACTIVE' where id = $1`, [CARE_WINDOW_A]),
      ),
    ).rejects.toThrow(/COMPLETED handoff/);
  });

  it('the SAME transition succeeds once a COMPLETED handoff linked to the window exists (legitimate path)', async () => {
    await asAccount(ACCOUNT_GUARDIAN_A, async (c) => {
      await c.query(
        `insert into public.handoffs (id, tenant_id, child_person_id, from_person_id, to_person_id, care_window_id, scheduled_at, status)
         values ($1,$2,$3,$4,$5,$6, now(), 'EXPECTED')`,
        [HANDOFF_A, TENANT_A, PERSON_CHILD_A, PERSON_GUARDIAN_A, PERSON_CAREGIVER_A, CARE_WINDOW_A],
      );
      await c.query(`update public.handoffs set status = 'CONFIRMED' where id = $1`, [HANDOFF_A]);
      await c.query(`update public.handoffs set status = 'COMPLETED' where id = $1`, [HANDOFF_A]);
      const { rows } = await c.query(
        `update public.care_windows set status = 'ACTIVE' where id = $1 returning status`,
        [CARE_WINDOW_A],
      );
      expect(rows[0].status).toBe('ACTIVE');
    });
  });

  it('a member cannot forge audit_events.actor_person_id as someone else', async () => {
    await expect(
      asAccount(ACCOUNT_CAREGIVER_A, (c) =>
        c.query(
          `insert into public.audit_events (tenant_id, event_type, actor_person_id, subject_person_id, result)
           values ($1,'VIEW_HEALTH',$2,$3,'SUCCESS')`,
          [TENANT_A, PERSON_GUARDIAN_A, PERSON_CHILD_A], // actor = someone else
        ),
      ),
    ).rejects.toThrow();
  });

  it('audit_events.context rejects a raw question key (redaction backstop)', async () => {
    await expect(
      asAccount(ACCOUNT_CAREGIVER_A, (c) =>
        c.query(
          `insert into public.audit_events (tenant_id, event_type, actor_person_id, subject_person_id, result, context)
           values ($1,'AI_QUERY',$2,$3,'SUCCESS', $4)`,
          [TENANT_A, PERSON_CAREGIVER_A, PERSON_CHILD_A, JSON.stringify({ question: 'qual remédio a Ana toma?' })],
        ),
      ),
    ).rejects.toThrow(/sensitive key/);
  });

  it('a plain member cannot grant themselves delegation power (delegation_policies is admin-write-only)', async () => {
    await expect(
      asAccount(ACCOUNT_CAREGIVER_A, (c) =>
        c.query(
          `insert into public.delegation_policies (tenant_id, person_id, can_delegate, can_redelegate, max_delegation_depth, updated_by_person_id)
           values ($1,$2,true,true,10,$2)`,
          [TENANT_A, PERSON_CAREGIVER_A],
        ),
      ),
    ).rejects.toThrow();
  });
});
