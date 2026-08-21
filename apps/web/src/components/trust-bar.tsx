/**
 * Faixa de confiança — 3 benefícios logo abaixo do hero (§13). Ícones de
 * linha autorais e inline (mesmo tratamento de `packages/ui`/nav-icons.tsx:
 * stroke `currentColor`, sem lib de ícones nova) — decorativos, `aria-hidden`,
 * porque o título de cada item já carrega o significado em texto.
 */
const items = [
  {
    title: 'Você continua no controle',
    text: 'Nada é adicionado sem sua confirmação.',
    icon: (
      <path d="M12 3.5 19 6.5v5.2c0 4.6-3.1 7.7-7 8.8-3.9-1.1-7-4.2-7-8.8V6.5L12 3.5Z M9 12l2 2 4-4.2" />
    ),
  },
  {
    title: 'Cada pessoa vê o necessário',
    text: 'Informações e responsabilidades são compartilhadas na medida certa.',
    icon: (
      <>
        <circle cx="8.3" cy="8" r="2.6" />
        <path d="M3.2 19c.4-3.2 2.4-5 5.1-5s4.7 1.8 5.1 5" />
        <circle cx="16.3" cy="9" r="2.1" />
        <path d="M14.7 14.3c2.1.2 3.7 1.6 4.1 4.1" />
      </>
    ),
  },
  {
    title: 'O cuidado fica mais leve',
    text: 'Toda a rede sabe o que precisa fazer e quando.',
    icon: (
      <path d="M12 19.5s-6.8-4-6.8-9.3a4.1 4.1 0 0 1 6.8-3 4.1 4.1 0 0 1 6.8 3c0 5.3-6.8 9.3-6.8 9.3Z" />
    ),
  },
];

export function TrustBar() {
  return (
    <section className="border-y border-border bg-surfaceMuted/50">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-10 px-6 py-14 sm:px-8 md:grid-cols-3 md:gap-8 lg:px-10 lg:py-16">
        {items.map((item) => (
          <div key={item.title} className="flex flex-col items-center text-center md:items-start md:text-left">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-9 w-9 shrink-0 text-primary"
            >
              {item.icon}
            </svg>
            <h2 className="mt-4 text-lg font-semibold text-ink">{item.title}</h2>
            <p className="mt-2 max-w-[30ch] text-base leading-relaxed text-inkMuted">{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
