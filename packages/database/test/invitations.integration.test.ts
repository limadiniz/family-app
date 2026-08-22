import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

const TENANT_ID = '32000000-0000-0000-0000-000000000001';
const FAMILY_UNIT_ID = '32000000-0000-0000-0000-000000000002';
const INVITER_ACCOUNT_ID = '32000000-0000-0000-0000-000000000003';
const INVITER_PERSON_ID = '32000000-0000-0000-0000-000000000004';
const CHILD_PERSON_ID = '32000000-0000-0000-0000-000000000005';
const RECIPIENT_ACCOUNT_ID = '32000000-0000-0000-0000-000000000006';
const TOKEN = 'integration-invitation-acceptance-token';
const RECIPIENT_EMAIL = 'recipient-invitation-test@example.com';

describeIfDb('family invitation acceptance (real Postgres)', () => {
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: DATABASE_URL });
    await admin.connect();

    await admin.query('delete from public.tenants where id = $1', [TENANT_ID]);
    await admin.query('delete from public.accounts where id in ($1, $2)', [INVITER_ACCOUNT_ID, RECIPIENT_ACCOUNT_ID]);
    await admin.query('delete from auth.users where id in ($1, $2)', [INVITER_ACCOUNT_ID, RECIPIENT_ACCOUNT_ID]);

    await admin.query('insert into auth.users (id, email) values ($1, $2), ($3, $4)', [
      INVITER_ACCOUNT_ID,
      'inviter-invitation-test@example.com',
      RECIPIENT_ACCOUNT_ID,
      RECIPIENT_EMAIL,
    ]);
    await admin.query(`insert into public.tenants (id, name) values ($1, 'Família Teste Convite')`, [TENANT_ID]);
    await admin.query(
      `insert into public.persons (id, tenant_id, display_name, person_type, is_minor) values
         ($1, $2, 'Responsável que convidou', 'ADULT', false),
         ($3, $2, 'Filho do teste', 'MINOR', true)`,
      [INVITER_PERSON_ID, TENANT_ID, CHILD_PERSON_ID],
    );
    await admin.query(
      `insert into public.accounts (id, email, status) values ($1, $2, 'ACTIVE')`,
      [INVITER_ACCOUNT_ID, 'inviter-invitation-test@example.com'],
    );
    await admin.query(
      `insert into public.account_memberships (account_id, tenant_id, person_id, status)
       values ($1, $2, $3, 'ACTIVE')`,
      [INVITER_ACCOUNT_ID, TENANT_ID, INVITER_PERSON_ID],
    );
    await admin.query(
      `insert into public.family_units (id, tenant_id, name, kind)
       values ($1, $2, 'Família Teste Convite', 'NUCLEAR')`,
      [FAMILY_UNIT_ID, TENANT_ID],
    );
    await admin.query(
      `insert into public.family_memberships (tenant_id, family_unit_id, person_id, role)
       values ($1, $2, $3, 'FAMILY_OWNER'), ($1, $2, $4, 'CHILD')`,
      [TENANT_ID, FAMILY_UNIT_ID, INVITER_PERSON_ID, CHILD_PERSON_ID],
    );
    await admin.query(
      `insert into public.invitations (
         tenant_id, family_unit_id, invited_by_person_id, invitee_email,
         proposed_relationship, proposed_role, permission_preset,
         subject_person_ids, token, expires_at
       ) values ($1, $2, $3, $4, 'SPOUSE_PARTNER', 'CO_GUARDIAN',
         'RESPONSAVEL_COMPARTILHADO', $5, $6, now() + interval '1 day')`,
      [TENANT_ID, FAMILY_UNIT_ID, INVITER_PERSON_ID, RECIPIENT_EMAIL, [CHILD_PERSON_ID], TOKEN],
    );
  });

  afterAll(async () => {
    await admin.query('delete from public.tenants where id = $1', [TENANT_ID]);
    await admin.query('delete from public.accounts where id in ($1, $2)', [INVITER_ACCOUNT_ID, RECIPIENT_ACCOUNT_ID]);
    await admin.query('delete from auth.users where id in ($1, $2)', [INVITER_ACCOUNT_ID, RECIPIENT_ACCOUNT_ID]);
    await admin.end();
  });

  it('accepts the invitation and connects the second responsible to the family', async () => {
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE authenticated');
      await admin.query(`select set_config('request.jwt.claim.sub', $1, true)`, [RECIPIENT_ACCOUNT_ID]);
      await admin.query(`select set_config('request.jwt.claim.email', $1, true)`, [RECIPIENT_EMAIL]);

      const accepted = await admin.query(
        'select * from public.accept_family_invitation($1, $2)',
        [TOKEN, 'Segunda responsável'],
      );

      expect(accepted.rows).toHaveLength(1);
      expect(accepted.rows[0].tenant_id).toBe(TENANT_ID);
      expect(accepted.rows[0].family_unit_id).toBe(FAMILY_UNIT_ID);

      const membership = await admin.query(
        `select fm.role
         from public.family_memberships fm
         join public.account_memberships am on am.person_id = fm.person_id and am.tenant_id = fm.tenant_id
         where am.account_id = $1 and fm.family_unit_id = $2 and fm.is_active`,
        [RECIPIENT_ACCOUNT_ID, FAMILY_UNIT_ID],
      );
      expect(membership.rows).toEqual([{ role: 'CO_GUARDIAN' }]);

      const invitation = await admin.query('select status from public.invitations where token = $1', [TOKEN]);
      expect(invitation.rows).toEqual([{ status: 'ACCEPTED' }]);
    } finally {
      await admin.query('ROLLBACK');
    }
  });
});
