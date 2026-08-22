import Link from 'next/link';

/**
 * Footer leve — só existe porque "Privacidade" saiu da navegação principal
 * (§11: nav principal reduzida a Sobre / Como funciona / Para famílias /
 * Segurança) e precisa continuar acessível em algum lugar do site (§16).
 * Incluído na home e em toda página que usa `MarketingPage`.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1240px] flex-col items-center gap-3 px-6 py-8 text-sm text-inkMuted sm:flex-row sm:justify-between sm:px-8 lg:px-10">
        <p>© {new Date().getFullYear()} ZELII. Todos os direitos reservados.</p>
        <nav aria-label="Rodapé" className="flex gap-6">
          <Link href="/seguranca" className="underline-offset-4 hover:text-ink hover:underline">
            Segurança
          </Link>
          <Link href="/privacidade" className="underline-offset-4 hover:text-ink hover:underline">
            Privacidade
          </Link>
        </nav>
      </div>
    </footer>
  );
}
