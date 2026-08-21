# Gap Analysis — Adendo "Rede Ampliada de Responsabilidade Familiar"

Data: 2026-08-20. Este adendo estende o Prompt Mestre V2 com um modelo explícito de
**Extended Care Network**: parentesco não concede responsabilidade automaticamente;
responsabilidades são atribuídas, aceitas, e concedem apenas o acesso mínimo necessário
pelo tempo necessário (§32, JIT + Just-Enough-Access). Este documento mapeia as 36 seções
do adendo para o que foi implementado nesta sessão (P0) e o que fica documentado como
próxima fase (P1), seguindo o mesmo critério usado no `gap-analysis-v2.md`: nunca ficar
apenas na especificação, mas também nunca fingir que algo que não foi construído existe.

## 1. IMPLEMENTADO NESTA SESSÃO

| # do adendo | Item | Onde |
|---|---|---|
| §1-2 | Extended Care Network — parentesco não é autorização; 5 novos tipos de `Relationship` (tio/tia, padrinho/madrinha, pessoa de confiança, profissional, motorista autorizado) | `packages/domain/src/entities/relationship.ts`, migration `relationship_types_v3` |
| §3 | `ResponsibilityAssignment` — todos os campos mínimos listados | `packages/domain/src/entities/responsibility.ts` |
| §4 | 15 tipos de responsabilidade | mesmo arquivo, `responsibilityTypeSchema` |
| §14-15 | ACCOUNTABLE (nunca muda) x RESPONSIBLE (quem executa) x CONSULTED/INFORMED | campos `accountablePersonId` (imutável na cadeia), `assignedToPersonId`, `consultedPersonIds[]`, `informedPersonIds[]` |
| §7-8 | Bundle de permissão mínimo por tipo de responsabilidade — nunca HEALTH/DOCUMENTS/FINANCE por padrão em responsabilidades de transporte/escola | `RESPONSIBILITY_PERMISSION_BUNDLES` (função pura determinística), aplicada na ativação via `AuthorityGrant`s explícitos e escopados |
| §9 | Responsabilidade temporária com expiração automática | `startsAt`/`endsAt` + `AuthorityGrant.validFrom/validUntil` — expiração é estrutural (checada a cada `authorize()`), não depende de job |
| §10-13 | Cadeia de delegação (Ana→Carlos→Maria), preservando accountable original | `sourceType`/`sourceId` apontando para a assignment-pai; `care-network.service.ts` reconstrói a cadeia e valida profundidade |
| §11-12 | `DelegationPolicy` (can_delegate/can_redelegate/max_delegation_depth) validada via Policy Engine antes de qualquer redelegação | `packages/domain/src/entities/care-network.ts` + `packages/policy-engine/src/role-defaults.ts` (`ROLE_DEFAULT_DELEGATION_POLICY`) |
| §16-17 | Fluxo Proposal→Policy Validation→Request→Accept→Temporary Permission→Active→Notifications→Audit; estados PROPOSED..FAILED | reaproveita o Family Request Engine já existente (cria um `requests` row vinculado); `canTransitionResponsibilityAssignment` |
| §20 | `fallback_assignment_id` | campo na entidade; endpoint explícito `activate-fallback` (nunca automático) |
| §22-23 | Caregiver Pool + Capabilities por criança, tratadas como dados/policy, não `if` hardcoded | `CareNetworkMember` (`packages/domain/src/entities/care-network.ts`) |
| §24 | `CaregiverAvailability` — "preparar estrutura futura" (o próprio adendo já pede só a estrutura) | tabela + entidade, CRUD simples, **sem** algoritmo de sugestão |
| §28 | "Quem pode ajudar?" por criança | `GET /care-network/:subjectPersonId/members` + página web `/app/care-network` |
| §30, §32 | Auditoria da cadeia + Just-in-time/Just-enough-access | todo evento relevante gera `AuditEvent`; nenhuma responsabilidade concede mais do que o bundle do seu tipo |
| §34 | Novas entidades: `ResponsibilityAssignment`, `RecurringResponsibility` (estrutura), `ResponsibilityPermissionBundle` (função pura), `ResponsibilityCapability`/pool, `CaregiverAvailability` (estrutura), `DelegationPolicy` | todas implementadas |
| §35 | Testes: avó aceita e só vê o mínimo; tio não acessa dados médicos; babá não redelega; responsável legal delega; expiração; fallback disponível para seleção manual | domínio + API + RLS |

## 2. DECISÕES DE DESIGN EXPLÍCITAS (ASSUMPTIONS, §128-style)

- **CareWindow só é criado para `OVERNIGHT_CARE`/`TEMPORARY_CARE`.** O baseline de uma
  `CareWindow` ativa (`CARE_WINDOW_BASELINE`, Fase 1) já concede `HEALTH:VIEW` e
  `MEDICATION:VIEW/EDIT` — correto para quem fica com a criança durante a noite, mas
  **excessivo** para quem só busca na escola (violaria §7-8 diretamente). Por isso,
  responsabilidades "estreitas" (PICKUP, DROPOFF, TRANSPORT, SCHOOL_SUPPORT, etc.) mintam
  **apenas** `AuthorityGrant`s explícitos escopados ao bundle do tipo — nunca uma
  CareWindow inteira. Só OVERNIGHT_CARE/TEMPORARY_CARE, que são cuidado custodial de
  fato, criam a CareWindow além do bundle. Documentado em código
  (`care-network.service.ts`) e aqui.
- **`ResponsibilityPermissionBundle` é código, não tabela.** É uma função determinística
  de `responsibilityType`, não uma instância por atribuição — não há hoje necessidade de
  customizar por família. Se um PM precisar disso no futuro, materializar em tabela é uma
  migration aditiva simples, sem quebrar nada.
- **`DelegationPolicy` é por pessoa (global), não por criança.** O adendo lista
  `can_delegate`/`can_redelegate`/`max_delegation_depth` nos exemplos sempre a nível de
  papel/pessoa (responsável legal vs. babá), nunca por criança específica. Manter global
  evita uma segunda tabela de override sem caso de uso real hoje.
- **Escalonamento automático (§21) não foi implementado.** O adendo é explícito: "nunca
  mudar automaticamente de responsável... sem regra previamente autorizada". Implementei
  o endpoint `activate-fallback`, que exige uma chamada explícita da pessoa `ACCOUNTABLE`
  — nenhum timer/cron decide sozinho. Alertas de "Maria ainda não confirmou" (16:30/16:40)
  dependem de um sistema de notificações que ainda não existe no projeto — não simulado.
- **`RecurringResponsibility` é CRUD de estrutura, sem materialização automática.** Criar,
  listar e cancelar um "toda terça, Avó Maria busca Mariana" funciona; gerar
  automaticamente as `ResponsibilityAssignment`s de cada terça-feira e tratar exceções
  (§19) fica para quando o motor de recorrência (RRULE) ganhar um job — mesmo padrão já
  usado para `CareSchedule`/`CareWindow` na Fase 1, que também não materializa sozinha.
- **Sugestão inteligente (§25-27) e ranking por disponibilidade/proximidade/histórico não
  foram implementados.** Isso é literalmente o Family Copilot com Action Layer — já
  classificado como Fase 9/P1 no V2 e reafirmado aqui. `GET /care-network/:id/members`
  retorna os dados brutos (quem está na rede, capacidades, disponibilidade) que uma
  camada de sugestão usaria depois; a IA nunca atribui sozinha (§25) continua garantido
  porque essa camada simplesmente não existe ainda.
- **Minimização de campos dentro do mesmo domínio (§7's "só nome/foto/escola/horário")**
  é garantida no nível de *domínio* (a tia sem bundle de HEALTH não consegue nem chamar o
  endpoint de saúde), mas não no nível de *campo* dentro de `PROFILE` (ex.: hoje
  `PROFILE:VIEW` retorna o registro de pessoa inteiro, não uma projeção mínima
  específica). Marcado como refinamento P1 — não é uma falha de isolamento entre
  domínios sensíveis, é uma granularidade a mais dentro de um domínio já autorizado.

## 3. PENDENTE / PRÓXIMA FASE (P1, não escondido)

- Motor de recorrência real (materializar `RecurringResponsibility` → instâncias, tratar
  exceções, §18-19).
- Escalonamento com alertas/timers (§21) — depende de um sistema de notificações que o
  projeto ainda não tem.
- Sugestão inteligente de cuidador elegível por disponibilidade/proximidade/histórico
  (§25-27) — Family Copilot / Fase 9.
- Minimização de campo dentro do mesmo domínio de permissão (ex.: retornar só
  nome/foto/escola para quem só tem `PROFILE:VIEW` via bundle de PICKUP).
- Testes de integração HTTP ponta-a-ponta do fluxo de aceite (mesma limitação de
  ambiente documentada em `gap-analysis-v2.md`: requer Supabase/PostgREST real).
