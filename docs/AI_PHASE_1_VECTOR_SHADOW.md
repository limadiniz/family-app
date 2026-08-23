# Fase 1 da IA — vetores e invalidação segura

**Início:** 22 de agosto de 2026
**Estado:** infraestrutura implementada; ativação bloqueada por fornecedor, privacidade e avaliações.

## Entregas implementadas

- extensão `pgvector` na schema `extensions`;
- `ai_index_version` monotônico em capturas e memórias;
- tabela `ai_content_chunks` com tenant, pessoa, domínio, fonte, versão e sensibilidade;
- RLS por tenant, pessoa e domínio;
- busca vetorial exata por função `security invoker`;
- outbox `ai_invalidation_events` sem acesso para usuários autenticados;
- invalidação síncrona dos chunks antigos na transação da fonte;
- claim concorrente com `FOR UPDATE SKIP LOCKED`;
- retry limitado, propriedade por worker e conclusão idempotente;
- substituição atômica de chunks via RPC restrita a `service_role`;
- chunking determinístico e hashes SHA-256;
- abstração de provedor de embeddings sem fornecedor real configurado;
- pipeline que rejeita dimensão inválida e não envia conteúdo sensível;
- comparação lexical/vetorial por shadow e Reciprocal Rank Fusion;
- telemetria de recuperação sem pergunta ou conteúdo bruto;
- CI migrada para PostgreSQL 16 com pgvector.

## Fontes aceitas no piloto

O pipeline possui allowlist inicial para:

- `SCHOOL`;
- `DOCUMENTS`;
- `ACTIVITIES`;
- `NOTES`.

Além do domínio, a fonte precisa estar classificada como `PERSONAL`. Saúde, medicamentos, vacinação, emergência, finanças, documentos sem classificação segura e categorias médicas são tratados como `SENSITIVE` e não são enviados ao provedor.

`DOCUMENT_EXTRACTION` permanece sem loader. Ele só será implementado depois de existir extração textual revisada e classificação de sensibilidade.

## Garantias de invalidação

1. uma alteração relevante incrementa `ai_index_version`;
2. o trigger marca todos os chunks antigos como excluídos na mesma transação;
3. um evento idempotente é gravado no outbox;
4. workers concorrentes reivindicam lotes com lock;
5. o worker relê a fonte atual, compara a versão e aplica a allowlist;
6. chunks novos são substituídos atomicamente;
7. erros voltam para retry sem reativar conteúdo antigo.

## Por que ainda está bloqueado

Em `ai-capability-readiness.ts`, a busca vetorial possui:

- `IMPLEMENTATION_READY=true`;
- `INVALIDATION_READY=true`;
- `PROVIDER_APPROVED=false`;
- `PRIVACY_APPROVED=false`;
- `SAFETY_EVALUATED=false`.

Mesmo com `FF_AI_VECTOR_SHADOW=true`, o estado reportado pela API é `BLOCKED`. Nenhuma chamada externa de embedding é realizada.

## Gates restantes

- [ ] selecionar e contratar provedor de embeddings;
- [ ] documentar retenção, uso para treinamento, região e suboperadores;
- [ ] concluir RIPD e base legal para o corpus permitido;
- [ ] implementar o adapter do provedor aprovado;
- [ ] criar pelo menos 30 casos sintéticos rotulados;
- [ ] medir recall@k, groundedness, latência e custo;
- [ ] comprovar zero vazamento cross-tenant/pessoa/domínio;
- [ ] executar shadow em tenant interno;
- [ ] aprovar limiar de similaridade e política de rollback;
- [ ] somente depois avaliar índice HNSW com dimensão fixa.

### Evidência local concluída

- [x] PostgreSQL 16.15 com pgvector 0.8.6 instalado;
- [x] 46 migrations aplicadas do zero;
- [x] testes reais de RLS e isolamento cross-tenant/pessoa/domínio aprovados;
- [x] invalidação durante alteração, exclusão de pessoa e cascade de tenant validada;
- [x] build completo do monorepo aprovado.

Essas evidências fecham a validação técnica local, mas o item de isolamento acima permanece aberto para o corpus e o provedor reais em staging.

## Operação local

O banco usado para migrations deve conter pgvector. A CI usa `pgvector/pgvector:pg16`. Para desenvolvimento local, use uma imagem PostgreSQL compatível com pgvector antes de executar:

```bash
pnpm --filter @family-app/database migrate
pnpm --filter @family-app/database test
```

## Próximo incremento da Fase 1

Após a escolha do provedor, criar o adapter `EmbeddingProvider`, executar backfill em staging, gerar o relatório de avaliações e então liberar apenas `FF_AI_VECTOR_SHADOW`. Os resultados vetoriais continuarão sem influenciar a resposta ao usuário até aprovação explícita do gate de segurança.
