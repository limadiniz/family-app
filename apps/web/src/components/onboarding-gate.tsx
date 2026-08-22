'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { buildOnboardingUrl } from '@/lib/onboarding-redirect';
import { ErrorState, LoadingState, OnboardingRequiredState } from '@/components/ui';

interface OnboardingStatus {
  bootstrapped: boolean;
}

/**
 * §8 — proactive onboarding gate: checks `GET /onboarding/status` once,
 * before any page under `/app/*` renders, instead of letting each page
 * discover a 403 ONBOARDING_REQUIRED reactively on its own first fetch
 * (the old behavior — see the redesign discovery report). Mounted inside
 * `FamilyGate` in `app/app/layout.tsx`, so tenant ambiguity is already
 * resolved (or moot — a never-onboarded account never has 2+ memberships)
 * by the time this runs.
 *
 * `/app/onboarding` itself is deliberately never gated here — the wizard
 * page needs to render regardless of status, or nobody could ever finish
 * it (§8: "não permitir onboarding para onboarding").
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(() => {
    setError(null);
    apiFetch<OnboardingStatus>('/onboarding/status')
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível verificar seu cadastro.'))
      .finally(() => setRetrying(false));
  }, []);

  useEffect(load, [load]);

  if (pathname === '/app/onboarding') {
    return <>{children}</>;
  }

  if (error) {
    // A network/API failure is NOT "onboarding incomplete" — a distinct,
    // recoverable error state, never silently reinterpreted as the
    // onboarding screen (§7/§8). No <main> here — this renders inside the
    // shell's own <main> (see app/app/layout.tsx), one landmark per page.
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <ErrorState
          title="Não foi possível verificar seu cadastro"
          description={error}
          onRetry={() => {
            setRetrying(true);
            load();
          }}
        />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingState label="Preparando sua ZELII…" />
      </div>
    );
  }

  if (!status.bootstrapped) {
    return (
      <OnboardingRequiredState
        onboardingHref={buildOnboardingUrl(pathname)}
        retrying={retrying}
        onRetry={() => {
          setRetrying(true);
          load();
        }}
      />
    );
  }

  return <>{children}</>;
}
