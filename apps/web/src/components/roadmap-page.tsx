/**
 * Tela de "ainda não chegou aqui" para uma área do produto sem UI própria
 * ainda. `status` é linguagem voltada ao usuário (nunca um rótulo interno
 * de fase/sprint) — ver ZELII P0 §6.1: nada de "Fase N" na experiência de
 * produção, mesmo em telas de espera.
 */
export function RoadmapPage({ title, status = 'Em construção', description }: { title: string; status?: string; description: string }) {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      <div className="mt-6 rounded-lg border border-dashed border-border bg-surface p-6">
        <p className="text-sm font-medium text-primary">{status}</p>
        <p className="mt-2 text-sm text-inkMuted">{description}</p>
      </div>
    </div>
  );
}
