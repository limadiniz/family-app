import { MarketingPage } from '@/components/marketing-page';

export default function ComoFuncionaPage() {
  return (
    <MarketingPage title="Como funciona">
      <p>
        Toda informação que entra na ZELII passa pelo mesmo ciclo: <strong>Capturar → Entender → Coordenar →
        Agir</strong>. É esse ciclo — não mais uma lista de funcionalidades — que faz o produto realmente coordenar
        quem cuida de quem.
      </p>
      <h2>1. Capturar</h2>
      <p>
        Uma foto, um print, um PDF, um áudio ou um texto — qualquer coisa que chegue sobre a vida da sua família
        vai para a Caixa de Entrada Universal. Você não precisa decidir na hora onde aquilo se encaixa.
      </p>
      <h2>2. Entender</h2>
      <p>
        O sistema identifica o que está ali: um evento, um prazo, uma tarefa, um documento. Baixa confiança nunca
        vira fato silenciosamente — quando não tem certeza, ele pergunta antes de agir.
      </p>
      <h2>3. Coordenar</h2>
      <p>
        O Family Care Graph conecta aquilo à pessoa certa, à residência certa, à janela de cuidado certa — e a quem
        tem autoridade e responsabilidade sobre aquela criança naquele momento.
      </p>
      <h2>4. Agir</h2>
      <p>
        Vira um evento na agenda, uma tarefa, um alerta, uma solicitação para outra pessoa, ou um briefing antes de
        uma troca de cuidado. Sempre com confirmação humana antes de qualquer coisa irreversível.
      </p>
      <h2>Um exemplo real</h2>
      <p>
        Você fotografa um comunicado da escola: &quot;Passeio dia 28. Autorização até dia 24. Levar lanche e
        boné.&quot; O sistema identifica 1 evento, 1 prazo e 2 itens para preparar — e, sabendo que a criança vai
        estar com o outro responsável na noite anterior, pergunta se você quer pedir a ele que prepare o lanche e o
        boné. Você decide; o sistema nunca decide sozinho.
      </p>
    </MarketingPage>
  );
}
