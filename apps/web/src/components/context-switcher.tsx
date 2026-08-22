'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { setStoredTenantId } from '@/lib/tenant-context';

interface TenantMembership {
  tenantId: string;
  personId: string;
  tenantName: string;
  personDisplayName: string;
}

/**
 * Extraído do antigo `FamilySwitcher` (dentro de app-nav.tsx) pra ser
 * reaproveitado tanto pelo `Sidebar` (desktop/tablet landscape) quanto
 * pelo `MobileMenu` (tablet portrait/mobile) — mesma lógica, sem duplicar.
 *
 * Só aparece com 2+ famílias ativas (§10/§68) — pra maioria das contas,
 * que tem exatamente uma, isto não renderiza nada. Trocar de família
 * recarrega a página de propósito (mesmo raciocínio do FamilyGate: nunca
 * misturar dados de duas famílias na mesma árvore de componentes já montada).
 */
export function ContextSwitcher({ className = '' }: { className?: string }) {
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    apiFetch<{ currentTenantId: string | null; memberships: TenantMembership[] }>('/accounts/me/tenants')
      .then((res) => {
        setMemberships(res.memberships);
        setCurrentTenantId(res.currentTenantId);
      })
      .catch(() => undefined); // widget não crítico
  }, []);

  if (memberships.length <= 1) return null;
  const current = memberships.find((m) => m.tenantId === currentTenantId);

  return (
    <div className={`relative px-2 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-touch w-full items-center justify-between rounded-md border border-border bg-surface px-2 text-left text-xs"
      >
        <span className="truncate text-ink">{current?.tenantName ?? 'Escolher família'}</span>
        <span className="ml-2 shrink-0 text-primary">Trocar</span>
      </button>
      {open && (
        <div className="absolute left-2 right-2 z-10 mt-1 rounded-md border border-border bg-surface p-1 shadow-lg">
          {memberships.map((m) => (
            <button
              key={m.tenantId}
              type="button"
              onClick={() => {
                setStoredTenantId(m.tenantId);
                window.location.reload();
              }}
              className={`w-full rounded px-2 py-1.5 text-left text-xs hover:bg-surfaceMuted ${
                m.tenantId === currentTenantId ? 'font-medium text-ink' : 'text-inkMuted'
              }`}
            >
              {m.tenantName} <span className="text-inkMuted">— como {m.personDisplayName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
