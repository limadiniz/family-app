# ADR-0001: Monorepo with pnpm + Turborepo; Next.js / NestJS / Expo

## Status
Accepted

## Context
The platform ships three clients (web, iOS, Android) and one API sharing a large amount of domain logic
(entities, validation, the Policy Engine, business rules). Duplicating that logic per-app risks the exact
failure mode §25 warns against: authorization logic drifting out of sync between web and mobile.

## Decision
A single pnpm workspace + Turborepo monorepo (`/apps`, `/packages`), with:
- `apps/web`: Next.js (App Router) + TypeScript + Tailwind
- `apps/api`: NestJS + TypeScript
- `apps/mobile`: Expo (React Native) + Expo Router + TypeScript
- Shared logic in `/packages/*`, consumed by all three via pnpm workspace protocol (`workspace:*`)

## Consequences
- One `pnpm install` / `pnpm dev` boots everything (§131's first expected result).
- The Policy Engine, domain schemas, and validation logic are written exactly once and imported everywhere.
- Slightly higher initial tooling complexity (Turborepo task graph) than three separate repos, judged worth it
  given how much cross-cutting logic (auth, permissions, types) this product needs shared correctly.
