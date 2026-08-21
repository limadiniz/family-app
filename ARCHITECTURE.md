# ARCHITECTURE.md

## 1. Princípio central: Person, não User+Family

A tentação óbvia — `USER -> FAMILY -> CHILDREN` — quebra no primeiro caso real: pais separados, guarda
compartilhada, madrastas, babás, avós cuidadores. Este projeto usa, desde a primeira migration, o modelo:

```
PERSON
  ├── FamilyMembership[]  (many-to-many com FamilyUnit)
  ├── Relationship[]      (descritivo, nunca autoritativo)
  ├── ResidenceMembership[]
  └── AuthorityGrant[]    (o que realmente concede acesso)
        │
        ▼
FamilyPolicyEngine.authorize(actor, action, domain, subject, context)
        │
        ▼
   ALLOW | DENY | REQUIRE_CONFIRMATION
```

`Person` existe independentemente de login (`User`). Uma criança de 4 anos é um `Person` sem `User`; aos 13
anos ganha um `User` vinculado ao mesmo `Person` — o histórico nunca é recriado. Ver
`packages/domain/src/entities/person.ts` e `user.ts`.

## 2. Camadas (apps/api)

```
Controller
  ↓ (DTO parsing, nunca regra de negócio)
Application Service (ex.: FamilyService)
  ↓
Business Rules (packages/business-rules — invariantes estruturais)
  ↓
Family Policy Engine (packages/policy-engine — quem pode fazer o quê)
  ↓
Repository (Supabase client autenticado como o usuário — RLS se aplica)
```

Nenhuma regra de autorização vive isolada em um controller. Todo acesso sensível passa por
`PolicyService.authorizeOrThrow` (`apps/api/src/common/policy.service.ts`), que é o único ponto de chamada do
`FamilyPolicyEngine` dentro da API.

## 3. Family Care Graph

O grafo de cuidado modela: quem cuida de quem, quando, onde, com qual responsabilidade e com qual autorização.
As entidades relevantes (`CareSchedule`, `CareWindow`, `Handoff`, `AuthorityGrant`) estão implementadas em
`packages/domain` e `supabase/migrations/20260819000007_authority_and_care.sql`. A Fase 3 (Care Network) constrói
a UI e os fluxos de convite/handoff sobre essa base — o schema já existe hoje.

## 4. Defesa em profundidade (por que RLS *e* Policy Engine)

Duas camadas independentes, cada uma cobrindo um risco diferente:

- **RLS (Postgres)** é o limite rígido de **tenant**: garante que uma consulta jamais retorna uma linha de
  outro tenant, mesmo que a API tenha um bug. Cada conta criada (signup) recebe seu próprio `Tenant` — é assim
  que "Família A nunca consulta Família B" (§89) se sustenta mesmo com um erro de programação.
- **Family Policy Engine** é a autorização **fina, dentro do mesmo tenant**: um tenant pode conter mais de uma
  `FamilyUnit` (famílias recompostas compartilhando o mesmo grafo), e é aqui que "babá não acessa financeiro"
  ou "cuidador expirado perde acesso" são decididos — regras que não fazem sentido expressar como uma política
  RLS estática por linha.

Ver [SECURITY.md](./SECURITY.md) para o detalhamento e os testes que provam cada camada.

## 5. Family Policy Engine

`packages/policy-engine` é uma função pura: `authorize(request, PolicyEngineInput) -> ALLOW | DENY |
REQUIRE_CONFIRMATION`. Ela não conhece o banco de dados — `apps/api/src/common/policy.service.ts` é quem
carrega o `PolicyEngineInput` (papéis compartilhados, grants explícitos, CareWindow ativo) e chama a engine.
Isso torna a engine testável sem infraestrutura (`packages/policy-engine/test/isolation.test.ts`) e reutilizável
por qualquer runtime futuro (jobs em background, AI Gateway).

Precedência de decisão (do mais específico ao mais genérico): isolamento de tenant → auto-acesso (adulto sobre
o próprio registro) → `AuthorityGrant` explícito → papel padrão (`ROLE_DEFAULT_PERMISSIONS`) → `CareWindow`
ativo → negação padrão.

## 5b. Extended Care Network

Adendo ao V2 (`docs/delivery/gap-analysis-extended-care-network.md`): parentesco nunca concede
responsabilidade (`Relationship` continua puramente descritivo). O pipeline real é:

```
Family Care Graph -> Eligible Care Network (CareNetworkMember, por criança)
        │
        ▼
ResponsibilityAssignment (ACCOUNTABLE nunca muda; RESPONSIBLE é quem executa)
        │
        ▼
Request/Acceptance (reaproveita o Family Request Engine — §5)
        │
        ▼
Temporary Permission Bundle (AuthorityGrant escopado ao tipo, minted só na aceitação)
        │
        ▼
Execution (CareWindow só para OVERNIGHT_CARE/TEMPORARY_CARE) -> Audit
```

Uma responsabilidade de transporte (`PICKUP`, `TRANSPORT`, ...) nunca abre `HEALTH`,
`DOCUMENTS` ou `FINANCE` — o bundle por tipo é uma função pura e determinística
(`packages/domain/src/entities/responsibility.ts`). Redelegação (Ana → Carlos → Maria) passa
por checagem de profundidade + `DelegationPolicy`, nunca "quem recebe pode repassar para
qualquer um". Ver `apps/api/src/modules/care-network`.

## 6. AI Gateway

Ver [AI_ARCHITECTURE.md](./AI_ARCHITECTURE.md). Regra estrutural: é impossível, pela forma como
`packages/ai/src/ai-gateway.ts` está escrito, recuperar um fato sem que `FamilyPolicyEngine.authorize()` tenha
retornado `ALLOW` para aquele domínio/assunto específico primeiro.

## 7. Fases

Numeração atualizada para acompanhar o Prompt Mestre V2 (`docs/delivery/gap-analysis-v2.md` documenta o
mapeamento completo com o plano original de 8 fases).

| Fase (V2) | Escopo | Status neste commit |
|---|---|---|
| 0 — Foundation | Monorepo, CI, Supabase, migrations, auth, observability | ✅ |
| 1 — Family Core | Person, FamilyUnit, Relationship, Residence, Policy Engine, onboarding | ✅ |
| 2 — Policy Engine (RBAC/ABAC/RLS) | Domínios/ações, CareWindow baseline, defesa em profundidade | ✅ (herdado da Fase 1, estendido) |
| 3 — Command Center | CalendarEvent, Task, Routine/RoutineItem, Checklist, agregação "Hoje" | ✅ (P0) |
| 4 — Universal Family Inbox + Capture Engine | CaptureItem + pipeline plugável | ✅ (P0) — classificador heurístico, sem provedor de IA/OCR real conectado |
| 5 — CareSchedule + CareWindow + Handoff | Múltiplas residências, cuidador temporário | ✅ (herdado da Fase 1) |
| 6 — Family Request Engine + histórico imutável | Request/RequestAction, trilha append-only | ✅ (P0) |
| 7 — Health + Medication + Emergency Profile | HealthProfile, Medication*, EmergencyProfile | ✅ (P0) |
| 8 — School Intelligence | Escola, provas, comunicados | Pendente (P1 explícito no V2) |
| 9 — Family Copilot + RAG + Action Layer | Context Engine completo, respostas com fontes, ações via Request Engine | AI Gateway (estrutura + guardrails) pronto; RAG real e Action Layer pendentes (P1) |
| 10 — Production Hardening | Segurança, carga, backup, privacidade | Parcial (ver SECURITY.md) |
| 11 — Publication | Lojas, domínios, produção | Checklists prontos, ações humanas pendentes |

## 8. Decisões registradas

Ver [docs/adr/](./docs/adr/) para o raciocínio completo por trás de: stack, multitenancy, RLS + Policy Engine,
armazenamento de migrations, AI Gateway, feature flags.

## 9. ASSUMPTIONS (§128)

Decisões de produto tomadas para não bloquear o desenvolvimento, sinalizadas para revisão de um PM/DPO:

- Matriz de permissões padrão por papel (`packages/policy-engine/src/role-defaults.ts`) é um ponto de partida
  conservador, não uma decisão jurídica final.
- `SHARE` em domínios sensíveis (documentos, saúde, financeiro, localização) sempre exige confirmação explícita
  do usuário, mesmo quando o papel already permite a ação.
- Verificação de JWT em `apps/api` usa introspecção via `/auth/v1/user` (uma chamada de rede por request) em vez
  de verificação local de assinatura — trade-off de simplicidade/segurança documentado em ADR-0007, revisar ao
  escalar.
