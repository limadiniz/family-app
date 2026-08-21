# syntax=docker/dockerfile:1
# ============================================================================
# Dockerfile — apps/api (NestJS), built from the pnpm/turbo monorepo root.
#
# Only apps/api is deployed as a container (see DEPLOYMENT.md: apps/web goes
# to Vercel instead). Uses `turbo prune` to shrink the monorepo down to just
# what @family-app/api needs (its own source + the workspace packages it
# depends on transitively), so the image doesn't drag in apps/web, apps/mobile,
# or unrelated packages.
#
# Build from the REPO ROOT (this file lives at the repo root on purpose,
# because `turbo prune` needs the full workspace context):
#   docker build -t family-app-api .
#
# Fly.io (fly.staging.toml / fly.production.toml at repo root) already point
# `build.dockerfile` at this file, so `fly deploy --config fly.<env>.toml`
# from the repo root just works.
# ============================================================================

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app
# Pin the exact pnpm version declared in package.json's "packageManager" field
# so local, CI and Fly builds all resolve dependencies identically.
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

# ---- Prune: reduce the monorepo to only what @family-app/api needs --------
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@^2.3.3 prune @family-app/api --docker

# ---- Install: dependencies only, using the pruned package.json/lockfile ---
# Split from the build stage so Docker can cache this layer across builds
# that only change application source, not dependencies.
FROM base AS installer
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/full/.npmrc ./.npmrc
COPY --from=pruner /app/out/full/pnpm-workspace.yaml ./pnpm-workspace.yaml
# Matches the CI convention in .github/workflows/ci.yml (frozen-lockfile
# disabled there too) rather than a stricter frozen install.
RUN pnpm install --frozen-lockfile=false

# ---- Build: bring in full pruned source, compile workspace deps + api -----
FROM base AS builder
COPY --from=installer /app/ .
COPY --from=pruner /app/out/full/ .
# `turbo prune --docker` only copies files that belong to a workspace package
# (apps/*, packages/*, package.json, pnpm-workspace.yaml, turbo.json, .npmrc) —
# it does NOT copy shared root-level config that isn't itself a workspace
# member. Every package's tsconfig.json does `"extends": "../../tsconfig.base.json"`,
# so without this explicit copy every `tsc` build fails with
# "error TS5083: Cannot read file '/app/tsconfig.base.json'" — confirmed by
# reproducing the exact prune+install+build sequence outside Docker.
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
# Placeholder values so packages/config's eager env validation (imported by
# some workspace packages at module-load time during the TS build) doesn't
# throw during `tsc` — real secrets are injected at *runtime* by Fly (see
# fly.toml / `fly secrets set`), never baked into the image.
ENV SUPABASE_URL=https://placeholder.supabase.co
ENV SUPABASE_ANON_KEY=placeholder-anon-key
ENV SUPABASE_SERVICE_ROLE_KEY=placeholder-service-role-key
RUN pnpm dlx turbo@^2.3.3 run build --filter=@family-app/api...

# ---- Runtime: slim image, non-root user, only compiled output + deps -----
FROM node:20-alpine AS runner
RUN apk add --no-cache dumb-init
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nestjs
COPY --from=builder --chown=nestjs:nodejs /app .
USER nestjs

EXPOSE 4000
# Container-level safety net matching apps/api's own /health endpoint
# (excluded from the api/v1 prefix in main.ts, so this is the real path).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${API_PORT:-4000}/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/api/dist/main.js"]
