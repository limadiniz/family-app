import Link from 'next/link';

const links = [
  { href: '/produto', label: 'Produto' },
  { href: '/familias', label: 'Famílias' },
  { href: '/seguranca', label: 'Segurança' },
  { href: '/privacidade', label: 'Privacidade' },
  { href: '/precos', label: 'Preços' },
  { href: '/ajuda', label: 'Ajuda' },
];

export function SiteNav() {
  return (
    <header className="border-b border-border bg-surface/80 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold text-ink">
          Family App
        </Link>
        <div className="hidden gap-6 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm text-inkMuted hover:text-ink">
              {l.label}
            </Link>
          ))}
        </div>
        <div className="flex gap-3">
          <Link href="/entrar" className="rounded-md px-3 py-2 text-sm text-ink hover:bg-surfaceMuted">
            Entrar
          </Link>
          <Link href="/cadastro" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90">
            Criar conta
          </Link>
        </div>
      </nav>
    </header>
  );
}
