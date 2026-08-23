# Validação local das fases 1–4 da IA

**Data:** 22 de agosto de 2026
**Ambiente:** PostgreSQL 16.15 + pgvector 0.8.6, Windows, porta local 55432.

## Resultado

- 46 migrations aplicadas do zero em `zelii_dev` e `zelii_test`;
- seed fictício Família Silva carregado em `zelii_dev`;
- 47 testes de integração PostgreSQL/RLS aprovados;
- 354 testes aprovados na suíte completa do monorepo;
- 28 tarefas de teste concluídas sem falha;
- build completo aprovado: 16 de 16 pacotes, incluindo API, web e export mobile;
- `zelii_test` permanece descartável e sem seed.

## Defeitos encontrados pela execução real

1. A constraint que compara dimensão declarada e dimensão do vetor colidia com o nome automático da constraint da coluna. O nome explícito foi corrigido.
2. A exclusão em cascade de um tenant fazia triggers tentarem inserir eventos de invalidação para um tenant já removido. A migration 36 agora evita o evento durante o cascade e preserva invalidações normais.
3. O seed ainda escrevia na tabela removida `public.users`. Ele foi migrado para `accounts` e `account_memberships`.

## Evidências das fases

| Fase        | Evidência local                                                                      | Resultado                     |
| ----------- | ------------------------------------------------------------------------------------ | ----------------------------- |
| 1 — vetores | pgvector, migrations, outbox, RLS, versionamento e cascade                           | Aprovado localmente           |
| 2 — cache   | armazenamento service-only, invalidação por fonte e isolamento                       | Aprovado localmente           |
| 3 — MCP     | allowlist, schemas de argumentos, autorização anterior à chamada e bloqueio por gate | Aprovado sem conector externo |
| 4 — agente  | orçamento, bloqueio de expansão de escopo e proposta sem escrita                     | Aprovado sem planner externo  |

## O que esta validação não autoriza

O resultado local comprova implementação e invalidação, mas não substitui RIPD, aprovação de fornecedor, red team, avaliação com corpus representativo ou canário. Os gates `PROVIDER_APPROVED`, `PRIVACY_APPROVED` e `SAFETY_EVALUATED` continuam fechados.

## Operação

```powershell
.\scripts\start-portable-postgres.ps1
.\scripts\test-portable-database.ps1
.\scripts\stop-portable-postgres.ps1
```

```text
DATABASE_URL=postgresql://postgres@127.0.0.1:55432/zelii_dev
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/zelii_test
```
