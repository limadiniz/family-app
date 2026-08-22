import type { SVGProps } from 'react';

/**
 * As quatro etapas em HTML (§15) — o conteúdo essencial do fluxo Capturar →
 * Entender → Coordenar → Agir existe aqui como texto real, não só dentro da
 * arte (`flow-illustration.tsx`). Ícones autorais simples (mesmo tratamento
 * de `nav-icons.tsx`/`trust-bar.tsx`: traço `currentColor`, sem lib nova),
 * um por etapa, ecoando os mesmos ícones/cores já usados nos círculos da
 * própria ilustração (Capturar/Entender em azul-info, Coordenar em
 * sálvia-success, Agir em coral-primary) — reforça visualmente que a arte e
 * os cartões contam a mesma história.
 */
type IconProps = SVGProps<SVGSVGElement>;

const iconBase = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function CaptureIcon(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M8 4H5a1 1 0 0 0-1 1v3M16 4h3a1 1 0 0 1 1 1v3M8 20H5a1 1 0 0 1-1-1v-3M16 20h3a1 1 0 0 0 1-1v-3" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}

function UnderstandIcon(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M12 3.5 13.6 9.4 19.5 11l-5.9 1.6L12 18.5l-1.6-5.9L4.5 11l5.9-1.6Z" />
    </svg>
  );
}

function CoordinateIcon(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <circle cx="9" cy="8" r="2.6" />
      <path d="M3.6 19c.4-3.2 2.4-5 5.4-5s5 1.8 5.4 5" />
      <circle cx="17.2" cy="9" r="2.1" />
      <path d="M15.6 14.3c2.1.2 3.7 1.6 4.1 4.1" />
    </svg>
  );
}

function ActIcon(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.3 12.3 11 15l4.8-5.4" />
    </svg>
  );
}

const STEPS = [
  {
    number: '1',
    title: 'Capturar',
    text: 'Uma foto, uma mensagem, um PDF, um áudio ou um texto entra na ZELII. Você não precisa decidir imediatamente onde cada informação deve ficar.',
    icon: CaptureIcon,
    tone: 'text-info bg-info/10',
  },
  {
    number: '2',
    title: 'Entender',
    text: 'A ZELII identifica eventos, prazos, tarefas e documentos. Quando existe alguma dúvida, ela pede sua revisão antes de transformar a informação em fato.',
    icon: UnderstandIcon,
    tone: 'text-info bg-info/10',
  },
  {
    number: '3',
    title: 'Coordenar',
    text: 'A informação é conectada à pessoa, ao momento e aos responsáveis certos. Cada integrante da rede recebe apenas o contexto necessário para participar do cuidado.',
    icon: CoordinateIcon,
    tone: 'text-success bg-success/10',
  },
  {
    number: '4',
    title: 'Agir',
    text: 'Com sua confirmação, a informação pode virar compromisso, tarefa, alerta, solicitação ou resumo de cuidado. A ZELII ajuda a organizar; a decisão continua sendo sua.',
    icon: ActIcon,
    tone: 'text-primary bg-primary/10',
  },
] as const;

export function HowItWorksSteps() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-[1240px] px-6 py-14 sm:px-8 sm:py-16 lg:px-10">
        <h2 className="text-center text-2xl font-semibold text-ink sm:text-[1.75rem]">
          Capturar, entender, coordenar, agir
        </h2>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className="flex flex-col rounded-[18px] border border-border bg-surface p-6 shadow-[0_1px_2px_rgba(75,51,70,0.06)]"
              >
                <div className="flex items-center gap-3">
                  <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${step.tone}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-semibold text-inkMuted">Etapa {step.number}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-ink">{step.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-inkMuted">{step.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
