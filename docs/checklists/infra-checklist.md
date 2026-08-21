# Infra checklist — human/account actions required (§105)

None of the following can be done by an AI assistant: they require accepting legal terms, paying for a service,
or verifying identity with a third party. Everything technical needed to *use* these accounts (config files,
migrations, CI workflows) is already in this repository — only the account creation and credential handoff are
outstanding.

## Supabase
- [ ] Create three Supabase projects: `family-app-development`, `family-app-staging`, `family-app-production`.
- [ ] For each: copy `Project URL`, `anon public key`, `service_role key` into that environment's secrets.
- [ ] Run `supabase link --project-ref <ref>` and `supabase db push` to apply `supabase/migrations/` to each.
- [ ] **Before this app goes live publicly**: rotate the `family-app-dev` project's database password
      (Project Settings → Database → Reset database password). It was shared in this chat's conversation to run
      `supabase db push` from a local terminal (2026-08-20) because neither the assistant's cloud sandbox nor
      GUI-driven terminal automation could reach the database directly — a chat transcript is not an
      appropriate channel for a long-lived database credential, even for a development-only project. Reflect
      the new password in every local `.env`/`supabase link` config that used the old one.
- [ ] In Supabase Auth settings: configure MFA, email templates (pt-BR), and the site URL / redirect URLs to
      match each environment's real domain once chosen.
- [ ] Create storage buckets (`private-documents`, `medical-documents`, `school-documents`, `avatars`,
      `temporary-uploads`) when Phase 4 implementation lands — schema/policies will be provided at that point.

## Vercel
- [ ] Create a Vercel project for `apps/web`, connect this repository, set the root directory to `apps/web`
      (`apps/web/vercel.json` is already in the repo and pins the pnpm/Turborepo install + build commands —
      Vercel reads it automatically once Root Directory is set).
- [ ] Set **Production Branch** to `main`; leave other branches (including `develop`) as Preview deploys — a
      push to `develop` then auto-deploys as staging with no extra CI step needed.
- [ ] Add environment variables per environment/scope (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
      `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_APP_URL`) — Production scope pointed at the production Supabase
      project + `api.<domain>`, Preview scope at the staging Supabase project + `staging.api.<domain>`.

## API hosting — Fly.io
- [ ] Create a Fly.io account; `fly auth login` from a terminal with the CLI installed.
- [ ] `fly apps create family-app-api-staging` and `fly apps create family-app-api-production` (names must be
      globally unique on Fly — rename in `fly.staging.toml`/`fly.production.toml` if either is taken).
- [ ] For each app, `fly secrets set -a <app-name> SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... CORS_ALLOWED_ORIGINS=...`
      using that environment's own Supabase project's keys — never reuse one environment's keys on another app.
- [ ] `fly deploy --config fly.staging.toml` (and again with `fly.production.toml`) once to confirm the
      `Dockerfile` at the repo root actually builds on Fly's remote builder — this repo's own sandbox and this
      machine could not build-test it locally (see DEPLOYMENT.md "Container image").
- [ ] `fly tokens create deploy -a family-app-api-staging` and again for `-production` → save each as a GitHub
      Actions secret (`FLY_API_TOKEN_STAGING` / `FLY_API_TOKEN_PRODUCTION`) to enable automated deploys.

## GitHub Actions — CD secrets and gating
- [ ] Repo → Settings → Secrets and variables → Actions, add: `SUPABASE_ACCESS_TOKEN`,
      `SUPABASE_STAGING_PROJECT_REF`, `SUPABASE_PRODUCTION_PROJECT_REF`, `SUPABASE_PRODUCTION_DB_URL`,
      `FLY_API_TOKEN_STAGING`, `FLY_API_TOKEN_PRODUCTION` — see DEPLOYMENT.md "Secrets by host" for exactly
      where each value is generated.
- [ ] Repo → Settings → Environments, create `staging` and `production`. On `production`, turn on **required
      reviewers** — this is what actually gates `.github/workflows/deploy-production.yml` on a human approval;
      without it, that workflow's `environment: production` lines are decorative.
- [ ] Once the secrets above exist, `.github/workflows/deploy-staging.yml` and `deploy-production.yml` run
      automatically on push to `develop`/`main` respectively — no further code changes needed to activate them.

## Domain / DNS
- [ ] Register a domain (§108 — no domain has been chosen or registered).
- [ ] Point `www.<domain>` / `app.<domain>` / `api.<domain>` at Vercel / the API host per their instructions.
- [ ] Update `DOMAIN_ROOT` / `DOMAIN_WEB` / `DOMAIN_API` in each environment's secrets once real.
- Not blocking: Vercel and Fly.io both hand out a free working domain immediately (`*.vercel.app`,
  `family-app-api-staging.fly.dev`) — the app can be deployed and smoke-tested end-to-end before a real
  domain is registered; this section only matters for the final public URLs.

## AI provider
- [ ] Choose a provider (Anthropic / OpenAI / Azure OpenAI) and create an account + API key.
- [ ] Set `AI_PROVIDER` and `AI_PROVIDER_API_KEY`; flip `FF_AI_ENABLED=true` only after Phase 6 wiring lands and
      a legal/privacy review of the AI data flow has happened (see AI_ARCHITECTURE.md, PRIVACY.md).

## Transactional email
- [ ] Choose a provider (Resend / SendGrid / SES) and create an account + API key/domain verification (SPF/DKIM).
- [ ] Set `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`.

## Expo / EAS
- [ ] Create an Expo account and an EAS project; replace `REPLACE_WITH_EAS_PROJECT_ID` in
      `apps/mobile/app.json`.
- [ ] Generate an `EXPO_TOKEN` for CI-driven builds if automating EAS Build in the pipeline.

## Apple / Google (see the dedicated store checklists)
- [ ] Apple Developer Program enrollment (`docs/checklists/app-store-checklist.md`).
- [ ] Google Play Console account (`docs/checklists/google-play-checklist.md`).

## Observability
- [ ] Create a Sentry (or equivalent) project per environment; set `SENTRY_DSN`.
- [ ] Set up uptime monitoring against `GET /health` once the API has a public URL.
