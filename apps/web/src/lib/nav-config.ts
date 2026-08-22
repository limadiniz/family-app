import type { ComponentType, SVGProps } from 'react';
import { TodayIcon, FamilyIcon, AgendaIcon, HealthIcon, AssistantIcon, SettingsIcon } from '@/components/ui/nav-icons';

export interface NavItem {
  href: string;
  label: string;
}

export interface NavArea {
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  items: NavItem[];
}

/**
 * 5 áreas (§6.4) — fonte única compartilhada pelo Sidebar (desktop/tablet
 * landscape), pelo MobileBottomNav e pelo MobileMenu (tablet portrait/
 * mobile), pra nunca ter duas listas de navegação divergindo entre si.
 *
 * - Hoje: a central de decisões + o que chega pra revisar (Caixa de Entrada).
 * - Família: quem cuida de quem — Pessoas (todo mundo, com filtro por
 *   papel — substitui as antigas páginas Família/Filhos separadas, §5),
 *   Família (unidades familiares) e Rede de Cuidado.
 * - Agenda: tudo com data/prazo — Agenda, Tarefas, Solicitações.
 * - Saúde: dado sensível com proteção reforçada (§4) — Saúde, Emergência,
 *   Documentos — agrupados para deixar essa fronteira visível, não pra
 *   escondê-la.
 * - Assistente: ZELII.
 *
 * Configurações fica fora das 5 áreas de conteúdo, junto com Sair, como
 * chrome de conta.
 */
export const NAV_AREAS: NavArea[] = [
  {
    label: 'Hoje',
    icon: TodayIcon,
    items: [
      { href: '/app/today', label: 'Hoje' },
      { href: '/app/capture', label: 'Caixa de Entrada' },
    ],
  },
  {
    label: 'Família',
    icon: FamilyIcon,
    items: [
      { href: '/app/people', label: 'Pessoas' },
      { href: '/app/family', label: 'Família' },
      { href: '/app/care-network', label: 'Rede de Cuidado' },
    ],
  },
  {
    label: 'Agenda',
    icon: AgendaIcon,
    items: [
      { href: '/app/calendar', label: 'Agenda' },
      { href: '/app/tasks', label: 'Tarefas' },
      { href: '/app/requests', label: 'Solicitações' },
    ],
  },
  {
    label: 'Saúde',
    icon: HealthIcon,
    items: [
      { href: '/app/health', label: 'Saúde' },
      { href: '/app/emergency', label: 'Emergência' },
      { href: '/app/documents', label: 'Documentos' },
    ],
  },
  {
    label: 'Assistente',
    icon: AssistantIcon,
    items: [{ href: '/app/ai', label: 'Pergunte à ZELII' }],
  },
];

export const SETTINGS_ITEM: NavItem & { icon: ComponentType<SVGProps<SVGSVGElement>> } = {
  href: '/app/settings',
  label: 'Configurações',
  icon: SettingsIcon,
};
