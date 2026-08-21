# ADR-0008: pnpm hoisted node-linker + CommonJS builds for internal packages

## Status
Accepted

## Context
Two independent resolution problems surfaced while getting `pnpm build` and a real (non-test) boot of
`apps/api`/`apps/web` fully green:

1. **Metro (Expo/React Native) cannot reliably resolve pnpm's default node-linker.** pnpm's default layout
   stores packages in a content-addressable store and symlinks them into `node_modules`. Metro's bundler,
   even with `unstable_enableSymlinks` and a custom `nodeModulesPaths`/`disableHierarchicalLookup`
   configuration, kept failing to resolve transitive dependencies several packages have (e.g.
   `expo-splash-screen`, `expo-linking`, `react-native-reanimated`, `@babel/runtime`) once hierarchical
   lookup was disabled — a known class of issue for Expo + pnpm monorepos. Expo's own monorepo guide
   (https://docs.expo.dev/guides/monorepos/) recommends `node-linker=hoisted` in `.npmrc` for exactly this
   reason: it makes pnpm lay out `node_modules` the way npm/Yarn classic do (flat, no symlinks into a
   content store), which Metro resolves without special-casing.

2. **Internal workspace packages (`packages/*`) shipped a `main`/`types` field pointing at `src/index.ts`**
   instead of the compiled `dist/index.js`. This worked for every *tool-mediated* consumer (Vitest/esbuild,
   Next.js via `transpilePackages`, `tsc` typechecking) because those tools transform TypeScript on the fly
   or resolve via bundler-style rules. It broke the moment `apps/api`'s **compiled** output
   (`node dist/main.js`, i.e. exactly what a container or serverless function runs in production) tried to
   `require('@family-app/config')`: plain Node has no TypeScript loader, and — once `main` was pointed at
   `dist/index.js` — the packages built under the root `tsconfig.base.json`'s `module: "ESNext"` /
   `moduleResolution: "Bundler"` settings emitted extension-less `export * from './env'` syntax that Node's
   ESM resolution rejects (`ERR_MODULE_NOT_FOUND`), while `apps/api` itself compiles to CommonJS. The two
   settings were never validated together because no step in the pipeline actually executed the compiled
   output — `pnpm test`/`pnpm build` only ever typechecked or bundled the source.

## Decision
- Root `.npmrc` sets `node-linker=hoisted`. `apps/mobile/metro.config.js` was simplified back to just
  `watchFolders`/`nodeModulesPaths` (no `disableHierarchicalLookup`, no `unstable_enableSymlinks` — hoisted
  linking makes both unnecessary).
- Every internal package's `package.json` now points `main`/`types` at `./dist/index.js` /
  `./dist/index.d.ts` (previously `./src/index.ts` for everything except `packages/database`, which already
  did this correctly).
- Every internal package's own `tsconfig.json` (used only by that package's `build`/`typecheck` scripts, not
  by Next's `transpilePackages` path which reads source directly) now overrides `module: "CommonJS"`,
  `moduleResolution: "Node"` — matching `apps/api`'s existing settings — so `dist/` is real, Node-executable
  CommonJS regardless of the bundler-oriented defaults in `tsconfig.base.json`.
- Because pnpm's hoisted linker collapses the whole workspace to a single physical copy per package name,
  `react`/`react-dom` — needed at two incompatible versions (`apps/mobile` requires the exact version React
  Native 0.74.5 was built against; `apps/web` wants a newer 18.3.x) — are pinned to a single version
  (`18.2.0`, the one `apps/mobile` requires) via `pnpm.overrides` in the root `package.json`, and
  `apps/web`'s own `react`/`react-dom` dependency range was aligned to match. Next.js 14 (peer range
  `^18.2.0`) is fully compatible with 18.2.0.

## Consequences
- `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` are unaffected (verified: 26/26 tasks green, 60
  tests passing) — this was purely a resolution/output-format fix, not a behavior change.
- `apps/api`'s compiled output now genuinely boots under plain `node dist/main.js` (verified manually: real
  Postgres-backed boot, `/health` returns 200, an unauthenticated `/api/v1/persons` request correctly
  returns 401) — this is exactly the code path a Docker image or serverless function runs in production, so
  this fix is a prerequisite for Phase 7/8 deployment, not cosmetic.
- `apps/web`'s compiled output boots under `next start` as well (verified: `/` and `/entrar` return 200).
- Every package in the workspace is now pinned to a single `react`/`react-dom` version. If a future phase
  needs `apps/web` on a newer React than React Native supports, this override will need to be revisited
  (e.g. by moving `apps/mobile` off hoisted linking into its own isolated install, or upgrading Expo/RN to a
  release that supports the newer React).
- New engineers should run `pnpm install` after pulling `.npmrc` — the node-linker change requires a full
  reinstall (a stale symlinked `node_modules` and a hoisted one are not interchangeable).
