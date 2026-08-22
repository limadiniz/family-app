# Controles de produção da IA ZELII

## Estado entregue

- O contexto é montado no servidor e cada pessoa/domínio passa pelo Policy Engine antes da leitura.
- O modelo recebe fatos minimizados e fontes, nunca linhas completas do banco.
- Conflitos, prazos e alertas são calculados por regras determinísticas.
- Ações são propostas, revisadas, confirmadas, reautorizadas e só então executadas por serviços de domínio.
- A memória oficial é estruturada no banco da ZELII, protegida por RLS e independente do provedor de LLM.
- Perguntas, prompts e respostas completas não são gravados na auditoria ou nas métricas.

## Provedor de linguagem

Sem `AI_PROVIDER_API_KEY` e `AI_MODEL`, a aplicação opera em modo determinístico. Antes de habilitar um provedor em produção, registrar e aprovar:

1. região de processamento e transferência internacional;
2. lista de subprocessadores;
3. retenção zero ou menor retenção contratualmente disponível;
4. exclusão do conteúdo de treinamento;
5. termos para dados pessoais e de saúde;
6. prazo e processo de exclusão;
7. resposta a incidente e auditoria;
8. limites de taxa, disponibilidade e custo;
9. testes de segurança e red teaming do modelo escolhido.

O fallback determinístico permanece obrigatório mesmo após a ativação.

## P2 multimodal

Voz, OCR e caixa escolar externa continuam desativados. O Capture Engine aceita os tipos de entrada, mas encaminha conteúdo não textual para revisão manual e não fabrica extrações. A API expõe `GET /ai/capabilities` para a interface não prometer uma capacidade indisponível.

Para habilitar cada integração, exigir adaptador isolado, análise de fornecedor, arquivo privado, prazo de retenção explícito, remoção do original quando não necessário, conteúdo tratado como não confiável, autorização por domínio/pessoa e confirmação humana antes de criar qualquer registro.

## Retenção recomendada

| Classe | Regra inicial |
| --- | --- |
| Preferência confirmada | Até revogação ou encerramento da conta |
| Disponibilidade | Validade curta definida no próprio item |
| Decisão operacional | Enquanto necessária para auditoria e contestação |
| Proposta rejeitada | Metadados mínimos; expiração curta |
| Insight proativo | Até expiração ou descarte |
| Áudio, OCR bruto e anexos | Não duplicar na memória; seguir retenção do Capture Item |
| Saúde e medicamentos | Fonte e verificação obrigatórias; conforme base legal e política aplicável |

Os prazos definitivos precisam de validação jurídica/LGPD e devem ser configuráveis por domínio.

## Observabilidade

`ai_metrics_events` aceita apenas tipo de evento, chaves controladas e metadados simples. Não enviar nomes, texto de perguntas, respostas, documentos, condições de saúde ou conteúdo de memória. Métricas nunca bloqueiam o fluxo do usuário.
