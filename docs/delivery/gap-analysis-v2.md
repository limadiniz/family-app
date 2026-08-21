# Gap Analysis — Prompt Mestre V2 vs. implementação atual (Fase 0 + Fase 1)

## O que já existe e permanece válido (não recriar)

- **Foundation**: monorepo pnpm/Turborepo, Next.js web, Expo mobile, NestJS API — mantidos como estão.
- **Family Care Graph básico**: `Tenant`, `User`, `Person`, `FamilyUnit`, `FamilyMembership`, `Relationship`,
  `Residence`, `ResidenceMembership` — já Person-centric, N:N, sem `person.family_id`. Nenhuma mudança
  estrutural necessária.
- **CareSchedule / CareWindow / Handoff** — já implementados com máquina de estados testada. Cobre boa parte
  da FASE 5 do V2 (múltiplas residências, cuidador temporário). Será estendido (view de calendário
  visual fica para depois), não recriado.
- **Family Policy Engine** (`authorize(actor, action, resource, subject, context) → ALLOW|DENY|
  REQUIRE_CONFIRMATION`) — já implementa RBAC + ABAC (CareWindow), os domínios de permissão do V2
  (PROFILE, SCHEDULE, HEALTH, MEDICATION, VACCINATION, SCHOOL, DOCUMENTS, FINANCE, ACTIVITIES,
  TRANSPORTATION, CONTACTS, NOTES, LOCATION, EMERGENCY, AI, AUDIT) já existem no enum — mantido, apenas
  estendido com os novos recursos (capture, request).
- **RLS + auditoria imutável** — já cobre todas as tabelas existentes; padrão será replicado nas novas
  tabelas, não redesenhado.
- **AuditEvent / AI Gateway skeleton** — mantidos; o Gateway já implementa "autoriza antes de recuperar",
  que é exatamente o `SCOPED RETRIEVAL` do fluxo do Family Copilot (§50) — será estendido na Fase 9 (P1),
  não substituído.

## O que existia como stub e agora é promovido a implementação real (P0 do V2)

- `CalendarEvent`, `Task` — antes só schema Zod não migrado; agora ganham migration, RLS, API, UI.
- `HealthProfile`, `MedicationAdministrationStatus`, `Document`/`ExtractedDocumentData` — idem.

## O que é novo nesta fase (P0 do V2 — implementado nesta sessão)

- **Command Center real** (§24-29): agregação "Hoje" por pessoa/dia (agenda + tarefas + rotinas),
  `Routine`/`RoutineItem`/`Checklist`.
- **Universal Family Inbox + Capture Engine** (§13-23): `CaptureItem` com máquina de estados
  RECEIVED→...→ARCHIVED, `CaptureAttachment`, `CaptureExtraction`, `CaptureProposal`, pipeline com
  classificador plugável. **Limitação assumida e documentada**: sem uma chave de provedor de IA/OCR real
  configurada (nenhuma foi inventada, por regra explícita do projeto), a implementação desta fase usa um
  classificador **heurístico determinístico** (regex de data/hora + palavras-chave) para texto, e marca
  fotos/PDF/áudio como `NEEDS_REVIEW` com preenchimento manual assistido — a interface é desenhada para que
  plugar um provedor real de OCR/Speech-to-Text/LLM no futuro não exija mudança de contrato, só a
  implementação de `ClassifierFn`/`ExtractorFn`. Nada é persistido como fato confirmado sem confirmação
  humana, mesmo no caminho heurístico.
- **Family Request Engine** (§30-37): `Request`/`RequestAction`, máquina de estados
  DRAFT→SENT→VIEWED→ACCEPTED/DECLINED→...→DISPUTED/COMPLETED. Responsabilidade original só muda após
  aceite explícito (nunca silenciosamente).
- **Health Core + Emergency Profile** (§41-44, §55-58): `Medication`, `Prescription`,
  `MedicationSchedule`, `MedicationAdministration`, `EmergencyProfile` — acesso de emergência sempre
  auditado e restrito a dados explicitamente autorizados.

## O que é P1 no próprio V2 e fica para a próxima fase (não é regressão, é a ordem que o prompt define)

- **School Intelligence** (Fase 8 do V2) — entidades já existem como stub em `product-stubs.ts`
  (`SchoolEnrollment` etc. não chegaram a ser escritas ainda); fica para depois do Request Engine/Health
  Core, como o próprio V2 ordena.
- **Family Copilot com RAG real** (Fase 9) — o AI Gateway já impõe a autorização antes do retrieval
  (pré-requisito estrutural do Copilot); o que falta é o Context Engine completo, respostas com fontes e a
  Action Layer conectada ao Request Engine. Fica para a próxima fase por ser P1 explícito no V2.
- **Advanced Care** (autonomia adolescente refinada, `SharePackage`, consentimentos avançados) — P1
  explícito, fica para depois.
- **UI avançada**: grade visual de calendário multi-residência (§39), Home simplificada para criança
  (§27), feed "Atividade da Rede" (§65), escalonamento de notificação (§63), cache de emergência offline
  (§44) — o dado e a autorização por trás de cada um destes já existem/existirão nesta fase; a camada
  visual/UX específica fica documentada como pendência explícita, não escondida.

## Ordem de execução adotada nesta sessão

Segue a ordem do comando de início do V2: gap analysis → migrations → domain → Policy Engine (extensão) →
Command Center → Universal Inbox/Capture Engine → Request Engine → histórico/versionamento (já herdado do
padrão de `AuditEvent` + estados imutáveis) → Emergency Profile → testes → build web → build API → validação
mobile → correção de erros → documentação → relatório.
