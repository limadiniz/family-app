import type { Metadata } from 'next';
import { CareExample } from '@/components/care-example';
import { ComoFuncionaHero } from '@/components/como-funciona-hero';
import { FinalCta } from '@/components/final-cta';
import { FlowIllustration } from '@/components/flow-illustration';
import { HowItWorksSteps } from '@/components/how-it-works-steps';
import { SiteFooter } from '@/components/site-footer';
import { SiteNav } from '@/components/site-nav';
import { TrustBar } from '@/components/trust-bar';

export const metadata: Metadata = {
  title: 'Como funciona — ZELII',
  description:
    'Veja como a ZELII transforma mensagens, documentos e compromissos em ações organizadas e compartilhadas pela rede de cuidado.',
};

/**
 * `/como-funciona` — redesign do fluxo Capturar → Entender → Coordenar →
 * Agir. Não usa `<MarketingPage>` (prosa em `max-w-3xl`, um `title` simples)
 * porque esta página precisa de uma seção de largura cheia para a
 * ilustração do fluxo (§10) e de várias composições visuais distintas — uma
 * página bem mais rica que a prosa institucional das outras rotas
 * (`/produto`, `/familias`, `/seguranca`...). Montar uma composição própria
 * aqui, reaproveitando `SiteNav`/`SiteFooter`/`TrustBar` como a home já faz,
 * evita alargar `MarketingPage` globalmente (e arriscar regressão nas
 * páginas mais simples que dependem dela) só por causa desta única página.
 *
 * Ordem das seções segue a spec: nav → hero → ilustração do fluxo → as
 * quatro etapas em HTML → exemplo real → princípios de confiança (reaproveita
 * o `<TrustBar>` da home — mesmo componente, mesmo conteúdo, mesmos 3 itens:
 * "Você continua no controle" / "Cada pessoa vê o necessário" / "O cuidado
 * fica mais leve") → CTA final → rodapé.
 */
export default function ComoFuncionaPage() {
  return (
    <>
      <SiteNav />
      <main>
        <ComoFuncionaHero />
        <FlowIllustration />
        <HowItWorksSteps />
        <CareExample />
        <TrustBar />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
