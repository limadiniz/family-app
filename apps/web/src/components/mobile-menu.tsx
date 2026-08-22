'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase-client';
import { NAV_AREAS, SETTINGS_ITEM } from '@/lib/nav-config';
import { ContextSwitcher } from '@/components/context-switcher';
import { IconButton } from '@/components/ui';
import { CloseIcon, PlusIcon } from '@/components/ui/nav-icons';

/**
 * Drawer de navegação completa pra tablet retrato/mobile (<1024px) —
 * o equivalente ao `Sidebar` de desktop, incluindo sub-itens,
 * `ContextSwitcher`, Configurações e Sair, que o `MobileBottomNav`
 * (só 5 ícones de área) não tem espaço pra mostrar.
 *
 * Diálogo modal simples: fecha com Escape, clique no backdrop, ou ao
 * navegar para qualquer item; trava o scroll do body enquanto aberto;
 * foca o botão de fechar ao abrir (primeiro elemento focável do painel).
 */
export function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    document.body.style.overflow = 'hidden';
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  async function handleLogout() {
    await getSupabaseBrowserClient().auth.signOut();
    onClose();
    router.push('/entrar');
  }

  return (
    <div className="fixed inset-0 z-30 lg:hidden">
      {/* <button>, não <div onClick>: fecha o menu com clique OU teclado sem precisar de nenhuma regra de a11y desabilitada. */}
      <button type="button" aria-label="Fechar menu" className="absolute inset-0 cursor-default bg-ink/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navegação"
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-surface p-4 shadow-lg"
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="px-1 text-lg font-semibold text-ink">ZELII</span>
          <IconButton ref={closeButtonRef} aria-label="Fechar menu" onClick={onClose}>
            <CloseIcon className="h-5 w-5" />
          </IconButton>
        </div>
        <Link
          href="/app/cadastros"
          onClick={onClose}
          className="mb-4 inline-flex min-h-touch items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-white transition-colors hover:opacity-90"
        >
          <PlusIcon className="h-4 w-4" />
          Cadastrar
        </Link>
        <ContextSwitcher className="mb-4" />
        <nav className="flex flex-1 flex-col gap-4">
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
                      onClick={onClose}
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
            onClick={onClose}
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
      </div>
    </div>
  );
}
