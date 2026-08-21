# Relatório de Entrega — Adendo "Rede Ampliada de Responsabilidade Familiar"

Data: 2026-08-20. Escopo: o adendo completo ao Prompt Mestre V2 (36 seções — Extended Care
Network, ResponsibilityAssignment, delegação, Caregiver Pool, disponibilidade e recorrência).
Ver `docs/delivery/gap-analysis-extended-care-network.md` para o mapeamento seção a seção.

## 1. IMPLEMENTADO

- **ResponsibilityAssignment completo** (§3-4, §14-17, §20): máquina de estados
  PROPOSED→SENT→VIEWED→ACCEPTED/DECLINED/EXPIRED/CANCELLED→ACTIVE→COMPLETED/FAILED. Aceitação
  nunca é implícita. ACCOUNTABLE (quem continua responsável por garantir que aconteça) nunca
  muda ao longo de uma cadeia de delegação; RESPONSIBLE (`assignedToPersonId`) é quem executa;
  CONSULTED/INFORMED são papéis informativos que não concedem acesso.
- **Bundle de permissão mínimo por tipo** (§7-8): função pura e determinística
  (`RESPONSIBILITY_PERMISSION_BUNDLES`) — uma responsabilidade de busca/transporte nunca abre
  HEALTH, DOCUMENTS ou FINANCE. Minted como `AuthorityGrant`s explícitos, escopados
  (`valid_from`/`valid_until` = janela da responsabilidade) **somente na aceitação**, nunca na
  criação/proposta.
- **CareWindow só para cuidado genuinamente custodial**: apenas `OVERNIGHT_CARE` e
  `TEMPORARY_CARE` mintam uma `CareWindow` além do bundle — decisão de segurança documentada
  (o baseline de uma CareWindow ativa já concede HEALTH/MEDICATION, o que seria excesso de
  acesso para uma busca escolar).
- **Cadeia de delegação real** (§10-13): Ana → Carlos → Maria com `source_type`/`source_id`
  rastreável; `accountablePersonId` sempre herdado do original, nunca recalculado a partir de
  quem delega. `computeChainDepth` percorre a cadeia real no banco (com proteção contra
  ciclos).
- **DelegationPolicy** (§11-12): `can_delegate`/`can_redelegate`/`max_delegation_depth`, com
  fallback para defaults conservadores por papel (`ROLE_DEFAULT_DELEGATION_POLICY` —
  responsável legal delega e redelega; babá não delega nada). Toda redelegação valida: quem
  delega detém mesmo a responsabilidade (ACCEPTED/ACTIVE), o sujeito não muda, a profundidade
  não excede o limite, e o resultado é auditado — inclusive quando negado
  (`RESPONSIBILITY_DELEGATION_DENIED`).
- **"Você não pode conceder o que não tem" (§8, regra de segurança adicional)**: tanto o
  bundle padrão quanto qualquer `requiredPermissions` explicitamente enviado pelo cliente são
  verificados contra a autoridade real de quem está criando a responsabilidade, via Policy
  Engine — nenhum cliente pode se autoconceder um domínio que não possui.
- **Reaproveitamento do Family Request Engine** (§16): criar uma responsabilidade gera
  automaticamente um `Request` (`type: RESPONSIBILITY_ASSIGNMENT`) — reusa toda a trilha já
  auditada de criação/envio em vez de duplicar lógica.
- **Fallback explícito, nunca automático** (§20-21): `fallback_assignment_id` +
  endpoint `activate-fallback`, que só a pessoa ACCOUNTABLE pode acionar — nenhum timer decide
  sozinho quem substitui quem.
- **Caregiver Pool + Capabilities** (§22-23, §28): `CareNetworkMember` por criança, com
  `capabilities` tratadas como dados/policy (nunca `if role === ...`). Endpoint e página web
  "Quem pode ajudar?".
- **RecurringResponsibility + CaregiverAvailability** (§18-19, §24): estrutura de dados e CRUD
  completos — sem motor de materialização/sugestão automática (não pedido para esta fase; ver
  gap analysis).
- 5 novos tipos de `Relationship` (tio/tia, padrinho/madrinha, pessoa de confiança,
  profissional, motorista autorizado) — parentesco continua puramente descritivo.
- 8 novos tipos de `AuditEvent` para todo o ciclo de vida da responsabilidade.

## 2. ARQUIVOS CRIADOS

- `packages/domain/src/entities/{responsibility,care-network}.ts` + testes
  (`test/responsibility.test.ts`, `test/care-network.test.ts` — 23 testes).
- `apps/api/src/modules/care-network/` (service, controller, module) + `test/care-network.test.ts`
  (6 testes).
- `packages/database/test/rls-v3.integration.test.ts` (6 testes).
- `supabase/migrations/20260820000008` a `...013` (6 migrations novas).
- `apps/web/src/app/app/care-network/page.tsx`.
- `docs/delivery/{gap-analysis-extended-care-network,phase-extended-care-network-report}.md`.

## 3. ARQUIVOS ALTERADOS

- `packages/domain/src/entities/{relationship,request,audit}.ts` (novos tipos), `src/index.ts`
  (barrel).
- `packages/policy-engine/src/role-defaults.ts` (`ROLE_DEFAULT_DELEGATION_POLICY` +
  `getDefaultDelegationPolicy`).
- `apps/api/src/app.module.ts` (`CareNetworkModule` registrado).
- `apps/web/src/components/app-nav.tsx` (link "Rede de Cuidado").
- `ARCHITECTURE.md` (§5b novo), `SECURITY.md` (6 novas linhas de cobertura), `CHANGELOG.md`.

## 4. MIGRATIONS

6 novas migrations, idempotentes via `_schema_migrations`, aplicadas com sucesso em
`family_app_dev` e `family_app_test` locais: `responsibility_assignments`,
`delegation_policies`, `care_network_members`, `recurring_responsibilities`,
`caregiver_availability`, extensão do `relationship_type`, extensão do `event_type` de
`audit_events`, extensão do `type` de `requests`. RLS habilitado e forçado em toda tabela
nova.

## 5. TESTES

35 testes novos nesta fase (109 no total do workspace, todos passando):

| Pacote/arquivo | Testes novos | Cobre |
|---|---|---|
| `packages/domain/test/responsibility.test.ts` | 11 | máquina de estados; bundle nunca inclui HEALTH/DOCUMENTS/FINANCE para PICKUP; só OVERNIGHT/TEMPORARY_CARE elegíveis a CareWindow |
| `packages/domain/test/care-network.test.ts` | 12 | `canDelegateAtDepth` (babá nunca delega; responsável legal delega; limite de profundidade respeitado); `computeDelegationDepth` (incluindo proteção contra ciclo) |
| `apps/api/test/care-network.test.ts` | 6 | babá negada ao redelegar (com auditoria); guardian delega o primeiro salto; "não pode conceder o que não tem"; bundle PICKUP mintado sem CareWindow; OVERNIGHT_CARE minta CareWindow; só o designado aceita |
| `packages/database/test/rls-v3.integration.test.ts` | 6 | isolamento cross-tenant em responsibility_assignments/care_network_members/delegation_policies; IDOR; constraint `ends_at > starts_at` no banco |

## 6. RESULTADO DO BUILD

`pnpm lint` — 28/28 ✅ · `pnpm typecheck` — 28/28 ✅ · `pnpm test` — 28/28 tasks, 109 testes ✅ ·
`pnpm build` — 16/16 ✅. Boot real do `apps/api` compilado (`node dist/main.js`) confirmado
manualmente contra Postgres real: todas as 14 novas rotas de `/care-network/*` aparecem
mapeadas. `apps/web`'s build gerou `/app/care-network` como página estática (2.08 kB). Migrations
aplicadas com sucesso em ambos os bancos locais (dev + test).

## 7. SECURITY CHECK

- Defesa em profundidade mantida: toda tabela nova tem RLS forçado E é checada pelo Policy
  Engine na camada de aplicação.
- Nenhuma responsabilidade concede acesso antes da aceitação explícita — verificado por teste.
- Nenhum tipo "estreito" (PICKUP/TRANSPORT/SCHOOL_SUPPORT/...) minta uma CareWindow ou acesso a
  HEALTH/DOCUMENTS/FINANCE — verificado por teste.
- Redelegação sempre passa por `DelegationPolicy` + profundidade — negação também gera
  `AuditEvent` (`RESPONSIBILITY_DELEGATION_DENIED`), não apenas o caso de sucesso.
- Nenhum cliente pode se autoconceder um domínio/ação que não possui, nem via bundle padrão
  nem via `requiredPermissions` explícito — checado contra a autoridade real do ator.
- Nenhuma comparação hardcoded de papel introduzida (regra de lint do CI continua ativa e
  verde).

## 8. PENDÊNCIAS EXTERNAS

Sem mudança em relação aos relatórios anteriores — ainda dependem de você: projeto Supabase
real, contas de loja/publicação. Nenhuma pendência nova introduzida por este adendo.

## 9. PRÓXIMA FASE

Como documentado em `gap-analysis-extended-care-network.md`: motor de recorrência real
(materializar `RecurringResponsibility`), escalonamento com alertas/timers (depende de um
sistema de notificações ainda não construído), sugestão inteligente de cuidador por
disponibilidade/proximidade/histórico (Family Copilot / Fase 9, já classificada como P1),
minimização de campo dentro do mesmo domínio de permissão. Nenhum desses itens foi escondido —
todos estão listados como P1 explícito, não como "concluído".
