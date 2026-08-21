'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { getStoredTenantId, setStoredTenantId, clearStoredTenantId } from '@/lib/tenant-context';
import { Card, Button, LoadingState, ErrorState } from '@/components/ui';

interface TenantMembership {
  tenantId: string;
  personId: string;
  tenantName: string;
  personDisplayName: string;
}

interface MyTenantsResponse {
  currentTenantId: string | null;
  memberships: TenantMembership[];
}

/**
 * Seletor multi-família (§10/§68). Uma Account pode ter mais de uma
 * membership ACTIVE (mesma Person em mais de uma FamilyUnit — regra
 * dura do projeto). O backend (apps/api/.../auth.guard.ts) já recusa
 * adivinhar qual delas usar quando há mais de uma e nenhum
 * `x-tenant-id` foi enviado — ele deixa `tenantId`/`personId` null em
 * vez de escolher errado. Este componente é a UI que resolve essa
 * ambiguidade: bloqueia as telas internas até a pessoa escolher, sem
 * nunca decidir isso sozinho no cliente.
 */
export function FamilyGate({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<MyTenantsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    apiFetch<MyTenantsResponse>('/accounts/me/tenants')
      .then((res) => {
        // Preferência guardada localmente que não corresponde a mais
        // nenhuma membership real (revogada, por exemplo) — descarta em
        // vez de continuar mandando um x-tenant-id que o backend vai recusar.
        const stored = getStoredTenantId();
        if (stored && !res.memberships.some((m) => m.tenantId === stored)) {
          clearStoredTenantId();
        }
        setData(res);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  function choose(tenantId: string) {
    setStoredTenantId(tenantId);
    // Reload cheio: garante que toda tela/estado já montado passe a usar
    // o novo x-tenant-id, em vez de misturar dados de duas famílias na
    // mesma sessão de componentes React.
    window.location.reload();
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <ErrorState title="Não foi possível carregar suas famílias" description={error} onRetry={load} />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <LoadingState label="Carregando…" />
      </main>
    );
  }

  const needsChoice = !data.currentTenantId && data.memberships.length > 1;

  if (needsChoice) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <Card className="w-full max-w-sm">
          <h1 className="text-xl font-semibold text-ink">Qual família você quer acessar?</h1>
          <p className="mt-2 text-sm text-inkMuted">Sua conta participa de mais de uma família na ZELII.</p>
          <div className="mt-4 flex flex-col gap-2">
            {data.memberships.map((m) => (
              <Button key={m.tenantId} variant="secondary" onClick={() => choose(m.tenantId)}>
                <span className="flex w-full flex-col items-start">
                  <span>{m.tenantName}</span>
                  <span className="text-xs font-normal text-inkMuted">como {m.personDisplayName}</span>
                </span>
              </Button>
            ))}
          </div>
        </Card>
      </main>
    );
  }

  // currentTenantId já resolvido pelo backend (só 1 membership, ou o
  // x-tenant-id enviado já era válido) — mantém a preferência local em
  // sincronia pra próxima chamada de apiFetch.
  if (data.currentTenantId && getStoredTenantId() !== data.currentTenantId) {
    setStoredTenantId(data.currentTenantId);
  }

  return <>{children}</>;
}
