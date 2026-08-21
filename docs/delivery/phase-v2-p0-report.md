# Relatório de Entrega — Prompt Mestre V2, escopo P0

Data: 2026-08-20
Escopo executado nesta sessão: Fases 2-3-4-6-7 do V2 (Policy Engine estendido, Command Center, Universal
Family Inbox + Capture Engine, Family Request Engine, Health Core + Emergency Profile) — o conjunto que o
próprio Prompt Mestre V2 classifica como P0. Ver `docs/delivery/gap-analysis-v2.md` para a análise completa
de gaps e `ARCHITECTURE.md` §7 para o mapeamento de fases atualizado.

## 1. IMPLEMENTADO

- **Family Command Center** (§24-29): `CalendarEvent`, `Task`, `Routine`/`RoutineItem`,
  `Checklist`/`ChecklistItem` — entidades reais, migrations, RLS, API completa e agregação `GET /today` (
  agenda + tarefas + rotinas de uma pessoa em um dia). Completar um item de rotina é uma ação escopada a
  `SCHEDULE:EDIT` sobre aquele item — nunca `MANAGE`/`ADMIN` — para que uma criança concluindo sua rotina
  nunca ganhe capacidade administrativa (§29).
- **Universal Family Inbox + Capture Engine** (§13-23): novo pacote `packages/capture-engine` com pipeline
  plugável (`ClassifierFn`/`ExtractorFn`) e uma implementação heurística determinística hoje (sem provedor de
  IA/OCR configurado — ver ASSUMPTION abaixo). `CaptureItem` segue uma máquina de estados
  (RECEIVED→PROCESSING→NEEDS_REVIEW/READY→CONFIRMED/REJECTED/FAILED→ARCHIVED) e **nada é persistido como
  evento/tarefa real sem confirmação humana explícita** — isso é estrutural: `CaptureService.confirmProposal`
  é o único código autorizado a escrever em `calendar_events`/`tasks` a partir de uma captura, e exige tanto
  uma proposta em estado confirmável quanto autorização do Policy Engine para o domínio de destino.
- **Family Request Engine** (§30-37): `Request`/`RequestAction` com máquina de estados
  (DRAFT→SENT→VIEWED→ACCEPTED/DECLINED→...→DISPUTED/COMPLETED). A responsabilidade original nunca muda até
  aceite explícito; `request_actions` é uma trilha append-only (sem política de UPDATE/DELETE, mesmo padrão
  de `audit_events`). Disputar uma solicitação preserva o estado anterior em vez de apagá-lo (§37).
- **Health Core + Emergency Profile** (§41-44, §55-58): `Medication`, `Prescription`, `MedicationSchedule`,
  `MedicationAdministration`, `EmergencyProfile`. O endpoint de emergência é o único do sistema onde uma
  **negação também gera AuditEvent** — todo acesso, permitido ou negado, fica registrado (§43).
- `documents`/`extracted_document_data` promovidos de stub de planejamento para tabela real.
- Runner de migrations agora idempotente (`public._schema_migrations`), corrigindo um problema real que
  impedia re-rodar `pnpm db:migrate` em uma sessão já migrada.
- 8 novos tipos de `AuditEvent` para os eventos desta fase.

### ASSUMPTION documentada — Capture Engine sem provedor de IA real

Nenhuma chave de provedor de IA/OCR/Speech-to-Text está configurada neste ambiente (`.env.example` mantém
`AI_PROVIDER_API_KEY` vazio — nenhum segredo foi inventado, por regra explícita do projeto). Para que a
Universal Family Inbox fosse real e testável hoje, `packages/capture-engine` usa um classificador
heurístico (palavras-chave + regex de data/hora para texto) em vez de bloquear a fase inteira esperando uma
credencial externa. A interface (`ClassifierFn`/`ExtractorFn`) já está pronta para receber um provedor real
sem mudar nenhum ponto de chamada em `apps/api`. Fotos/PDF/áudio hoje caem em `NEEDS_REVIEW` para
preenchimento manual, já que não há OCR/Speech-to-Text real conectado.

## 2. ARQUIVOS CRIADOS

- `packages/domain/src/entities/{routine,capture,request,health-core}.ts` + testes correspondentes.
- `packages/capture-engine/` (pacote novo completo: types, heuristics, pipeline, testes).
- `supabase/migrations/20260820000001` a `...007` (7 migrations novas).
- `apps/api/src/modules/{command-center,capture,requests,wellbeing}/` (4 módulos novos completos).
- `apps/api/test/wellbeing.emergency-audit.test.ts`.
- `packages/database/test/rls-v2.integration.test.ts`.
- `apps/web/src/app/app/{capture,requests,emergency}/page.tsx`.
- `apps/mobile/app/(tabs)/emergency.tsx`.
- `docs/adr/0008-pnpm-hoisted-linker-and-commonjs-package-builds.md`.
- `docs/delivery/{gap-analysis-v2,phase-v2-p0-report}.md`, `CHANGELOG.md`, `.npmrc`.

## 3. ARQUIVOS ALTERADOS

- `packages/domain/src/entities/product-stubs.ts` (docstring — stubs promovidos a reais), `.../audit.ts` (8
  novos tipos de evento), `src/index.ts` (barrel).
- `apps/api/src/app.module.ts` (4 módulos novos registrados), `.../onboarding/onboarding.service.ts`
  (`status()` agora retorna `personId`/`tenantId`).
- `apps/web/src/components/app-nav.tsx`, `.../app/today/page.tsx` (Hoje real), `.../app/tasks/page.tsx`
  (Tarefas real).
- `apps/mobile/app/(tabs)/_layout.tsx` (aba Emergência).
- `ARCHITECTURE.md` (tabela de fases realinhada ao V2), `SECURITY.md` (tabela de cobertura de testes).
- Todos os `package.json`/`pnpm-lock.yaml` do workspace (2 pacotes novos: `capture-engine`,
  `@family-app/capture-engine` como dependência de `apps/api`).

## 4. MIGRATIONS

7 novas migrations aplicadas em ordem, idempotentes via `public._schema_migrations` (corrigido nesta sessão
— ver ADR/CHANGELOG): Command Center (6 tabelas) → Capture (4 tabelas) → Requests (2 tabelas, uma
append-only) → Health Core (6 tabelas) → Documents (2 tabelas) → extensão do `event_type` de
`audit_events`. RLS habilitado e forçado em toda tabela nova, seguindo exatamente o padrão da Fase 0/1.

## 5. TESTES

84 testes automatizados no total (`pnpm test`, 28/28 tasks), incluindo os novos desta fase:

| Pacote/arquivo | Testes novos | Cobre |
|---|---|---|
| `packages/domain/test/capture.test.ts` | 5 | máquina de estados de captura — nunca pula direto para CONFIRMED |
| `packages/domain/test/request.test.ts` | 5 | máquina de estados de solicitação — nunca pula DRAFT→ACCEPTED |
| `packages/capture-engine/test/pipeline.test.ts` | 6 | extração heurística real (§78), nunca confiança ≥1.0, nunca CONFIRMED direto |
| `packages/database/test/rls-v2.integration.test.ts` | 6 | isolamento cross-tenant em emergency_profiles/requests/capture_items, imutabilidade de request_actions |
| `apps/api/test/wellbeing.emergency-audit.test.ts` | 2 | acesso de emergência sempre auditado — no ALLOW e no DENY |

## 6. RESULTADO DO BUILD

`pnpm lint` — 28/28 ✅ · `pnpm typecheck` — 28/28 ✅ · `pnpm test` — 28/28 (84 testes) ✅ · `pnpm build` —
16/16 ✅ (build limpo, sem cache). Boot real do `apps/api` compilado (`node dist/main.js`) confirmado
manualmente contra Postgres real: todas as novas rotas (`/today`, `/capture/*`, `/requests/*`,
`/persons/:id/emergency-profile`, etc.) aparecem mapeadas e corretamente exigem autenticação (401 sem
token). `apps/mobile`'s `expo export` confirmado verde com a nova aba de Emergência.

## 7. SECURITY CHECK

- Defesa em profundidade mantida: toda tabela nova tem RLS forçado E é checada pelo Policy Engine na camada
  de aplicação — nenhuma das duas camadas é a única linha de defesa.
- Nenhuma comparação hardcoded de papel introduzida (regra de lint do CI continua ativa e verde).
- Confirmação de captura exige tanto estado confirmável (`canTransitionCaptureItem`) quanto autorização de
  domínio (`CREATE`/`SCHEDULE` ou `DOCUMENTS`) — dupla checagem antes de qualquer escrita derivada de IA.
- Acesso a `EmergencyProfile` é auditado incondicionalmente (allow e deny), testado explicitamente.
- `request_actions` é insert-only (sem política de UPDATE/DELETE) — verificado por teste de integração real
  contra Postgres, não apenas por convenção.
- Efeito de aceitação de uma `Request` só é aplicado dentro de `RequestsService.accept()`, nunca antes —
  garantido pela máquina de estados do domínio; teste de integração HTTP completo (criar → aceitar →
  verificar efeito) depende de um Supabase/PostgREST real e está documentado como limitação de ambiente, não
  como lacuna de design (ver gap-analysis-v2.md).

## 8. PENDÊNCIAS EXTERNAS

Sem mudança em relação ao relatório da Fase 0/1 — ainda dependem de você: projeto Supabase real (dev/staging/
prod), contas Vercel/Expo/App Store/Google Play (checklists em `docs/checklists/`), e agora também a decisão
de qual provedor de IA/OCR conectar ao Capture Engine quando a Fase 9 (Family Copilot com RAG real) começar.

## 9. PRÓXIMA FASE

Fase 8 (School Intelligence) e Fase 9 (Family Copilot + RAG + Action Layer) — ambas P1 explícito no próprio
V2, portanto deixadas para depois do escopo P0 desta sessão, como o prompt determina. Aguardando seu sinal
para continuar.
