'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase-client';
import { apiFetch } from '@/lib/api-client';
import { setStoredTenantId } from '@/lib/tenant-context';
import { TodayIcon, FamilyIcon, AgendaIcon, HealthIcon, AssistantIcon, SettingsIcon } from '@/components/ui/nav-icons';
import type { ComponentType, SVGProps } from 'react';

/**
 * 5 áreas (§6.4) — nenhuma rota existente foi removida, só reagrupada.
 * Cada área tem um destino principal (o primeiro item) e, quando
 * relevante, sub-itens que antes eram entradas soltas no nível raiz:
 *
 * - Hoje: a central de decisões + o que chega pra revisar (Caixa de Entrada).
 * - Família: quem cuida de quem — Família, Filhos, Rede de Cuidado.
 * - Agenda: tudo com data/prazo — Agenda, Tarefas, Solicitações.
 * - Saúde: dado sensível com proteção reforçada (§4) — Saúde, Emergência,
 *   Documentos — agrupados para deixar essa fronteira visível, não pra
 *   escondê-la.
 * - Assistente: ZELII.
 *
 * Configurações fica fora das 5 áreas de conteúdo, junto com Sair, como
 * chrome de conta — mesmo padrão que já existia antes desta reorganização.
 */
const areas: Array<{
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  items: Array<{ href: string; label: string }>;
}> = [
  {
    label: 'Hoje',
    icon: TodayIcon,
    items: [
      { href: '/app/today', label: 'Hoje' },
      { href: '/app/capture', label: 'Caixa de Entrada' },
    ],
  },
  {
    label: 'Família',
    icon: FamilyIcon,
    items: [
      { href: '/app/family', label: 'Família' },
      { href: '/app/children', label: 'Filhos' },
      { href: '/app/care-network', label: 'Rede de Cuidado' },
    ],
  },
  {
    label: 'Agenda',
    icon: AgendaIcon,
    items: [
      { href: '/app/calendar', label: 'Agenda' },
      { href: '/app/tasks', label: 'Tarefas' },
      { href: '/app/requests', label: 'Solicitações' },
    ],
  },
  {
    label: 'Saúde',
    icon: HealthIcon,
    items: [
      { href: '/app/health', label: 'Saúde' },
      { href: '/app/emergency', label: 'Emergência' },
      { href: '/app/documents', label: 'Documentos' },
    ],
  },
  {
    label: 'Assistente',
    icon: AssistantIcon,
    items: [{ href: '/app/ai', label: 'Pergunte à ZELII' }],
  },
];

interface TenantMembership {
  tenantId: string;
  personId: string;
  tenantName: string;
  personDisplayName: string;
}

/**
 * Só aparece com 2+ famílias ativas (§10/§68) — pra maioria das contas,
 * que tem exatamente uma, isto não renderiza nada. Trocar de família
 * recarrega a página de propósito (mesmo raciocínio do FamilyGate: nunca
 * misturar dados de duas famílias na mesma árvore de componentes já montada).
 */
function FamilySwitcher() {
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
    <div className="relative mb-4 px-2">
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

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await getSupabaseBrowserClient().auth.signOut();
    router.push('/entrar');
  }

  return (
    <aside className="flex w-60 flex-col border-r border-border bg-surface p-4">
      <span className="mb-6 px-2 text-lg font-semibold text-ink">ZELII</span>
      <FamilySwitcher />
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
        {areas.map((area) => {
          const Icon = area.icon;
          const areaActive = area.items.some((item) => pathname?.startsWith(item.href));
          return (
            <div key={area.label}>
              <div className="mb-1 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-inkMuted">
                <Icon className={`h-4 w-4 ${areaActive ? 'text-primary' : ''}`} />
                {area.label}
              </div>
              <div className="flex flex-col gap-0.5">
                {area.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-md px-3 py-2 text-sm ${
                      pathname?.startsWith(item.href) ? 'bg-surfaceMuted font-medium text-ink' : 'text-inkMuted hover:bg-surfaceMuted'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="mt-4 flex flex-col gap-0.5 border-t border-border pt-4">
        <Link
          href="/app/settings"
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
            pathname?.startsWith('/app/settings') ? 'bg-surfaceMuted font-medium text-ink' : 'text-inkMuted hover:bg-surfaceMuted'
          }`}
        >
          <SettingsIcon className="h-4 w-4" />
          Configurações
        </Link>
        <button onClick={handleLogout} className="rounded-md px-3 py-2 text-left text-sm text-inkMuted hover:bg-surfaceMuted">
          Sair
        </button>
      </div>
    </aside>
  );
}
