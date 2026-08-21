import Link from 'next/link';
import { SiteNav } from '@/components/site-nav';

/**
 * Hero da homepage — posicionamento oficial ZELII (ver ADR/relatório do
 * reposicionamento). Hierarquia deliberada, do texto oficial fornecido:
 *   1. título (h1) — a promessa central, marcante;
 *   2. descrição — texto de apoio, largura confortável de leitura
 *      (`max-w-xl`, ~65ch), nunca a largura cheia do container;
 *   3. assinatura — frase de marca curta, em destaque mas deliberadamente
 *      menor e mais leve que o h1 pra não competir com ele visualmente;
 *   4. CTAs — comportamento e destinos preservados (Começar gratuitamente
 *      continua o CTA primário; só o rótulo do secundário mudou de
 *      "Conhecer o produto" pra "Conhecer a ZELII", pedido explícito do
 *      texto oficial — o destino `/produto` continua o mesmo).
 *
 * Cor `primary` como texto (na assinatura) só é AA-compliant em texto
 * GRANDE/negrito (ver packages/ui/src/tokens.ts, nota de contraste WCAG) —
 * por isso `text-lg font-semibold` aqui, nunca um tamanho menor. Os dois
 * CTAs ganharam `min-h-11` (44px) explícito pra não depender só de
 * padding+line-height pra bater a área de toque mínima.
 */
export default function HomePage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-3xl px-6 py-20 text-center sm:py-24">
        <h1 className="text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">
          Uma família tem mil coisas acontecendo. A ZELII coloca todas em sintonia.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-inkMuted">
          Cuidar de quem amamos exige atenção, presença e muito carinho — mas não deveria significar carregar tudo
          na cabeça ou deixar você por último. A ZELII reúne compromissos, escola, saúde, medicamentos, documentos e
          responsabilidades em um só lugar. Assim, toda a rede participa, nada importante se perde e mães, pais e
          responsáveis também encontram espaço para cuidar de si.
        </p>
        <p className="mx-auto mt-8 max-w-md text-lg font-semibold text-primary">
          ZELII. Todo o cuidado da família, sem esquecer de quem cuida.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/cadastro"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-6 py-3 font-semibold text-white hover:opacity-90"
          >
            Começar gratuitamente
          </Link>
          <Link
            href="/produto"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-6 py-3 font-semibold text-ink hover:bg-surfaceMuted"
          >
            Conhecer a ZELII
          </Link>
        </div>
      </main>
    </>
  );
}
