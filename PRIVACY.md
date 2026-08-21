# PRIVACY.md

This document is a technical privacy design summary prepared for review by a DPO/legal counsel before
production launch. It does not constitute legal advice or a final LGPD compliance determination (§66).

## Scope

Brazil-first product (`pt-BR` MVP), processing personal data of adults and, centrally, of children and
adolescents — a special category under LGPD requiring the child's best interest as the guiding principle for
every design decision, plus heightened consent/authorization handling for whoever exercises parental authority.

## Privacy by Design / by Default

- **Minimization**: `Person` requires no CPF and no government ID as a structural key (§123) — only
  `display_name`, and optionally `birth_date`/`legal_name`. Optional fields stay optional.
- **Purpose limitation**: every `AuthorityGrant` is scoped to a `(domain, action)` pair, not a blanket "family
  access" flag (`packages/domain/src/entities/authority-grant.ts`).
- **Data provenance**: facts carry a `Provenance` tag (`USER_DECLARED`, `DOCUMENT_EXTRACTED`,
  `PROFESSIONAL_CONFIRMED`, `SYSTEM_GENERATED`, `AI_INFERRED`) so an AI-inferred fact is never silently treated
  as user-declared truth (`packages/domain/src/common.ts`).
- **Default posture is deny**: the Family Policy Engine's final fallback, absent any matching grant, is `DENY`
  (`packages/policy-engine/src/policy-engine.ts`).

## Data subject rights (planned, tracked against phases)

| Right | Status |
|---|---|
| Access / portability (export) | Planned Phase 7 (`§113` — "Exportar meus dados") |
| Deletion | Planned Phase 7 (`§114`) — soft-delete for audit-critical rows, hard-delete elsewhere, documented per-table |
| Correction | Available today via standard `EDIT` permission on `PROFILE` |
| Consent records | `Consent` entity is named in the master prompt's entity list (§11) and reserved in the domain model; not yet implemented — Phase 4/7 |

## Children's data

- A `Person` under 18 is flagged `is_minor` (server-derived from `birth_date`, never trusted from client input —
  `derivePersonAgeFacts` in `packages/domain/src/entities/person.ts`).
- Minors do not get the "self-access" authorization shortcut that adults get
  (`FamilyPolicyEngine.authorize`'s `SELF_ACCESS_ALLOW` rule explicitly excludes `subjectIsMinor`) — their data
  access is entirely mediated by explicit grants/roles held by responsible adults, or by their own `AutonomyProfile`
  once that ships (Phase 3+).
- A minor's `Person` never requires their own login to exist meaningfully in the system (§13).

## Retention

Not yet finalized as a configurable policy (Phase 7). Current default: soft-delete (`deleted_at`) for entities
with audit significance (`persons`, `family_memberships`, `relationships`, ...); `audit_events` rows are never
deleted by the application (retention/purge, if any, is a documented, superuser-only maintenance job — see
RUNBOOK.md), consistent with the immutability requirement in §26.

## Third parties / sub-processors (to be completed by the account owner)

Supabase (database/auth/storage), the AI provider (TBD — `AI_PROVIDER` env var), the email provider (TBD), and
Expo/EAS (push notifications, build) are the sub-processors this architecture assumes. A DPA with each is a
human/legal action — see `docs/checklists/infra-checklist.md`.

## Incident response

Not yet formalized as a runbook procedure beyond the general incident guidance in RUNBOOK.md. A dedicated privacy
incident (data breach) notification procedure — required under LGPD art. 48 — is a Phase 7 deliverable requiring
legal input on timelines and the ANPD notification process.
