'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_AREAS } from '@/lib/nav-config';

/**
 * Barra inferior fixa pra tablet retrato/mobile (<1024px). As 5 áreas
 * (§6.4) cabem exatamente nos 5 espaços recomendados pra uma bottom
 * tab bar — cada tab leva ao primeiro/principal destino da área; os
 * sub-itens (ex.: Caixa de Entrada dentro de Hoje) ficam no `MobileMenu`.
 * `pb-[env(safe-area-inset-bottom)]` evita a barra ficar sob o home
 * indicator de iOS.
 */
export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {NAV_AREAS.map((area) => {
        const Icon = area.icon;
        const primaryHref = area.items[0].href;
        const active = area.items.some((item) => pathname?.startsWith(item.href));
        return (
          <Link
            key={area.label}
            href={primaryHref}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-touch flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium ${
              active ? 'text-primary' : 'text-inkMuted'
            }`}
          >
            <Icon className="h-5 w-5" />
            {area.label}
          </Link>
        );
      })}
    </nav>
  );
}
