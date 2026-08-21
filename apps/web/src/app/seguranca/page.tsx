import { MarketingPage } from '@/components/marketing-page';

export default function SegurancaPage() {
  return (
    <MarketingPage title="Segurança em profundidade">
      <p>
        Toda ação sensível passa pelo Family Policy Engine antes de acontecer — nunca uma verificação isolada
        espalhada pelo código. Isso vale para o aplicativo, para a API e para o assistente de IA.
      </p>
      <h2>Isolamento entre famílias</h2>
      <p>Cada conta opera em seu próprio limite de dados (tenant), reforçado por Row Level Security no banco de dados.</p>
      <h2>Auditoria</h2>
      <p>Ações relevantes — acesso a dados de saúde, concessão de permissão, uso da IA — geram um registro de auditoria imutável.</p>
      <h2>Armazenamento</h2>
      <p>Documentos são privados por padrão, com URLs assinadas e temporárias — nunca públicos.</p>
      <p className="text-sm">Veja detalhes técnicos completos em SECURITY.md no repositório do projeto.</p>
    </MarketingPage>
  );
}
