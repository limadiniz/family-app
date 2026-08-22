'use client';

import Link from 'next/link';
import { IconButton } from '@/components/ui';
import { MenuIcon, PlusIcon } from '@/components/ui/nav-icons';

/**
 * Barra superior fixa pra tablet retrato/mobile (<1024px — abaixo de
 * `lg`), onde o `Sidebar` fica escondido. Marca + atalho "Cadastrar"
 * (mesmo destino do botão do Sidebar, `/app/cadastros`) + botão que abre
 * o `MobileMenu` (navegação completa, com sub-itens, Configurações e
 * Sair — o que o `MobileBottomNav` sozinho não cobre).
 */
export function MobileTopBar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-3 lg:hidden">
      <span className="px-1 text-lg font-semibold text-ink">ZELII</span>
      <div className="flex items-center gap-1">
        {/* Link real (não IconButton dentro de Link — dois elementos interativos aninhados quebrariam acessibilidade), mesma classe visual do IconButton. */}
        <Link
          href="/app/cadastros"
          aria-label="Cadastrar"
          className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-full bg-surfaceMuted text-ink transition-colors hover:opacity-80"
        >
          <PlusIcon className="h-5 w-5" />
        </Link>
        <IconButton aria-label="Abrir menu" onClick={onMenuClick}>
          <MenuIcon className="h-5 w-5" />
        </IconButton>
      </div>
    </header>
  );
}
