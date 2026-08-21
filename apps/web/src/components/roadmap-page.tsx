export function RoadmapPage({ title, phase, description }: { title: string; phase: string; description: string }) {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      <div className="mt-6 rounded-lg border border-dashed border-border bg-surface p-6">
        <p className="text-sm font-medium text-primary">{phase}</p>
        <p className="mt-2 text-sm text-inkMuted">{description}</p>
      </div>
    </div>
  );
}
