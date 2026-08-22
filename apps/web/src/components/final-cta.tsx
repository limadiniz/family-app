import Link from 'next/link';

/**
 * CTA final (§18) — mesmo par de botões (estilo, alturas, estados) já usado
 * no hero da home (`hero.tsx`), por consistência visual entre as duas
 * páginas que mais convertem. `min-h-12` = 48px (acima do alvo mínimo de
 * toque de 44px do design system); foco visível herdado do `:focus-visible`
 * global (`globals.css`). Primário vai para o cadastro; secundário vai para
 * "Sobre" (`/produto` — mesma rota institucional do nav, só o rótulo do
 * menu virou "Sobre").
 */
export function FinalCta() {
  return (
    <section className="bg-gradient-to-b from-white to-bg">
      <div className="mx-auto max-w-[46rem] px-6 py-16 text-center sm:px-8 sm:py-20">
        <h2 className="text-balance text-2xl font-semibold text-ink sm:text-[1.75rem]">
          Pronto para deixar o cuidado mais leve?
        </h2>
        <p className="mx-auto mt-3 max-w-[36rem] text-base leading-relaxed text-inkMuted">
          Comece com o próximo compromisso da sua família. A ZELII ajuda a organizar o restante.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/cadastro"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-primary px-6 text-base font-semibold text-white shadow-sm transition-all hover:bg-[#C24E41] hover:shadow-md active:scale-[0.98] active:bg-[#B44639] sm:w-auto"
          >
            Começar gratuitamente
          </Link>
          <Link
            href="/produto"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-border bg-surface px-6 text-base font-semibold text-ink transition-colors hover:bg-surfaceMuted active:bg-border/50 sm:w-auto"
          >
            Conhecer a ZELII
          </Link>
        </div>
      </div>
    </section>
  );
}
