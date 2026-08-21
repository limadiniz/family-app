import { describe, expect, it, vi } from 'vitest';
import type { PolicyEngineInput } from '@family-app/policy-engine';
import { AiGateway } from '../src/ai-gateway';

const TENANT = 't-silva';
const PEDRO = 'pedro';

function makeGateway(policyInput: PolicyEngineInput) {
  const retrieve = vi.fn().mockResolvedValue([
    { domain: 'HEALTH', subjectPersonId: PEDRO, summary: 'Consulta com Dra. Ana em 20/08', source: { type: 'appointment', id: 'appt-1' } },
  ]);
  const complete = vi.fn().mockResolvedValue('Pedro tem consulta marcada para 20/08.');
  const recordAudit = vi.fn().mockResolvedValue(undefined);

  const gateway = new AiGateway({
    retrieve,
    complete,
    recordAudit,
    aiEnabled: true,
    loadPolicyInput: async () => policyInput,
  });

  return { gateway, retrieve, complete, recordAudit };
}

describe('AiGateway — never bypasses the Policy Engine (§135)', () => {
  it('answers a GUARDIAN asking about a medical appointment, with a source', async () => {
    const { gateway, retrieve } = makeGateway({
      sharedFamilyRoles: ['GUARDIAN'],
      activeAuthorityGrants: [],
      hasActiveCareWindow: false,
      subjectIsMinor: true,
    });

    const answer = await gateway.ask({ personId: 'ana', tenantId: TENANT }, 'Quando Pedro tem consulta?', [PEDRO]);

    expect(retrieve).toHaveBeenCalled();
    expect(answer.facts).toHaveLength(1);
    expect(answer.facts[0]?.source.id).toBe('appt-1');
    expect(answer.deniedDomains).toHaveLength(0);
  });

  it('denies a babá asking for the full medical history and never calls retrieve()', async () => {
    const { gateway, retrieve, complete } = makeGateway({
      sharedFamilyRoles: ['CAREGIVER'],
      activeAuthorityGrants: [],
      hasActiveCareWindow: false,
      subjectIsMinor: true,
    });

    const answer = await gateway.ask(
      { personId: 'joana', tenantId: TENANT },
      'Qual é todo o histórico médico de Pedro?',
      [PEDRO],
    );

    expect(retrieve).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(answer.facts).toHaveLength(0);
    expect(answer.deniedDomains).toContain('HEALTH');
    expect(answer.text).toMatch(/não tem permissão/i);
  });

  it('is a no-op when AI_ENABLED is false, regardless of permissions', async () => {
    const retrieve = vi.fn();
    const gateway = new AiGateway({
      retrieve,
      complete: vi.fn(),
      recordAudit: vi.fn(),
      aiEnabled: false,
      loadPolicyInput: async () => ({
        sharedFamilyRoles: ['FAMILY_OWNER'],
        activeAuthorityGrants: [],
        hasActiveCareWindow: false,
        subjectIsMinor: true,
      }),
    });

    const answer = await gateway.ask({ personId: 'ana', tenantId: TENANT }, 'Quando Pedro tem consulta?', [PEDRO]);
    expect(retrieve).not.toHaveBeenCalled();
    expect(answer.facts).toHaveLength(0);
  });
});
