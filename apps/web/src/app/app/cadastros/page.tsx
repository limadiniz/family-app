import { PageHeader, ActionCard } from '@/components/ui';
import { CADASTRO_CATEGORIES } from '@/lib/cadastro-config';

/**
 * Central de Cadastros (P1) — ponto único de entrada pra criar qualquer
 * coisa real na ZELII, reunindo o que antes só existia espalhado em
 * formulários dentro de cada página de área. Cada card abre
 * `/app/cadastros/[categoria]`, um formulário com API real — ver
 * `lib/cadastro-config.ts` para a lista de categorias e seus endpoints.
 */
export default function CadastrosHubPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Central de Cadastros" description="O que você quer cadastrar?" />
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CADASTRO_CATEGORIES.map((c) => (
          <ActionCard
            key={c.slug}
            href={`/app/cadastros/${c.slug}`}
            title={c.label}
            description={c.description}
            icon={<c.icon className="h-6 w-6" />}
          />
        ))}
      </div>
    </div>
  );
}
