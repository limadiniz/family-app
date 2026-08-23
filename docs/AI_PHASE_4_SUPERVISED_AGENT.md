# Fase 4 da IA — agente supervisionado

**Início:** 22 de agosto de 2026
**Estado:** máquina de estados e API concluídas; planner desativado.

## O que foi implementado

- endpoint autenticado `POST /ai/agent/run` com objetivo limitado a 1.000 caracteres;
- máquina de estados tipada: leitura, uma reflexão, proposta ou resposta final;
- orçamento padrão de 4 passos, 5 leituras e 1 reflexão;
- escopo familiar reconstruído no servidor;
- bloqueio de expansão de ferramenta, pessoa e domínio;
- vínculo obrigatório entre o `subjectPersonId` do argumento e o escopo declarado;
- toda ferramenta passa pelo proxy MCP e pelo Policy Engine;
- ações retornam `WAITING_FOR_CONFIRMATION`; nenhuma escrita ocorre dentro do loop;
- telemetria apenas com estado, contadores, escopo e latência, sem objetivo ou resultados.

## Limites deliberados

- não existe execução autônoma de proposta;
- não existe loop aberto ou recursão livre;
- não existe planner configurado em produção;
- resultados externos são conteúdo não confiável;
- falha, orçamento excedido ou ampliação de escopo interrompem o agente.

## Gates restantes

- [ ] implementar o adapter `AI_AGENT_PLANNER` com saída estruturada e versionada;
- [ ] testar cenários adversariais e tentativas de ampliar escopo;
- [ ] medir taxa de conclusão, propostas incorretas e intervenções humanas;
- [ ] definir botão de interrupção e alertas operacionais;
- [ ] concluir RIPD e aprovação do provedor;
- [ ] executar shadow interno antes de `FF_AI_AGENT_LOOP=true`.

Mesmo após a ativação, “autônomo” não significa autorização para agir. A fronteira permanente da ZELII é: o agente pode pesquisar e preparar; a família revisa e decide.

## Evidência local

Os testes confirmaram limites de passo/reflexão/ferramenta, interrupção ao ampliar pessoa ou domínio, vínculo entre argumento e escopo declarado e retorno de proposta sem execução. O gate também foi testado para não consultar banco nem planner enquanto estiver bloqueado.
