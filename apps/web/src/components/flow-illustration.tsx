import Image from 'next/image';

/**
 * Visão geral do fluxo (Capturar → Entender → Coordenar → Agir) — a arte
 * completa (`zelii-como-funciona-fluxo.png`, 1717×916, fundo creme já
 * integrado ao fundo da página) fica logo após o hero e antes do
 * detalhamento em HTML de cada etapa (`how-it-works-steps.tsx`), que é onde
 * o conteúdo essencial existe de fato em texto — a imagem aqui é só a visão
 * panorâmica, nunca a única fonte da informação.
 *
 * Um ÚNICO `<Image>` no DOM (não dois, um por breakpoint) — o mesmo arquivo
 * muda de comportamento por CSS puro entre `lg` (1024px) e abaixo:
 *
 * - `lg`+ (desktop e tablet paisagem): a arte inteira cabe contida dentro do
 *   container de 1240px do site (mesma largura de nav/footer/TrustBar),
 *   `object-contain`, sem rolagem.
 * - abaixo de `lg` (mobile e tablet retrato — larguras onde a arte inteira
 *   encolheria demais para os cartões da ilustração ficarem legíveis): a
 *   mesma imagem ganha uma largura mínima de 920px (dentro da faixa
 *   850-1000px pedida) dentro de um contêiner com rolagem horizontal
 *   própria — o documento em si nunca rola na horizontal. `min-width` (não
 *   `width` fixo) deixa a arte crescer para preencher tablets retrato mais
 *   largos (ex.: 820-1023px) sem forçar rolagem onde ela cabe folgada.
 *   Padding lateral no contêiner (não na imagem) evita que a 1ª e a última
 *   etapa fiquem coladas na borda; como a rolagem começa em `scrollLeft: 0`
 *   por padrão (LTR), a 1ª etapa ("Capturar") já aparece inteira sem
 *   nenhuma interação.
 *
 * `priority`: a ilustração é o maior elemento visual já sugerido na
 * primeira dobra em telas comuns (§10) — normalmente o candidato a LCP
 * desta página — por isso carrega com prioridade em vez de lazy.
 */
export function FlowIllustration() {
  return (
    <section className="border-y border-border/60 bg-bg">
      <div className="mx-auto max-w-[1240px] px-6 py-10 sm:px-8 sm:py-12 lg:px-10 lg:py-14">
        <h2 className="sr-only">Fluxo: Capturar, Entender, Coordenar, Agir</h2>

        <p className="mb-3 flex items-center gap-2 text-sm text-inkMuted lg:hidden">
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            className="h-4 w-4 shrink-0"
          >
            <path d="M3 10h14M13 5.5 17.5 10 13 14.5" />
          </svg>
          Deslize para acompanhar as quatro etapas.
        </p>

        {/* `tabIndex={0}` + `role="group"` — abaixo de `lg` este é um contêiner
            com rolagem própria; sem ser focável, quem navega só por teclado não
            consegue rolar até ver as etapas 3 e 4 (rolagem horizontal só
            responde a arrastar/roda do mouse por padrão). A partir de `lg` a
            rolagem não existe mais (`lg:overflow-visible`), então focar aqui
            vira um no-op inofensivo — não remove nada da página, só um ponto
            de tab a mais que não faz diferença visual. */}
        <div
          role="group"
          aria-label="Fluxo Capturar, Entender, Coordenar, Agir"
          tabIndex={0}
          className="-mx-6 overflow-x-auto px-6 pb-1 [overscroll-behavior-inline:contain] overscroll-x-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:-mx-8 sm:px-8 lg:mx-0 lg:overflow-visible lg:px-0 lg:pb-0"
        >
          <div className="mx-auto min-w-[920px] w-full lg:min-w-0">
            <Image
              src="/images/zelii-como-funciona-fluxo.png"
              alt="Fluxo da ZELII: uma informação é capturada, entendida, coordenada com a rede de cuidado e transformada em uma ação confirmada"
              width={1717}
              height={916}
              sizes="(max-width: 1023px) 920px, 1180px"
              className="h-auto w-full object-contain"
              priority
            />
          </div>
        </div>

        <p className="mx-auto mt-6 max-w-[42rem] text-center text-base leading-relaxed text-inkMuted">
          Da informação à ação: a ZELII recebe o que chegou, organiza os dados, conecta quem cuida e pede sua
          confirmação antes de agir.
        </p>
      </div>
    </section>
  );
}
