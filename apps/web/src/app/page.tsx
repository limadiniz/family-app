import Image from 'next/image';
import Link from 'next/link';
import { SiteNav } from '@/components/site-nav';
import heroImage from '../../public/images/zelii-hero-family-care.png';

/**
 * Hero da homepage — posicionamento oficial ZELII (ver ADR/relatório do
 * reposicionamento). Duas colunas em telas grandes (42% texto / 58%
 * ilustração — a ilustração já nasce com uma margem esquerda "vazia" no
 * próprio PNG, quase idêntica ao token `bg` (#FFF8F1 vs. #FDF6EB medido no
 * arquivo), então o encontro entre as duas colunas fica suave em vez de uma
 * borda dura de retângulo); empilha em uma coluna (texto acima, imagem
 * abaixo) do mobile até `lg`. Hierarquia de texto deliberada, do texto
 * oficial fornecido:
 *   1. título (h1) — a promessa central, marcante;
 *   2. descrição — texto de apoio, largura confortável de leitura;
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
 *
 * `next/image` com import estático: dimensões (1586×992) vêm do próprio
 * arquivo, sem `width`/`height` manuais, e o Next gera `srcset`/`sizes`
 * automaticamente — evita layout shift e serve o tamanho certo por
 * breakpoint. `priority` porque é a maior imagem acima da dobra (LCP).
 */
export default function HomePage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-16 sm:py-20 lg:grid-cols-[42%_1fr] lg:gap-8 lg:py-24">
        <div className="text-center lg:text-left">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">
            Uma família tem mil coisas acontecendo. A ZELII coloca todas em sintonia.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-inkMuted lg:mx-0">
            Cuidar de quem amamos exige atenção, presença e muito carinho — mas não deveria significar carregar tudo
            na cabeça ou deixar você por último. A ZELII reúne compromissos, escola, saúde, medicamentos, documentos
            e responsabilidades em um só lugar. Assim, toda a rede participa, nada importante se perde e mães, pais
            e responsáveis também encontram espaço para cuidar de si.
          </p>
          <p className="mx-auto mt-8 max-w-md text-lg font-semibold text-primary lg:mx-0">
            ZELII. Todo o cuidado da família, sem esquecer de quem cuida.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start">
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
        </div>
        <Image
          src={heroImage}
          alt="Ilustração de uma família com três gerações reunidas em casa — avó, pais e crianças — cercada por lembretes de cuidado: consulta com o pediatra às 10h, medicamento às 20h, autorização escolar entregue e um tempo reservado para quem cuida."
          priority
          sizes="(min-width: 1024px) 58vw, 100vw"
          className="h-auto w-full"
        />
      </main>
    </>
  );
}
