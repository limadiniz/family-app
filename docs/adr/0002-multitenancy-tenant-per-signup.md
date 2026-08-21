# ADR-0002: One Tenant per signup; FamilyUnit is a separate, many-to-many concept

## Status
Accepted

## Context
§89 requires "Family A nunca consulta Family B" to be provable, not just intended. §15 separately requires that
a single Person can belong to more than one family (blended/shared-custody families) — these are two different
axes and conflating them would force an awkward choice between hard isolation and flexible family modeling.

## Decision
`Tenant` is the RLS-enforced isolation boundary and is created automatically, one per signup
(`app.create_tenant_and_owner` RPC). `FamilyUnit` is a lightweight, many-to-many grouping *within* a tenant
(`FamilyMembership` join table) that models real household/custody structures. A tenant can contain more than
one `FamilyUnit` (e.g. "Família da Ana" and "Família do Carlos" sharing the children Mariana and Pedro, as
seeded in `packages/database/seed/familia-silva.sql`).

## Consequences
- Cross-tenant isolation (the hard security boundary) is a single, simple, testable RLS predicate:
  `tenant_id = app.current_tenant_id()`.
- Within-tenant, cross-FamilyUnit authorization (a caregiver in one FamilyUnit shouldn't automatically see
  everything in a sibling FamilyUnit under the same tenant) is the Policy Engine's job, not RLS's — see
  ARCHITECTURE.md §4.
- A future B2B2C scenario (e.g. a co-parenting mediator platform spanning two otherwise-unrelated tenants) is
  out of scope for this ADR and would need its own design.
