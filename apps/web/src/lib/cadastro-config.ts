import type { ComponentType, SVGProps } from 'react';
import { FamilyIcon, AgendaIcon, PersonIcon, CaregiverIcon, TaskIcon, RequestIcon } from '@/components/ui/nav-icons';

export interface CadastroCategory {
  slug: string;
  label: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/**
 * Central de Cadastros (P1) — as 6 categorias do prompt mestre
 * ("família, pessoa, cuidador, compromisso, tarefa, solicitação"), cada
 * uma com backend real confirmado na descoberta desta fase:
 *   família      → POST /family-units          (já usado em /app/family)
 *   pessoa       → POST /dependents             (já usado em /app/people)
 *   cuidador     → POST /care-network/members    (novo consumidor — endpoint existia, sem UI)
 *   compromisso  → POST /calendar-events         (novo consumidor — endpoint existia, sem UI)
 *   tarefa       → POST /tasks                  (já usado em /app/tasks, agora com mais campos)
 *   solicitação  → POST /requests                (novo consumidor — endpoint existia, sem UI)
 * Nenhuma categoria aqui é um formulário sem backend confirmado (regra
 * dura do prompt mestre) — por isso não há categoria "Documento" ainda:
 * /app/documents não tem controller nenhum.
 */
export const CADASTRO_CATEGORIES: CadastroCategory[] = [
  { slug: 'familia', label: 'Família', description: 'Uma nova unidade familiar — útil quando há mais de uma casa.', icon: FamilyIcon },
  { slug: 'pessoa', label: 'Pessoa', description: 'Um dependente ou outro adulto da família.', icon: PersonIcon },
  { slug: 'cuidador', label: 'Cuidador', description: 'Dá acesso, com capacidades específicas, a alguém que já está na família.', icon: CaregiverIcon },
  { slug: 'compromisso', label: 'Compromisso', description: 'Um evento com data e hora — consulta, aula, atividade.', icon: AgendaIcon },
  { slug: 'tarefa', label: 'Tarefa', description: 'Algo a fazer, com prazo e responsável opcionais.', icon: TaskIcon },
  { slug: 'solicitacao', label: 'Solicitação', description: 'Um pedido para outro responsável — nada muda até ser aceito.', icon: RequestIcon },
  { slug: 'local', label: 'Local', description: 'Casa, escola, hospital, academia, salão e qualquer outro ponto da rotina.', icon: FamilyIcon },
  { slug: 'rotina', label: 'Rotina e horários', description: 'Entrada, saída e compromissos recorrentes de cada criança.', icon: AgendaIcon },
];

export function getCadastroCategory(slug: string): CadastroCategory | undefined {
  return CADASTRO_CATEGORIES.find((c) => c.slug === slug);
}
