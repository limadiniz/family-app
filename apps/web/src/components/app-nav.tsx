'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase-client';
import { NAV_AREAS, SETTINGS_ITEM } from '@/lib/nav-config';
import { ContextSwitcher } from '@/components/context-switcher';
import { PlusIcon } from '@/components/ui/nav-icons';

/**
 * Navegação de desktop e tablet paisagem (≥1024px — `lg` do Tailwind).
 * Abaixo disso o `AppLayout` (§P0.3) mostra `MobileTopBar` +
 * `MobileBottomNav` + `MobileMenu` em vez desta coluna fixa — mesmos
 * dados de `lib/nav-config.ts`, layout diferente.
 */
export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await getSupabaseBrowserClient().auth.signOut();
    router.push('/entrar');
  }

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface p-4 lg:flex">
      <span className="mb-6 px-2 text-lg font-semibold text-ink">ZELII</span>
      <Link
        href="/app/cadastros"
        className="mb-4 inline-flex min-h-touch items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-white transition-colors hover:opacity-90"
      >
        <PlusIcon className="h-4 w-4" />
        Cadastrar
      </Link>
      <ContextSwitcher className="mb-4" />
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
        {NAV_AREAS.map((area) => {
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
          href={SETTINGS_ITEM.href}
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
            pathname?.startsWith(SETTINGS_ITEM.href) ? 'bg-surfaceMuted font-medium text-ink' : 'text-inkMuted hover:bg-surfaceMuted'
          }`}
        >
          <SETTINGS_ITEM.icon className="h-4 w-4" />
          {SETTINGS_ITEM.label}
        </Link>
        <button onClick={handleLogout} className="rounded-md px-3 py-2 text-left text-sm text-inkMuted hover:bg-surfaceMuted">
          Sair
        </button>
      </div>
    </aside>
  );
}
