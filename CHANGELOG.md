# Changelog

All notable changes to this project are documented here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased] — Adendo: Rede Ampliada de Responsabilidade Familiar

See `docs/delivery/gap-analysis-extended-care-network.md` for the full
mapping against the addendum and `docs/delivery/phase-extended-care-network-report.md`
for the structured delivery report.

### Added

- **Extended Care Network**: `ResponsibilityAssignment` (full proposal →
  accept → active → complete state machine, reusing the Family Request
  Engine for the send/accept/decline trail), `DelegationPolicy`
  (can_delegate/can_redelegate/max_delegation_depth, with role-based
  defaults), `CareNetworkMember` (per-child Caregiver Pool with
  capability flags), `RecurringResponsibility` and `CaregiverAvailability`
  (structure only — see gap analysis), plus `apps/api/src/modules/care-network`
  and web `/app/care-network` ("Quem pode ajudar?" + incoming/outgoing
  responsibilities).
- 5 new `Relationship` types (aunt/uncle, godparent, trusted person,
  professional, authorized driver) and 8 new `AuditEvent` types for the
  responsibility lifecycle + delegation.
- `RESPONSIBILITY_PERMISSION_BUNDLES`: a deterministic, minimum-necessary
  permission set per responsibility type (e.g. PICKUP never implies
  HEALTH/DOCUMENTS/FINANCE) — minted as scoped, time-boxed
  `AuthorityGrant`s only on acceptance, never on creation.
- Delegation chains with depth-limited, policy-checked
  redelegation, and a "you cannot grant what you don't have" check that
  applies to both a responsibility type's default bundle and any
  explicit override.
- `RESPONSIBILITY_ASSIGNMENT` added as a `requests.type` so responsibility
  proposals reuse the already-audited Request Engine trail instead of a
  parallel one.

### Security

- 6 new RLS integration tests (`packages/database/test/rls-v3.integration.test.ts`)
  proving cross-tenant isolation on `responsibility_assignments`,
  `care_network_members`, and `delegation_policies`.
- 6 new service-level tests proving: a babá (CAREGIVER role,
  `can_delegate=false`) cannot delegate at all; a GUARDIAN can create a
  first delegation hop; nobody can grant a bundle broader than their own
  authority; PICKUP acceptance mints only its 5-item bundle and never a
  CareWindow; OVERNIGHT_CARE acceptance does mint a CareWindow; only the
  assigned person may accept.

## [Unreleased] — Prompt Mestre V2, Fases 2-3-4-6-7 (P0)

Builds directly on Fase 0 (Foundation) + Fase 1 (Family Core). See
`docs/delivery/gap-analysis-v2.md` for the full before/after comparison
against the V2 master prompt, and `docs/delivery/phase-v2-p0-report.md`
for the structured delivery report (implementado / arquivos / migrations
/ testes / build / security / pendências / próxima fase).

### Added

- **Command Center** (Fase 3, §24-29): `CalendarEvent`, `Task`,
  `Routine`/`RoutineItem`, `Checklist`/`ChecklistItem` — real entities,
  migrations, RLS, and API (`apps/api/src/modules/command-center`),
  including the `GET /today` aggregation endpoint. Web `/app/today` and
  `/app/tasks` now show real data instead of a roadmap placeholder.
- **Universal Family Inbox / Capture Engine** (Fase 4, §13-23): new
  `packages/capture-engine` (pluggable classifier/extractor pipeline,
  currently a deterministic heuristic — no AI/OCR provider key is
  configured), `CaptureItem`/`CaptureAttachment`/`CaptureExtraction`/
  `CaptureProposal` domain entities and migrations, `apps/api/src/modules
  /capture`, and web `/app/capture`.
- **Family Request Engine** (Fase 6, §30-37): `Request`/`RequestAction`
  domain entities with a state machine, migrations (with an append-only,
  immutable `request_actions` trail), `apps/api/src/modules/requests`,
  and web `/app/requests`.
- **Health Core + Emergency Profile** (Fase 7, §41-44, §55-58):
  `Medication`, `Prescription`, `MedicationSchedule`,
  `MedicationAdministration`, `EmergencyProfile` domain entities and
  migrations, `apps/api/src/modules/wellbeing` (emergency access is
  always audited, allowed or denied), web `/app/emergency` and the
  mobile Emergency tab.
- `documents`/`extracted_document_data` tables promoting the Phase 1
  planning stub to a real, migrated table.
- 8 new audit event types (`CALENDAR_EVENT_CREATED`, `TASK_CREATED`,
  `CAPTURE_ITEM_CREATED`, `CAPTURE_CONFIRMED`, `CAPTURE_REJECTED`,
  `REQUEST_CREATED`, `REQUEST_ACCEPTED`, `REQUEST_DECLINED`).
- Migration runner (`packages/database/scripts/migrate.ts`) now tracks
  applied files in `public._schema_migrations`, making `pnpm db:migrate`
  idempotent across sessions instead of re-running every file every time.
- ADR-0008: pnpm hoisted node-linker + CommonJS package builds (fixes a
  real production-boot bug in the compiled `apps/api`/`apps/web` output
  found while validating this phase — see the ADR for the full story).

### Changed

- `CalendarEvent`, `Task`, `HealthProfile`, `Document`/
  `ExtractedDocumentData` moved from Phase 1 planning stubs
  (`packages/domain/src/entities/product-stubs.ts`) to real, migrated,
  API-backed entities.
- `POST /api/v1/onboarding/status` now also returns `personId`/
  `tenantId` so the web/mobile clients can address "myself" without a
  separate `/me` endpoint.

### Security

- 6 new RLS integration tests (`packages/database/test/rls-v2.integration
  .test.ts`) proving cross-tenant isolation on `emergency_profiles`,
  `requests`, and `capture_items`, plus `request_actions` immutability.
- 2 new unit tests proving `EmergencyProfile` access is audited on both
  ALLOW and DENY (`apps/api/test/wellbeing.emergency-audit.test.ts`).
- 11 new domain-level state-machine tests for `CaptureItem` and
  `Request` transitions (nothing skips from RECEIVED straight to
  CONFIRMED; nothing skips from DRAFT straight to ACCEPTED).

## Fase 0 + Fase 1 — Foundation + Family Core

Initial release. See `docs/delivery/phase-0-1-report.md` for the full
structured delivery report.
