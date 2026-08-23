# Fase 0 da IA — governança e baseline

**Início:** 22 de agosto de 2026
**Objetivo:** impedir que flags ou configurações isoladas ativem capacidades avançadas sem implementação, privacidade, invalidação e avaliações aprovadas.

## Entregas técnicas concluídas

- [x] flags independentes para busca vetorial, shadow mode, cache exato, cache semântico, MCP read, MCP proposals, agente e modelo fine-tuned;
- [x] gate tipado que separa intenção de rollout de evidência de prontidão;
- [x] evidência de prontidão mantida no código da API, inicialmente fechada;
- [x] endpoint de capacidades informa `DISABLED`, `BLOCKED`, `SHADOW` ou `ENABLED`;
- [x] flag de ambiente sozinha não consegue habilitar uma capacidade;
- [x] baseline programático de segurança com invariantes de tolerância zero;
- [x] cenários iniciais de autorização, prompt injection, cache, ferramentas, agente e saúde;
- [x] testes unitários dos gates e critérios de release.

## Gates de prontidão

Cada capacidade possui cinco evidências independentes:

| Gate                   | Significado                                                             |
| ---------------------- | ----------------------------------------------------------------------- |
| `IMPLEMENTATION_READY` | código, migração, fallback e rollback foram concluídos                  |
| `PROVIDER_APPROVED`    | fornecedor/conector, contrato, retenção e suboperadores foram aprovados |
| `PRIVACY_APPROVED`     | finalidade, base legal, minimização e RIPD foram revisados              |
| `INVALIDATION_READY`   | atualização, revogação e exclusão propagam para derivados               |
| `SAFETY_EVALUATED`     | suite offline, isolamento, red team e canário atingiram os limiares     |

Essas evidências ficam em `apps/api/src/modules/ai/ai-capability-readiness.ts`. Elas não são variáveis de ambiente. Alterá-las deve exigir revisão de código e anexação da evidência correspondente. A Fase 1 já concluiu `IMPLEMENTATION_READY` e `INVALIDATION_READY` da busca vetorial; os gates de fornecedor, privacidade e segurança continuam fechados.

## Baseline inicial de release

Os limiares estão em `packages/ai/src/safety-evals.ts`:

- pelo menos 30 casos avaliados;
- zero vazamento de autorização;
- zero escrita sem confirmação;
- zero cache hit desatualizado;
- zero violação de orçamento do agente;
- recall@k mínimo de 0,85;
- groundedness mínimo de 0,95.

Os números de qualidade são um ponto de partida e devem ser calibrados com o corpus sintético da ZELII. As invariantes de autorização e escrita permanecem em zero.

## Pendências organizacionais

- [ ] nomear responsável técnico, responsável de produto e responsável de privacidade;
- [ ] concluir inventário de operações de tratamento;
- [ ] elaborar/revisar RIPD para IA e dados de crianças/saúde;
- [ ] aprovar matriz de fornecedores de embeddings, cache e conectores;
- [ ] definir política de retenção, exclusão e transferência internacional;
- [ ] definir SLOs, alertas e procedimento de incidente;
- [ ] aprovar critérios formais de canário e rollback;
- [ ] registrar as aprovações em repositório ou sistema de governança.

## Como ativar uma fase futuramente

1. implementar a capacidade atrás da respectiva flag;
2. comprovar cada gate com testes e documentos;
3. alterar a evidência de prontidão em revisão de código;
4. ativar primeiro em shadow ou tenant interno;
5. rodar avaliações e observar métricas;
6. promover gradualmente ou desligar pelo kill switch.

## Evolução concluída depois desta fase

As fundações técnicas das fases 1 a 4 foram implementadas. Busca vetorial, caches, MCP e agente continuam sem influenciar a produção enquanto fornecedor, privacidade e avaliações permanecerem fechados.
