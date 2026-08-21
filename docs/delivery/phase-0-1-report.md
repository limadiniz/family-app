# Relatório de Entrega — Fase 0 (Foundation) + Fase 1 (Family Core)

Data: 2026-08-20
Escopo: comando de início (§130) — monorepo, ARCHITECTURE.md, Web/Mobile/API configurados, Supabase +
migrations, Person/User/FamilyUnit/FamilyMembership/Relationship, primeiro Family Policy Engine, autenticação,
onboarding, testes de isolamento, projeto rodando, todos os erros encontrados corrigidos.

## 1. IMPLEMENTADO

- Monorepo pnpm + Turborepo (`apps/{web,api,mobile}`, 12 pacotes em `packages/*`), TypeScript estrito em todo
  o workspace (`noUncheckedIndexedAccess`, `noImplicitOverride`, `strict`).
- Modelo de dados Person-centric (Family Care Graph): `Person` existe independente de `User`; `FamilyUnit` é
  N:N via `FamilyMembership` (nunca `person.family_id`); `Residence`/`ResidenceMembership` nunca concedem
  autoridade automaticamente; `Relationship`, `AuthorityGrant`, `CareSchedule`/`CareWindow`/`Handoff` (com
  máquina de estados EXPECTED→CONFIRMED→COMPLETED, DELAYED, CANCELLED, DISPUTED) implementados e testados.
- Banco: 10 migrations Postgres/Supabase-shape com RLS habilitado e forçado em toda tabela sensível,
  `SECURITY DEFINER` para `app.current_tenant_id()`/`app.current_person_id()`/`app.create_tenant_and_owner`,
  `audit_events` imutável por omissão de política de UPDATE/DELETE.
- Family Policy Engine (`packages/policy-engine`) — função pura `authorize(actor, action, resource, subject,
  context) → ALLOW | DENY | REQUIRE_CONFIRMATION`, com precedência: cross-tenant deny → self-access → grant
  explícito (com downgrade automático para REQUIRE_CONFIRMATION em ações sensíveis) → papel padrão → janela
  de cuidado ativa → deny padrão. Nenhum `if role === 'mãe'` em lugar nenhum fora do próprio pacote (regra
  de lint customizada que falha o build se isso acontecer).
- API NestJS com camadas Controller → Service → BusinessRules → PolicyEngine → Repository; `AuthGuard`
  resolvendo identidade via introspecção Supabase (`/auth/v1/user`); `PolicyService`/`AuditService` globais;
  filtro de exceção HTTP com mensagens em pt-BR e `correlationId`.
- Onboarding: endpoint que cria Tenant + Person + User atomicamente (RPC `SECURITY DEFINER`), fluxo web em 3
  passos (unidade familiar → dependente → residência).
- Web (Next.js App Router + Tailwind): páginas públicas de marketing, login/cadastro via Supabase Auth,
  shell autenticado com navegação (Hoje/Família/Filhos/Agenda/Tarefas/Saúde/Documentos/Assistente/
  Configurações), páginas "Hoje"/Família/Filhos ligadas à API real, páginas de fases futuras como roadmap
  explícito (não "TODO" morto).
- Mobile (Expo + Expo Router): mesmo domínio de autenticação, telas Hoje/Filhos/Família/Agenda/Assistente,
  preparado para EAS Build/Submit (iOS + Android, não é PWA).
- AI Gateway (`packages/ai`): toda pergunta passa por resolução de intenção → autorização por domínio via
  Policy Engine ANTES de qualquer recuperação de dado → só then retrieval escopado → resposta citando fontes
  → auditoria obrigatória em toda chamada, inclusive nas negadas. Mobile/Web nunca falam direto com um LLM.
- Seed fictício "Família Silva" (8 pessoas, 2 unidades familiares, 2 residências, guarda compartilhada,
  1 grant de autoridade, 1 janela de cuidado ativa) — dado nenhum real usado.
- Documentação completa: README, ARCHITECTURE, DATABASE, SECURITY, PRIVACY (rascunho técnico LGPD),
  AI_ARCHITECTURE, DEPLOYMENT, RUNBOOK, CONTRIBUTING, 8 ADRs, checklists de contas externas
  (infra/App Store/Google Play), OpenAPI em `/api/v1/docs`.
- CI (GitHub Actions): Postgres em container → migrate → lint → typecheck → test → build → grep anti-hardcode
  de papel.

## 2. ARQUIVOS CRIADOS / ALTERADOS

299 arquivos versionados no commit inicial (`git log` — commit `8395718`). Destaques por área:

- `packages/domain` — 11 arquivos de schema Zod (`tenant`, `person`, `user`, `family-unit`, `relationship`,
  `residence`, `role-permission`, `authority-grant`, `care`, `audit`, `invitation`, `product-stubs`) + 3
  arquivos de teste.
- `packages/policy-engine` — `types.ts`, `role-defaults.ts`, `permission-presets.ts`, `policy-engine.ts` + 2
  arquivos de teste (16 testes, incluindo os 11 cenários de isolamento do §89/§135).
- `packages/database` — 10 migrations em `supabase/migrations/`, shim de desenvolvimento local, seed
  `familia-silva.sql`, scripts `migrate.ts`/`seed.ts`, teste de integração RLS (6 testes contra Postgres
  real).
- `packages/{business-rules,auth,ai,notifications,observability,config,types,ui,validation}` — pacotes
  completos com testes próprios.
- `apps/api` — módulos `common` (Supabase/Auth/Policy/Audit), `onboarding`, `family`, `health`; teste e2e.
- `apps/web` — 22 rotas (marketing público + área autenticada + onboarding).
- `apps/mobile` — app Expo Router completo, `metro.config.js`, `eas.json`, `app.json`.
- `docs/adr/0001` a `0008`, `docs/checklists/*`, README/ARCHITECTURE/DATABASE/SECURITY/PRIVACY/
  AI_ARCHITECTURE/DEPLOYMENT/RUNBOOK/CONTRIBUTING.
- `.github/workflows/ci.yml`, `.eslintrc.json`, `turbo.json`, `tsconfig.base.json`, `.env.example`,
  `.npmrc` (novo — ver §4).

## 3. MIGRATIONS

10 migrations aplicadas em ordem, idempotentes via banco recriado (`family_app_dev`, `family_app_test`):
extensões/helpers → tenants → persons → users (+RPC de onboarding) → family core → residences →
authority/care → invitations → audit_events → grants de tabela. RLS habilitado e **forçado**
(`force row level security`) em toda tabela com dado de família.

## 4. CORREÇÕES REALIZADAS NESTA SESSÃO (build de produção)

O `pnpm build` já estava verde na sessão anterior, mas o build **compilado** nunca tinha sido executado de
verdade (`node dist/main.js`, o que roda em produção). Ao testar isso agora, três problemas reais de
produção apareceram e foram corrigidos (documentados em ADR-0008):

1. Metro (bundler do Expo) não resolvia dependências transitivas sob o layout padrão (symlinked) do pnpm.
   Correção: `.npmrc` com `node-linker=hoisted` (recomendação oficial do Expo para monorepos pnpm).
2. Sob layout hoisted, `apps/web` (React 18.3.x) e `apps/mobile` (React 18.2.0 exato, exigido pelo React
   Native 0.74.5) colidiam em uma única cópia física de `react`/`react-dom`, quebrando o SSR do Next
   (`useRef` de instância nula). Correção: `pnpm.overrides` fixando `react`/`react-dom` em `18.2.0` em todo
   o workspace (compatível com o peer range do Next 14).
3. Os pacotes internos (`packages/*`) apontavam `main`/`types` para `src/index.ts` e eram compilados com as
   configurações de bundler do `tsconfig.base.json` (`module: ESNext`, `moduleResolution: Bundler`) — isso
   nunca quebrava em testes/typecheck (que leem TS direto), mas quebrava a **execução real** do `apps/api`
   compilado, que faz `require()` CommonJS. Correção: `main`/`types` apontando para `dist/`, e cada pacote
   compilando para CommonJS de verdade.

Após as correções: `apps/api` compilado (`node dist/main.js`) sobe contra Postgres real, `/health` responde
200, `/api/v1/persons` sem token responde 401 com mensagem em pt-BR. `apps/web` compilado (`next start`) sobe
e serve `/` e `/entrar` com 200. Ambos os processos foram encerrados ao final do teste.

## 5. TESTES

60 testes automatizados, todos passando (`pnpm test`, 26/26 tasks):

| Pacote | Testes | Cobre |
|---|---|---|
| domain | 11 | idade/tipo de pessoa, grant ativo, máquina de estados de handoff |
| policy-engine | 16 | isolamento cross-tenant, babá sem financeiro/saúde, expiração de CareWindow, adolescente não se auto-escala, IDOR, AI Gateway allow/deny, confirmação de ação sensível |
| database | 6 | RLS: leitura cross-tenant vazia, INSERT cross-tenant rejeitado, audit_events sem UPDATE/DELETE, sessão anônima vê 0 linhas |
| business-rules | 4 | invariantes de família (owner único, sem papel ativo duplicado) |
| ai | 3 | AI Gateway nunca retrieve sem ALLOW prévio |
| auth | 2 | introspecção de JWT |
| config | 5 | env obrigatório, feature flags |
| notifications | 4 | preferências de entrega por nível/horário |
| observability | 2 | redação de dados sensíveis em log |
| validation | 4 | formatos BR (CEP, telefone, moeda, data) |
| api (e2e) | 3 | health público, `/persons` e onboarding exigem sessão |

## 6. RESULTADO DO BUILD

`pnpm lint` — 26/26 ✅ · `pnpm typecheck` — 26/26 ✅ · `pnpm test` — 26/26 (60 testes) ✅ ·
`pnpm build` — 15/15 ✅ (build limpo, sem cache, confirmado duas vezes após as correções da seção 4).
Boot real do `apps/api` e `apps/web` compilados confirmado manualmente contra Postgres real.

## 7. SECURITY CHECK

- Defesa em profundidade confirmada por teste: RLS barra cross-tenant no banco (6 testes) **e** o Policy
  Engine barra fora do escopo dentro do mesmo tenant (16 testes) — nenhuma das duas camadas depende
  exclusivamente da outra.
- Nenhuma comparação hardcoded de papel fora de `packages/policy-engine`/`packages/business-rules` (regra de
  lint ativa no CI).
- `service_role` do Supabase usado apenas em `apps/api`, nunca exposto a `apps/web`/`apps/mobile`.
- CPF não é chave estrutural em nenhuma entidade de criança/responsável.
- `audit_events` sem política de UPDATE/DELETE (imutabilidade por omissão).
- Endpoint sem token retorna 401 com mensagem humana, sem vazar detalhe de stack/infra.

## 8. PENDÊNCIAS EXTERNAS (fora do que a IA pode fazer)

Checklists completos em `docs/checklists/`. Resumo do que só você pode fazer:

- Criar o projeto Supabase real (um por ambiente: dev/staging/prod) e preencher `SUPABASE_URL`/
  `SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` em `.env` — hoje só há placeholders.
- Conta Expo/EAS, Apple Developer, App Store Connect, Google Play Console — necessários só a partir da Fase
  8 (publicação), mas os checklists já estão prontos.
- Conta Vercel (ou outro host) para deploy de `apps/web`/`apps/api`.
- Provedor de e-mail/push/IA (placeholders documentados em `.env.example`, nenhuma chave inventada).
- Domínio e DNS.

## 9. PRÓXIMA FASE

Fase 2 (Daily Life) — módulo "Hoje" real com dados persistidos (Task/CalendarEvent), notificações
CRITICAL/IMPORTANT/INFORMATIONAL com push Expo. Aguardando seu sinal para começar; nenhuma decisão de escopo
foi tomada sem necessidade — pacotes/`product-stubs.ts` já modelam as entidades da Fase 2+ como preparação.

## 10. ENTREGA DO PROJETO

O projeto completo (código-fonte versionado, 299 arquivos) foi salvo como `family-app.zip` na sua pasta
"Family App" na área de trabalho — basta extrair. `node_modules`, artefatos de build e segredos não estão no
zip (git-ignorados por padrão).
