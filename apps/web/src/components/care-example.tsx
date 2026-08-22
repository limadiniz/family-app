/**
 * "Um exemplo real" (§16) — o comunicado da escola do passeio, do texto cru
 * até a rotina organizada. Cinco momentos visualmente diferentes (recebido →
 * interpretação → coordenação → confirmação → resultado), nunca como
 * chat/robô genérico: o comunicado aparece como um cartão de mensagem, a
 * interpretação como uma lista de itens identificados, a coordenação como
 * uma frase de transição, a confirmação como uma declaração em destaque, e o
 * resultado como a mesma lista agora com cada item confirmado — o mesmo
 * vocabulário visual da 4ª coluna da ilustração do fluxo.
 */
const IDENTIFIED_ITEMS = [
  { label: 'Passeio — dia 28', tone: 'text-info' },
  { label: 'Entregar autorização — até dia 24', tone: 'text-primary' },
  { label: 'Levar lanche', tone: 'text-inkMuted' },
  { label: 'Levar boné', tone: 'text-inkMuted' },
];

function StageLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-primary">{children}</p>;
}

export function CareExample() {
  return (
    <section className="bg-surfaceMuted/50">
      <div className="mx-auto max-w-[820px] px-6 py-14 sm:px-8 sm:py-16">
        <h2 className="text-center text-2xl font-semibold text-ink sm:text-[1.75rem]">
          Da mensagem à rotina organizada
        </h2>
        <p className="mx-auto mt-3 max-w-[46rem] text-center text-base leading-relaxed text-inkMuted">
          A escola envia um comunicado:
        </p>

        <div className="mt-8 space-y-5">
          {/* 1. informação recebida — cartão de mensagem */}
          <div className="rounded-[18px] border border-border bg-surface p-5 sm:p-6">
            <StageLabel>Recebido</StageLabel>
            <p className="mt-2 text-lg leading-relaxed text-ink">
              &quot;Passeio dia 28. Entregar autorização até dia 24. Levar lanche e boné.&quot;
            </p>
          </div>

          {/* 2. interpretação — o que a ZELII identificou */}
          <div className="rounded-[18px] border border-border bg-surface p-5 sm:p-6">
            <StageLabel>Interpretação</StageLabel>
            <p className="mt-2 text-[15px] text-inkMuted">A ZELII identifica:</p>
            <ul className="mt-3 space-y-2">
              {IDENTIFIED_ITEMS.map((item) => (
                <li key={item.label} className="flex items-center gap-2.5 text-[15px] text-ink">
                  <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current ${item.tone}`} />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>

          {/* 3. coordenação */}
          <div className="rounded-[18px] border border-border bg-surface p-5 sm:p-6">
            <StageLabel>Coordenação</StageLabel>
            <p className="mt-2 text-[15px] leading-relaxed text-inkMuted">
              Depois, a ZELII conecta as providências à criança e aos responsáveis envolvidos.
            </p>
          </div>

          {/* 4. confirmação — em destaque, cor de confirmação (sálvia) */}
          <div className="rounded-[18px] border border-success/30 bg-success/10 p-5 sm:p-6">
            <StageLabel>Confirmação</StageLabel>
            <p className="mt-2 text-[15px] font-medium leading-relaxed text-ink">
              Você revisa, confirma e decide quem cuidará de cada parte. A ZELII nunca decide sozinha.
            </p>
          </div>

          {/* 5. resultado organizado — mesma lista da interpretação, agora confirmada */}
          <div className="rounded-[18px] border border-border bg-surface p-5 sm:p-6">
            <StageLabel>Resultado organizado</StageLabel>
            <ul className="mt-3 space-y-2">
              {IDENTIFIED_ITEMS.map((item) => (
                <li key={item.label} className="flex items-center gap-2.5 text-[15px] text-ink">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 shrink-0 text-success"
                  >
                    <circle cx="10" cy="10" r="7.5" />
                    <path d="M6.8 10.2l2.1 2.1 4.3-4.6" />
                  </svg>
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
