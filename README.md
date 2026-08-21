# Family App — Family Intelligence Platform

Um sistema operacional para a vida familiar: agenda, escola, saúde, medicamentos, cuidadores, documentos e um
assistente de IA contextual (Family Copilot), sob um único modelo de dados centrado em **Pessoa** — não em
"usuário + família nuclear". Veja [ARCHITECTURE.md](./ARCHITECTURE.md) para o raciocínio completo.

Este README cobre o estado da **Fase 0 (Foundation) + Fase 1 (Family Core)**. As fases seguintes (Daily Life,
Care Network, Health, School, AI, Hardening, Publication) estão descritas em [ARCHITECTURE.md](./ARCHITECTURE.md#fases).

## Estrutura do monorepo

```
/apps
  /web      Next.js — site público + app autenticado
  /api      NestJS — API REST versionada (/api/v1)
  /mobile   Expo (React Native) — iOS + Android
/packages
  /domain          Entidades + schemas Zod (fonte da verdade de tipos)
  /database        Migrations Supabase (SQL) + seed + client
  /policy-engine   Family Policy Engine (RBAC + ABAC)
  /business-rules  Invariantes estruturais do grafo familiar
  /ai              AI Gateway (retrieval com escopo de permissão)
  /auth            Verificação de sessão Supabase (server-side)
  /notifications   Abstração de push/e-mail + preferências
  /ui              Design tokens compartilhados (web + mobile)
  /validation      Formatos brasileiros (CEP, telefone, BRL)
  /config          Env validation (Zod) + feature flags
  /types           DTOs de API compartilhados
  /observability   Logger estruturado + redaction
/supabase/migrations  SQL aplicado a todo ambiente (dev/staging/prod)
/docs/adr             Decisões de arquitetura registradas
```

## Pré-requisitos

- Node.js 20+, pnpm 10+ (`corepack enable` já resolve a versão pinada em `package.json`)
- Um Postgres acessível para desenvolvimento local (ou um projeto Supabase — veja abaixo)
- Para o mobile: Expo Go no celular, ou Xcode/Android Studio para simuladores

## Primeiro resultado esperado (rodando localmente)

```bash
pnpm install
cp .env.example apps/api/.env.local   # preencha SUPABASE_* — veja abaixo
cp .env.example apps/web/.env.local
cp .env.example apps/mobile/.env

pnpm --filter @family-app/database migrate   # aplica supabase/migrations/*.sql
pnpm --filter @family-app/database seed      # popula a Família Silva fictícia

pnpm dev            # roda web (:3000), api (:4000) e mobile (Expo) em paralelo
```

### Banco de dados: local vs. Supabase hospedado

Você tem duas opções, ambas usando os mesmos arquivos em `supabase/migrations/`:

1. **Postgres local (mais rápido para desenvolver o backend/policy engine).**
   Aponte `DATABASE_URL` para qualquer Postgres 14+ vazio. `pnpm --filter @family-app/database migrate`
   detecta que não é um host `*.supabase.co` e aplica automaticamente um shim de compatibilidade
   (`packages/database/local-dev/00_dev_shim.sql`) que recria `auth.uid()` e os roles
   `anon`/`authenticated`/`service_role` — o suficiente para os testes de RLS rodarem sem um projeto
   Supabase real. Auth (login/signup) **não** funciona nesse modo — só o banco.

2. **Projeto Supabase real (necessário para autenticação, storage e para os apps web/mobile funcionarem
   de ponta a ponta).** Crie um projeto em https://supabase.com (ação humana — veja
   `docs/checklists/infra-checklist.md`), rode `supabase link` e `supabase db push`, e preencha
   `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` nos `.env.local`.

## Segundo resultado esperado (fluxo de produto)

Com a API e o web rodando e um projeto Supabase configurado:

1. Acesse `/cadastro`, crie uma conta — isso roda `auth.signUp` (Supabase Auth) e depois
   `POST /api/v1/onboarding/bootstrap`, que cria Tenant + Person + User atomicamente.
2. Você é levado a `/app/onboarding`: cria a unidade familiar, adiciona o primeiro dependente, define a
   primeira residência.
3. Em `/app/today` você já vê os membros da sua família (a agenda do dia chega na Fase 2).
4. Crie uma segunda conta (outro e-mail) e confirme que ela **não** enxerga nada da primeira — isolamento por
   tenant, reforçado por RLS (veja `packages/database/test/rls.integration.test.ts` e
   `packages/policy-engine/test/isolation.test.ts`).

## Comandos úteis

```bash
pnpm lint            # eslint em todos os pacotes
pnpm typecheck        # tsc --noEmit em todos os pacotes
pnpm test             # vitest em todos os pacotes (inclui isolamento de segurança)
pnpm build            # build de produção de todos os apps/pacotes
```

## Documentação

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Family Care Graph, camadas, decisões estruturais
- [DATABASE.md](./DATABASE.md) — schema, RLS, estratégia de migrations
- [SECURITY.md](./SECURITY.md) — modelo de ameaças, defesa em profundidade, checklist
- [PRIVACY.md](./PRIVACY.md) — LGPD, minimização, direitos dos titulares
- [AI_ARCHITECTURE.md](./AI_ARCHITECTURE.md) — AI Gateway, RAG com escopo de permissão
- [DEPLOYMENT.md](./DEPLOYMENT.md) — ambientes, CI/CD, publicação nas lojas
- [RUNBOOK.md](./RUNBOOK.md) — operação, incidentes, acesso de suporte
- [CONTRIBUTING.md](./CONTRIBUTING.md) — convenções de código e PR
- [docs/adr/](./docs/adr/) — decisões de arquitetura registradas
- [docs/checklists/](./docs/checklists/) — pendências que exigem uma pessoa humana (contas, domínio, lojas)
