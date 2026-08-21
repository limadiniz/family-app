import { describe, expect, it, vi } from 'vitest';
import { WellbeingService } from '../src/modules/wellbeing/wellbeing.service';
import { PolicyDeniedError, type PolicyService } from '../src/common/policy.service';
import type { AuditService } from '../src/common/audit.service';
import type { SupabaseService } from '../src/common/supabase.service';
import type { RequestActor } from '../src/common/auth.guard';

/**
 * §43-44: EmergencyProfile access must ALWAYS produce an AuditEvent,
 * whether it is allowed or denied — this is the one place in the
 * codebase where a DENY still gets its own explicit audit record rather
 * than relying on the Policy Engine's decision-time visibility alone.
 * Exercised here at the service layer with fake dependencies (no live
 * Supabase/PostgREST available in this environment — see
 * docs/delivery/gap-analysis-v2.md for why authenticated HTTP-level
 * integration tests aren't achievable without a real Supabase project).
 */
function makeFakeSupabaseClient(row: Record<string, unknown> | null) {
  const builder: Record<string, unknown> = {};
  builder['select'] = () => builder;
  builder['eq'] = () => builder;
  builder['maybeSingle'] = async () => ({ data: row, error: null });
  const client = { from: () => builder };
  return client;
}

const ACTOR: RequestActor = {
  authUserId: 'auth-1',
  tenantId: 'tenant-1',
  personId: 'joana-baba',
  bearerToken: 'fake-token',
};

describe('WellbeingService.getEmergencyProfile — always audited (§43-44)', () => {
  it('records a DENIED AuditEvent and rethrows when the Policy Engine denies access', async () => {
    const auditRecord = vi.fn().mockResolvedValue(undefined);
    const authorizeOrThrow = vi.fn().mockRejectedValue(new PolicyDeniedError('NO_MATCHING_GRANT_DENY'));

    const service = new WellbeingService(
      { forUser: () => makeFakeSupabaseClient(null) } as unknown as SupabaseService,
      { authorizeOrThrow } as unknown as PolicyService,
      { record: auditRecord } as unknown as AuditService,
    );

    await expect(service.getEmergencyProfile(ACTOR, 'pedro-child')).rejects.toThrow(PolicyDeniedError);

    expect(auditRecord).toHaveBeenCalledTimes(1);
    expect(auditRecord).toHaveBeenCalledWith(
      ACTOR,
      expect.objectContaining({ eventType: 'EMERGENCY_ACCESS', result: 'DENIED', subjectPersonId: 'pedro-child' }),
    );
  });

  it('records a SUCCESS AuditEvent and returns the profile when access is allowed', async () => {
    const auditRecord = vi.fn().mockResolvedValue(undefined);
    const authorizeOrThrow = vi.fn().mockResolvedValue(undefined);
    const profileRow = { subject_person_id: 'pedro-child', blood_type: 'A+', allergies: ['amendoim'] };

    const service = new WellbeingService(
      { forUser: () => makeFakeSupabaseClient(profileRow) } as unknown as SupabaseService,
      { authorizeOrThrow } as unknown as PolicyService,
      { record: auditRecord } as unknown as AuditService,
    );

    const result = await service.getEmergencyProfile(ACTOR, 'pedro-child');

    expect(result).toEqual(profileRow);
    expect(auditRecord).toHaveBeenCalledTimes(1);
    expect(auditRecord).toHaveBeenCalledWith(
      ACTOR,
      expect.objectContaining({ eventType: 'EMERGENCY_ACCESS', result: 'SUCCESS', subjectPersonId: 'pedro-child' }),
    );
  });
});
