import Image from 'next/image';
import Link from 'next/link';
import heroImage from '../../public/images/zelii-hero-family-care.png';

/**
 * Hero da homepage — v2 (composição integrada).
 *
 * Por que a v1 (grid de duas colunas, imagem confinada à coluna direita)
 * foi trocada: o PNG já nasce com espaço negativo à esquerda (personagens
 * concentrados nos ~60% direitos), pensado pra acomodar texto ao lado. Uma
 * coluna de grid estreita (58%) com a imagem em `object-contain` DENTRO
 * dela duplicava esse vazio — o do grid gap somado ao vazio interno do
 * próprio PNG —, encolhendo os personagens e enfraquecendo a peça.
 *
 * Abordagem daqui pra frente, só a partir de `lg` (1024px): a MESMA
 * imagem (um único `next/image`, sem duplicar o elemento) vira uma camada
 * (`absolute inset-0`) cobrindo a seção inteira, de ponta a ponta da
 * viewport — não só o container de 1240px do texto. O texto flutua por
 * cima (`relative z-10`) num container mais estreito. `object-contain` +
 * `object-right`: como a caixa (largura da viewport × altura da seção) é
 * sempre proporcionalmente mais larga que a imagem (1586:992 ≈ 1.6:1) em
 * qualquer largura testada, a imagem é sempre limitada pela ALTURA da
 * caixa — preenche a seção de cima a baixo e gruda na direita. O espaço
 * que sobra à esquerda é o PRÓPRIO vazio já desenhado na arte, não um
 * vazio novo somado a ele. Resultado: personagens visivelmente maiores,
 * sem sobreposição com o texto, sem vazio duplicado no centro.
 *
 * Abaixo de `lg`, o mesmo elemento de imagem simplesmente volta ao fluxo
 * normal do documento — CSS responsivo troca a posição do container
 * (`relative` → `lg:absolute`), não a imagem em si — depois do texto, na
 * ordem de leitura pedida pro mobile/tablet retrato (título → descrição →
 * assinatura → CTAs → ilustração). `z-10` no texto garante que ele sempre
 * fique visualmente por cima da imagem em `lg`, independente da ordem no
 * DOM (que continua texto-antes-de-imagem, correta pra teclado/leitor de
 * tela nos dois casos).
 *
 * Título com tamanho fluido via `clamp()` de 1024px a 1920px (44px a
 * 64px) em vez de um punhado de breakpoints fixos — escala
 * proporcionalmente em qualquer largura intermediária, não só nos
 * tamanhos testados manualmente.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-bg to-white">
      <div className="mx-auto max-w-[1240px] px-6 py-16 sm:px-8 sm:py-20 lg:flex lg:min-h-[clamp(560px,30vw+260px,700px)] lg:items-center lg:px-10 lg:py-16 min-[1200px]:px-12">
        {/* z-10 relativo AQUI (não só no container acima) — a camada de imagem
            (irmã, `lg:absolute`) senão pinta por cima deste bloco mesmo com
            z-0, porque um elemento posicionado sempre fica acima de um
            irmão estático (sem position própria), não importa a ordem no DOM. */}
        {/* Largura do bloco de texto também é fluida (clamp), não um valor
            fixo — em 1024px (o `lg` mais estreito) uma coluna larga o
            bastante pra caber o texto em 3 linhas em 1440px sobrepõe a
            ilustração (a imagem, escalada pela altura da seção, é mais
            estreita em telas mais baixas/estreitas). Escala de ~440px
            (1024px) a 680px (1440px+). */}
        <div className="relative z-10 w-full text-center lg:max-w-[clamp(380px,-324px+69.7vw,680px)] lg:text-left">
          <h1 className="mx-auto text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-[2.75rem] lg:mx-0 lg:text-[clamp(2.75rem,1.32rem+2.232vw,4rem)] lg:leading-[1.02]">
            Uma família tem mil coisas acontecendo. A ZELII coloca todas em sintonia.
          </h1>

          <div className="mx-auto mt-6 max-w-[36rem] space-y-4 text-lg leading-[1.6] text-inkMuted lg:mx-0 lg:text-[19px]">
            <p>
              Cuidar de quem amamos exige atenção, presença e muito carinho — mas não deveria significar carregar
              tudo na cabeça ou deixar você por último.
            </p>
            <p>
              A ZELII reúne a rotina, as informações e as responsabilidades da família para que toda a rede
              participe e ninguém precise cuidar de tudo sozinho.
            </p>
          </div>

          <p className="mt-6 flex items-center justify-center gap-2.5 text-base font-medium text-ink lg:justify-start">
            <span aria-hidden="true" className="h-px w-6 shrink-0 bg-success" />
            Todo o cuidado da família, sem esquecer de quem cuida.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
            <Link
              href="/cadastro"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-primary px-6 text-base font-semibold text-white shadow-sm transition-all hover:bg-[#C24E41] hover:shadow-md active:scale-[0.98] active:bg-[#B44639] sm:w-auto"
            >
              Começar gratuitamente
            </Link>
            <Link
              href="/como-funciona"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-border bg-surface/60 px-6 text-base font-semibold text-ink transition-colors hover:bg-surfaceMuted active:bg-border/50 sm:w-auto"
            >
              Ver como funciona
            </Link>
          </div>
        </div>

        {/* Abaixo de lg: em fluxo normal, depois do texto. A partir de lg: camada absoluta cobrindo a section inteira (ver nota acima). */}
        <div className="relative mt-12 aspect-[1586/992] w-full lg:absolute lg:inset-0 lg:z-0 lg:mt-0 lg:aspect-auto lg:h-full lg:w-full">
          <Image
            src={heroImage}
            alt="Ilustração de uma família com três gerações — avó, pais e crianças — em casa, cercada por lembretes de cuidado: consulta com o pediatra, horário do medicamento, autorização escolar entregue e um tempo reservado para quem cuida."
            fill
            priority
            sizes="100vw"
            className="object-contain object-right"
          />
        </div>
      </div>
    </section>
  );
}
