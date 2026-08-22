import { describe, expect, it, vi } from 'vitest';
import { OnboardingService } from '../src/modules/onboarding/onboarding.service';
import type { SupabaseService } from '../src/common/supabase.service';
import type { RequestActor } from '../src/common/auth.guard';

describe('OnboardingService.bootstrap', () => {
  it('never creates another tenant when the account already has a family membership but no current tenant was selected', async () => {
    const rpc = vi.fn();
    const service = new OnboardingService({ serviceRole: () => ({ rpc }) } as unknown as SupabaseService);
    const actor: RequestActor = {
      authUserId: 'auth-wife',
      email: 'wife@example.com',
      tenantId: null,
      personId: null,
      bearerToken: 'token',
      tenantMemberships: [{ tenantId: 'shared-family', personId: 'wife-person' }],
    };

    await expect(service.bootstrap(actor, { displayName: 'Ana' })).resolves.toEqual({
      tenantId: 'shared-family',
      personId: 'wife-person',
      alreadyBootstrapped: true,
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
