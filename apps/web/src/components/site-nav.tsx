'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

/**
 * Navegação principal (§11) — reduzida a 4 links (Produto, Como funciona,
 * Para famílias, Segurança). "Privacidade" foi pro footer (`site-footer.tsx`);
 * "Ajuda" e "Preços" saíram do nav principal por serem, hoje, placeholders
 * sem conteúdo real (`/ajuda`: "em construção"; `/precos`: "ainda não é uma
 * decisão comercial final") — as rotas continuam existindo e acessíveis por
 * URL direta, só não competem mais por espaço no cabeçalho.
 *
 * Abaixo de `lg` (1024px): menu hamburguer. Vira client component só por
 * causa disso (estado do menu aberto/fechado) — o resto do site continua
 * Server Component.
 */
const NAV_LINKS = [
  { href: '/produto', label: 'Produto' },
  { href: '/como-funciona', label: 'Como funciona' },
  { href: '/familias', label: 'Para famílias' },
  { href: '/seguranca', label: 'Segurança' },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  // Fecha com Escape, prende o foco dentro do painel enquanto aberto, e
  // trava o scroll do conteúdo atrás — os três requisitos de a11y do §11
  // pro menu mobile (funciona como diálogo).
  useEffect(() => {
    if (!open) return;

    firstLinkRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        openButtonRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-surface/80 backdrop-blur">
        <nav className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-4 lg:px-10" aria-label="Principal">
        <Link href="/" className="text-xl font-bold tracking-tight text-ink">
          ZELII
        </Link>

        <div className="hidden gap-7 lg:flex">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm text-inkMuted hover:text-ink">
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden gap-3 lg:flex">
          <Link href="/entrar" className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-ink hover:bg-surfaceMuted">
            Entrar
          </Link>
          <Link
            href="/cadastro"
            className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-white hover:opacity-90"
          >
            Criar conta
          </Link>
        </div>

        <button
          ref={openButtonRef}
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink hover:bg-surfaceMuted lg:hidden"
        >
          <span className="sr-only">{open ? 'Fechar menu' : 'Abrir menu'}</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        </nav>
      </header>

      {/* Irmão do <header>, não filho: `header` tem `backdrop-blur`, e
          `backdrop-filter` cria um novo containing block pra descendentes
          `fixed` (mesma família de `transform`/`filter`) — um painel `fixed`
          DENTRO do header herda o box (pequeno, ~77px) do header como
          referência de `inset`/`bottom`, em vez da viewport inteira.
          Resultado, se ficasse dentro: painel de ~11px de altura, quase
          invisível, com o conteúdo da página "vazando" por trás dele. */}
      {open && (
        <div
          id={menuId}
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-x-0 bottom-0 top-[77px] z-40 overflow-y-auto bg-surface lg:hidden"
        >
          <div className="flex flex-col gap-1 px-6 py-6">
            {NAV_LINKS.map((l, i) => (
              <Link
                key={l.href}
                ref={i === 0 ? firstLinkRef : undefined}
                href={l.href}
                onClick={() => setOpen(false)}
                className="min-h-11 rounded-md px-3 py-3 text-base text-ink hover:bg-surfaceMuted"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
              <Link
                href="/entrar"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-base font-semibold text-ink hover:bg-surfaceMuted"
              >
                Entrar
              </Link>
              <Link
                href="/cadastro"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-base font-semibold text-white hover:opacity-90"
              >
                Criar conta
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
