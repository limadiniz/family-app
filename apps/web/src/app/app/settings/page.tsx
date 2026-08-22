import Link from 'next/link';
import { PageHeader, Card } from '@/components/ui';

export default function SettingsPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Configurações" description="Controle como a ZELII organiza, lembra e explica informações da família." />
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link href="/app/ai" className="rounded-xl focus:outline-none focus:ring-2 focus:ring-primary">
          <Card className="h-full transition-colors hover:border-primary/40">
            <h2 className="font-semibold text-ink">Memória e IA da ZELII</h2>
            <p className="mt-2 text-sm text-inkMuted">Revise fatos lembrados, corrija, esqueça, exporte e desative a memória personalizada.</p>
          </Card>
        </Link>
        <Card>
          <h2 className="font-semibold text-ink">Notificações e dispositivos</h2>
          <p className="mt-2 text-sm text-inkMuted">Preferências adicionais serão disponibilizadas gradualmente.</p>
        </Card>
      </div>
    </div>
  );
}
