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

/** Menu (hambúrguer) — abre o MobileMenu em telas estreitas. */
export function MenuIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  );
}

/** Fechar — fecha o MobileMenu. */
export function CloseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 5l10 10M15 5 5 15" />
    </svg>
  );
}

/** Adicionar — botão "+ Cadastrar" (Central de Cadastros, P1). */
export function PlusIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

/** Pessoa — uma única pessoa (categoria "Pessoa" na Central de Cadastros). */
export function PersonIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="7" r="3" />
      <path d="M4 17c.6-3.4 2.8-5.3 6-5.3s5.4 1.9 6 5.3" />
    </svg>
  );
}

/** Cuidador — mãos/abrigo protegendo (categoria "Cuidador"). */
export function CaregiverIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M10 3.5 3.5 6.5v4c0 4 2.8 6.5 6.5 7.5 3.7-1 6.5-3.5 6.5-7.5v-4L10 3.5Z" />
      <path d="M7.2 10.3 9 12l3.8-4" />
    </svg>
  );
}

/** Tarefa — checklist com item marcado (categoria "Tarefa"). */
export function TaskIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="3.5" width="13" height="13" rx="2.5" />
      <path d="M6.5 10.3 9 12.7l4.5-5" />
    </svg>
  );
}

/** Solicitação — seta de ida e volta entre duas pessoas (categoria "Solicitação"). */
export function RequestIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h10l-2.5-2.5M16 13H6l2.5 2.5" />
    </svg>
  );
}
