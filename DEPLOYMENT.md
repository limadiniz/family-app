# DEPLOYMENT.md

## Environments

Three fully separate environments (§77): `development`, `staging`, `production`. Each needs its own Supabase
project (own database, auth, storage), its own set of secrets, and its own URLs. None of this is provisioned
yet — see `docs/checklists/infra-checklist.md` for the human steps required.

| Environment | Web | API | Database |
|---|---|---|---|
| development | `localhost:3000` | `localhost:4000` | local Postgres or a dev Supabase project |
| staging | `staging.app.<domain>` (TBD) | `staging.api.<domain>` (TBD) | dedicated Supabase project |
| production | `app.<domain>` (TBD) | `api.<domain>` (TBD) | dedicated Supabase project |

`<domain>` is a placeholder — no domain has been registered (§108). `DOMAIN_ROOT` / `DOMAIN_WEB` / `DOMAIN_API`
in `.env.example` hold the placeholders until a real domain is chosen.

## Hosting decision

- **Web (`apps/web`)**: Vercel (§94) — Next.js App Router is a first-class target; no architectural blocker
  identified.
- **API (`apps/api`)**: NestJS on Express. ASSUMPTION (§128, revisit before Phase 8): deploy as a persistent
  Node process (e.g. a small container / Fly.io / Render / a VM) rather than serverless functions, because the
  API holds long-lived Supabase service-role connections and will grow WebSocket/queue consumers in later
  phases (notifications, AI streaming) that don't fit a request-scoped serverless model well. If a concrete
  operational reason favors serverless later, record that as a new ADR rather than silently changing the
  target.
- **Database/Auth/Storage**: Supabase (§95), one project per environment.
- **Mobile**: EAS Build + EAS Submit (§102-104).

## CI (GitHub Actions) — `.github/workflows/ci.yml`

On every pull request: install → lint → typecheck → unit tests → build. Database RLS integration tests run
against a Postgres service container spun up by the workflow itself (see the workflow file) — no external
Supabase project needed for CI.

## Container image — `Dockerfile` (apps/api only)

A single multi-stage `Dockerfile` lives at the repo root (not inside `apps/api/`) because it uses `turbo prune`,
which needs the full monorepo workspace graph to figure out exactly which `packages/*` `apps/api` actually
depends on before shrinking the build context down to just that subset. `apps/web` is **not** built into a
container — it deploys to Vercel instead (see below). Build/run it yourself with:

```
docker build -t family-app-api .
docker run --rm -p 4000:4000 \
  -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e SUPABASE_SERVICE_ROLE_KEY=... \
  family-app-api
```

This image was written following the standard pnpm+Turborepo Docker recipe but **could not be build-tested
in this session** — the cloud sandbox this assistant runs in has no network route to any container registry
(Docker Hub, GHCR, GCR, MCR all refused the connection), so the base image itself can't be pulled here. It
also can't be tested from your machine without installing Docker Desktop (the same gap already noted for
`supabase db dump`, see `DATABASE_ENVIRONMENTS.md` §5). Real validation happens the first time `fly deploy`
runs: **Fly.io builds the image on its own remote builder**, so you do not need Docker installed locally to
deploy — only to test-build it yourself ahead of time if you want to. Treat the first `fly deploy` as the real
first build test, and watch its output closely.

## Hosting: apps/web → Vercel

`apps/web/vercel.json` pins the monorepo-aware install/build commands (`cd ../.. && pnpm install` /
`cd ../.. && pnpm turbo run build --filter=@family-app/web`) that Vercel needs for a pnpm/Turborepo workspace.
One-time setup, per environment:

1. Vercel dashboard → New Project → import this repository.
2. **Root Directory**: `apps/web` (Vercel then auto-reads `apps/web/vercel.json`).
3. Framework preset: Next.js (auto-detected).
4. Environment variables (Project Settings → Environment Variables), set separately for **Production** and
   **Preview** scopes since staging and production are different Supabase projects:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_APP_URL`.
5. Git integration: point **Production Branch** at `main`; pushes to `develop` and any other branch build as
   Preview deploys automatically (this doubles as the staging deploy — no extra CI job needed for `apps/web`,
   see below).

`apps/web/next.config.js` also now sets baseline security headers (HSTS, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, a restrictive `Permissions-Policy`) on every response — a browser-layer
floor, not a substitute for the server-side RLS/Policy Engine authorization this project's hard rules require.

## Hosting: apps/api → Fly.io

`fly.staging.toml` and `fly.production.toml` (repo root) are separate, ready-to-use configs — staging and
production are different Fly *apps*, not the same app redeployed with different env vars, matching the
"fully separate environments" rule in `DATABASE_ENVIRONMENTS.md` §1. One-time setup per environment:

```
fly auth login
fly apps create family-app-api-staging       # or family-app-api-production
fly secrets set -a family-app-api-staging \
  SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
  CORS_ALLOWED_ORIGINS=https://staging.app.<domain>
fly deploy --config fly.staging.toml
```

Both configs run the health check against `GET /health` (excluded from the `/api/v1` prefix in `main.ts`),
pin the region to `gru` (São Paulo, matching the Supabase project's `sa-east-1`), and keep `min_machines_running`
≥1 so the API never cold-starts or drops its Supabase connections — see `DEPLOYMENT.md`'s "Hosting decision"
above for why this needs a persistent process rather than serverless.

## CD — staging — `.github/workflows/deploy-staging.yml`

Wired (not just documented) as of this pass: on every push to `develop`, the workflow (1) links and
`supabase db push`es the staging Supabase project, (2) `fly deploy`s `apps/api` to `family-app-api-staging`,
(3) polls `GET /health` until it returns 200 or times out. `apps/web` is deliberately left out of this
workflow — Vercel's own Git integration (above) already redeploys it on the same push, with the added benefit
of PR preview deploys that a scripted `vercel` CLI step in Actions would not give you for free. See
`DATABASE_ENVIRONMENTS.md` §2/§6 for exactly what `supabase db push` does differently from `migrate.ts`.

Required repo secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_STAGING_PROJECT_REF`, `FLY_API_TOKEN_STAGING` — see
"Secrets by host" below for exactly where to generate each one.

## CD — production — `.github/workflows/deploy-production.yml`

Wired as of this pass, following the validate → backup → migration → deploy → health check → smoke test shape
this file previously only described: on every push to `main`, the workflow (1) runs `pg_dump` (schema + data)
against the production database and uploads both files as a 90-day workflow artifact, (2) links and
`supabase db push`es the production Supabase project, (3) `fly deploy`s to `family-app-api-production`,
(4) polls `GET /health`. Rollback: migrations stay additive-first (see CONTRIBUTING.md's "no destructive
migration without a two-step deprecate/backfill/drop plan"); the API side rolls back with
`fly releases -a family-app-api-production` to find the previous release, then
`fly deploy --image <previous-image>`.

**Gating.** Every job in this workflow declares `environment: production`. Create that GitHub Environment
(repo Settings → Environments → New environment → `production`) and turn on **required reviewers** — that
setting is what actually makes this "a controlled pipeline" rather than an unattended one; the workflow file
alone doesn't enforce a human checkpoint without it.

Required repo secrets: `SUPABASE_ACCESS_TOKEN` (shared with staging), `SUPABASE_PRODUCTION_PROJECT_REF`,
`SUPABASE_PRODUCTION_DB_URL` (used only for the `pg_dump` backup step — treat it with the same care as the
password-rotation pendency in `docs/checklists/infra-checklist.md`), `FLY_API_TOKEN_PRODUCTION`.

## Secrets by host — where each one comes from

Nothing below is a real value; this is a map of *which secret store* each variable belongs in, so a real deploy
never depends on pasting a credential into a chat, a `.env` committed to git, or a hosting dashboard's
plaintext build logs.

| Secret | Lives in | Generated at |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_APP_URL` | Vercel → Project Settings → Environment Variables (per Production/Preview scope) | Supabase dashboard → Project Settings → API |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ALLOWED_ORIGINS` | `fly secrets set -a <app>` (per Fly app — staging vs. production) | Supabase dashboard → Project Settings → API |
| `SUPABASE_ACCESS_TOKEN` | GitHub repo → Settings → Secrets and variables → Actions | Supabase dashboard → Account → Access Tokens (one token can drive both staging and production links) |
| `SUPABASE_STAGING_PROJECT_REF` / `SUPABASE_PRODUCTION_PROJECT_REF` | GitHub Actions secrets | Supabase dashboard → Project Settings → General ("Reference ID") |
| `SUPABASE_PRODUCTION_DB_URL` | GitHub Actions secrets (production job only) | Supabase dashboard → Project Settings → Database → Connection string (URI, direct or session-mode pooler — never transaction-mode, see `DATABASE_ENVIRONMENTS.md` §2) |
| `FLY_API_TOKEN_STAGING` / `FLY_API_TOKEN_PRODUCTION` | GitHub Actions secrets | `fly tokens create deploy -a family-app-api-staging` (and again for `-production`) — scoped to one app each, not an account-wide token |

None of these can be generated by this assistant — each one requires an account that already exists
(Supabase, Vercel, Fly.io, GitHub) and a human clicking through that account's own UI. See
`docs/checklists/infra-checklist.md` for the full list of account-creation steps still outstanding.

## Branch strategy

`main` (production-tracking) / `develop` (staging-tracking) / `feature/*` / `fix/*` (§101). This repository's
initial commit lives directly on `main` since it is the first commit of the project; subsequent work should
branch per CONTRIBUTING.md.

## Mobile builds

`apps/mobile/eas.json` defines `development` / `preview` / `production` build profiles (§102). Submitting to
TestFlight / Play internal testing requires an Apple Developer account and a Google Play Console account —
human/legal actions the assistant cannot perform; see `docs/checklists/app-store-checklist.md` and
`docs/checklists/google-play-checklist.md`.

## Environment variables checklist

See `.env.example` for the full list. Nothing in this repository contains a real secret; every value in a
deployed environment is set through the hosting provider's secret manager (Vercel env vars, the API host's
secret store, EAS secrets), never committed.
