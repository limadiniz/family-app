import { RoadmapPage } from '@/components/roadmap-page';

export default function CalendarPage() {
  return (
    <RoadmapPage
      title="Agenda"
      phase="Fase 2 — Daily Life"
      description="Visualização diária/semanal/mensal por filho, cuidador, residência e categoria. O schema (CalendarEvent) já existe em packages/domain; esta tela passa a consumir a API assim que os endpoints de agenda forem implementados."
    />
  );
}
