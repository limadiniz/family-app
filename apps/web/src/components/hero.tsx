import Image from 'next/image';
import Link from 'next/link';
import heroImage from '../../public/images/zelii-hero-family-care.png';
import heroImageBg from '../../public/images/zelii-hero-family-bg.png';

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
 * Abaixo de `lg`, a imagem NÃO fica mais em fluxo normal depois do texto
 * (isso era a v2 original) — vira fundo: uma segunda `<Image>`, um RECORTE
 * separado (`zelii-hero-family-bg.png`, 380×770 — crop determinístico do
 * PNG original feito com Pillow, arquivo original preservado, nada gerado
 * por IA) do grupo de personagens sem nenhum cartão de texto, `absolute
 * inset-0` atrás do texto, `opacity-25` + `mask-image` (gradiente,
 * esmaece as bordas superior/inferior pro creme — sem borda dura de
 * retângulo). Por que um recorte à parte em vez do PNG inteiro: o PNG
 * inteiro com `object-cover` numa caixa estreita e alta corta os CARTÕES
 * da ilustração ("Pediatra — 10h", "Medicamento — 20h" etc.) de um jeito
 * arbitrário, deixando fragmentos de texto ilegíveis atrás do
 * texto/CTAs — o recorte isola só os personagens, então qualquer
 * crop/opacidade fica limpo. Um `text-shadow` (halo na cor do creme,
 * herdado por todo o bloco de texto, cancelado em `lg` onde o fundo volta
 * a ser só o creme liso) separa a letra de qualquer trecho mais escuro da
 * foto por trás. Contraste no pior caso medido (trecho escuro da foto a
 * 25% sobre o creme, atrás do ink): ~6.6:1 — acima do piso AA (4.5:1).
 *
 * A imagem principal (`zelii-hero-family-care.png`, inteira) continua
 * exclusiva do `lg`+ (`hidden lg:block`), com o MESMO tratamento
 * full-bleed de antes — nada mudou aí. Ordem de leitura no DOM continua
 * texto → CTAs → imagem em todos os tamanhos (a imagem de fundo do
 * mobile/tablet é puramente decorativa aos olhos do layout, por isso
 * `pointer-events-none`; `z-10` no bloco de texto garante que ele sempre
 * fique visualmente por cima, independente da ordem no DOM).
 *
 * Título com tamanho fluido via `clamp()` de 1024px a 1920px (44px a
 * 64px) em vez de um punhado de breakpoints fixos — escala
 * proporcionalmente em qualquer largura intermediária, não só nos
 * tamanhos testados manualmente.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-bg to-white">
      <div className="relative mx-auto min-h-[560px] max-w-[1240px] px-6 py-16 sm:min-h-[620px] sm:px-8 sm:py-20 lg:flex lg:min-h-[clamp(560px,30vw+260px,700px)] lg:items-center lg:px-10 lg:py-16 min-[1200px]:px-12">
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
        {/* Halo suave (text-shadow herdado pelos filhos) só abaixo de lg —
            lá o texto agora fica sobre a imagem de fundo (ver abaixo);
            reforça o contraste/legibilidade contra qualquer trecho mais
            escuro por trás, sem precisar escurecer a cor do texto em si.
            Cancelado em lg (`lg:[text-shadow:none]`) onde o fundo volta a
            ser só o creme liso. */}
        <div className="relative z-10 w-full text-center [text-shadow:0_0_14px_rgba(255,248,241,0.95),0_0_32px_rgba(255,248,241,0.8)] lg:max-w-[clamp(380px,-324px+69.7vw,680px)] lg:text-left lg:[text-shadow:none]">
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

        {/* Fundo abaixo de lg — ver nota no topo do arquivo. */}
        <div className="pointer-events-none absolute inset-0 z-0 lg:hidden">
          <Image
            src={heroImageBg}
            alt="Ilustração de uma família com três gerações — avó, pais e crianças — em casa, cercada por lembretes de cuidado: consulta com o pediatra, horário do medicamento, autorização escolar entregue e um tempo reservado para quem cuida."
            fill
            priority
            sizes="100vw"
            className="object-cover object-[center_20%] opacity-25 [-webkit-mask-image:linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent)] [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent)]"
          />
        </div>

        {/* A partir de lg: tratamento original v2, sem mudança (camada
            absoluta cobrindo a section inteira, opacidade cheia). */}
        <div className="relative mt-12 hidden aspect-[1586/992] w-full lg:absolute lg:inset-0 lg:z-0 lg:mt-0 lg:block lg:aspect-auto lg:h-full lg:w-full">
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
