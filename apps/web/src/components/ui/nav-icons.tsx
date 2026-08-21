import type { SVGProps } from 'react';

/**
 * Ícones de linha para as 5 áreas da navegação (§6.4) — traçados
 * autorais simples (não copiados de nenhum ícone set de terceiros),
 * 20×20, `currentColor`, para herdar a cor do link ativo/inativo sem
 * depender de instalar uma lib de ícones nova.
 */
type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

/** Hoje — sol, o dia em curso. */
export function TodayIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.6 4.6l1.4 1.4M14 14l1.4 1.4M4.6 15.4L6 14M14 6l1.4-1.4" />
    </svg>
  );
}

/** Família — duas pessoas, o círculo de cuidado. */
export function FamilyIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="7.3" cy="6.5" r="2.3" />
      <path d="M2.8 16c.4-2.8 2.2-4.3 4.5-4.3s4.1 1.5 4.5 4.3" />
      <circle cx="14.2" cy="7.3" r="1.9" />
      <path d="M13 11.9c1.9.1 3.3 1.4 3.7 3.6" />
    </svg>
  );
}

/** Agenda — calendário com marcações. */
export function AgendaIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="2.8" y="4" width="14.4" height="13" rx="2" />
      <path d="M2.8 8h14.4M6.5 2.5v3M13.5 2.5v3" />
      <path d="M6 11.5h2M10 11.5h2M6 14h2" />
    </svg>
  );
}

/** Saúde — cruz dentro de um escudo, dado protegido. */
export function HealthIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M10 2.5 16.5 5v5c0 4-2.8 6.7-6.5 7.5C6.3 16.7 3.5 14 3.5 10V5L10 2.5Z" />
      <path d="M10 7.2v5.6M7.2 10h5.6" />
    </svg>
  );
}

/** Assistente — brilho/faísca da ZELII. */
export function AssistantIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M10 2.5 11.4 8 17 10 11.4 12 10 17.5 8.6 12 3 10 8.6 8Z" />
    </svg>
  );
}

/** Configurações — engrenagem simplificada. */
export function SettingsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 3v2M10 15v2M3 10h2M15 10h2M5.1 5.1l1.4 1.4M13.5 13.5l1.4 1.4M5.1 14.9l1.4-1.4M13.5 6.5l1.4-1.4" />
    </svg>
  );
}
