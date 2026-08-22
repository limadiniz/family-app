/**
 * Hero introdutório de `/como-funciona` — eyebrow + único `h1` da página +
 * introdução + frase de confiança (spec do redesign, §8-9).
 *
 * Centralizado em todos os tamanhos (diferente do hero da home, que é
 * centralizado só abaixo de `lg` e vira duas colunas — texto à esquerda,
 * ilustração à direita — a partir daí). Aqui não existe ilustração ao lado
 * do texto: a arte do fluxo vem depois, em seção própria de largura cheia
 * (ver `flow-illustration.tsx`). Forçar alinhamento à esquerda sem nada para
 * balancear à direita deixaria um vazio grande sem função; manter
 * centralizado nos dois tamanhos é a leitura "coerente com a homepage" que
 * faz sentido para uma composição de uma coluna só — mesma tipografia,
 * mesmas cores, mesmo ritmo vertical.
 *
 * Altura contida de propósito (sem `min-h` grande) — a ilustração precisa
 * ficar sugerida/visível já na primeira dobra em telas comuns.
 */
export function ComoFuncionaHero() {
  return (
    <section className="bg-gradient-to-b from-bg to-white">
      <div className="mx-auto max-w-[46rem] px-6 py-14 text-center sm:px-8 sm:py-16 lg:py-20">
        <p className="text-sm font-semibold tracking-wide text-primary">Da informação à ação</p>

        <h1 className="mx-auto mt-3 text-balance text-[2.125rem] font-semibold leading-[1.08] tracking-tight text-ink sm:text-[2.5rem] md:text-[2.75rem] lg:text-[3.25rem] lg:leading-[1.05] xl:text-[3.75rem] 2xl:text-[4rem]">
          Como a ZELII transforma informação em cuidado
        </h1>

        <p className="mx-auto mt-6 max-w-[46rem] text-lg leading-[1.6] text-inkMuted lg:text-[19px]">
          Tudo o que chega sobre a rotina da família pode se transformar em uma ação clara e compartilhada. A ZELII
          ajuda a capturar a informação, entender o que ela significa, conectar as pessoas certas e acompanhar o que
          precisa acontecer.
        </p>

        <p className="mx-auto mt-6 flex max-w-[36rem] items-center justify-center gap-2.5 text-base font-medium text-ink">
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5 shrink-0 text-success"
          >
            <circle cx="10" cy="10" r="7.5" />
            <path d="M6.8 10.2l2.1 2.1 4.3-4.6" />
          </svg>
          Você continua no controle: nada é adicionado ou compartilhado sem sua confirmação.
        </p>
      </div>
    </section>
  );
}
