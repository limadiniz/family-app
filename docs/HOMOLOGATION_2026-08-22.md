# Homologação ZELII — 22/08/2026

## Resultado executivo

O código atual está aprovado na homologação local. A publicação em staging não foi executada porque a API de
staging e a API de produção apontam para o mesmo projeto Supabase (`family-app-dev`). Nesse estado, aplicar as
migrações de staging também alteraria o banco usado por produção.

Nenhuma migração, segredo, dado ou aplicação externa foi alterado durante esta homologação.

## Evidências aprovadas

- Suíte do monorepo: 28 tarefas concluídas, com 307 testes aprovados.
- Banco PostgreSQL local isolado: 47 testes de integração aprovados, incluindo RLS, convites, agenda de cuidado
  e endurecimento do runtime de IA.
- Build: 16 de 16 pacotes aprovados, incluindo API NestJS, web Next.js e export mobile Expo.
- Formatação dos workflows de deploy e documentação: aprovada pelo Prettier.
- API Fly de staging: `GET /health` respondeu HTTP 200.
- Segurança básica externa: `GET /api/v1/persons` sem token respondeu HTTP 401.

## Bloqueios externos encontrados

1. **Banco compartilhado:** `family-app-api-staging` e `family-app-api-production` usam o mesmo Supabase.
2. **API desatualizada:** o Swagger publicado em staging ainda não contém os endpoints das fases avançadas, como
   `GET /api/v1/ai/capabilities` e a execução do agente supervisionado.
3. **Frontend protegido:** o endereço documentado de staging abre a tela `Login – Vercel`, impedindo testes
   públicos e automação E2E sem uma credencial de proteção.
4. **CORS de staging:** o preflight responde, mas não devolve `Access-Control-Allow-Origin` para a origem web de
   staging documentada.
5. **Vercel CLI local:** não há sessão autenticada para consultar ou publicar o projeto web.

## Proteção adicionada ao pipeline

Os workflows de staging e produção agora comparam `SUPABASE_STAGING_PROJECT_REF` e
`SUPABASE_PRODUCTION_PROJECT_REF` antes de qualquer backup, migração ou deploy. O job falha quando uma referência
está ausente ou quando as duas são iguais.

Essa proteção não substitui a separação da infraestrutura; ela impede que uma configuração incorreta volte a
causar escrita acidental entre ambientes.

## Sequência para concluir a homologação externa

1. Criar ou indicar um projeto Supabase exclusivo para staging. O projeto existente `Sem Lero` não deve ser
   reutilizado sem confirmação explícita de que pode ser destinado à ZELII.
2. Configurar `SUPABASE_STAGING_PROJECT_REF` no GitHub e manter a referência de produção distinta.
3. Atualizar em `family-app-api-staging` apenas os segredos `SUPABASE_URL`, `SUPABASE_ANON_KEY` e
   `SUPABASE_SERVICE_ROLE_KEY` do novo staging.
4. Aplicar todas as migrações no Supabase de staging e executar os testes de RLS contra ele.
5. Publicar a API atual no Fly staging e validar `/health`, Swagger, autenticação, convites, memória, cache, MCP e
   agente supervisionado com os gates fechados por padrão.
6. Vincular/autenticar o projeto web na Vercel, configurar variáveis Preview/Staging para o novo Supabase e para
   a API Fly staging, e liberar uma forma controlada de acesso para os testes.
7. Corrigir `CORS_ALLOWED_ORIGINS` da API staging para a origem efetivamente publicada e repetir o preflight.
8. Executar E2E responsivo em web, tablet e mobile para cadastro, convite entre responsáveis, visão familiar,
   edição do próprio nome, agenda compartilhada e Pergunte à ZELII por texto e voz.

## Critério de liberação

Staging só poderá ser considerado homologado externamente quando banco, API e frontend estiverem isolados de
produção e todos os testes acima passarem sem usar dados reais de famílias.
