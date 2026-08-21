import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadDotenv } from 'dotenv';

/**
 * Loads `.env.local` (falling back to `.env`) from the current working
 * directory into `process.env`, mirroring the convention documented in
 * README.md (`cp .env.example apps/api/.env.local`).
 *
 * Node scripts (NestJS's `nest start`, tsx scripts in packages/database)
 * do NOT auto-load `.env*` files the way Next.js does for apps/web — that
 * only happens if something explicitly reads the file. Call this once, as
 * early as possible (before any code reads `process.env`), from every
 * non-Next.js entry point that expects to be configured via `.env.local`.
 *
 * Never overrides a variable that is already set in `process.env` (e.g.
 * exported by the shell, or injected by CI/hosting) — file values only
 * fill in what's missing.
 */
export function loadEnvFile(cwd: string = process.cwd()): void {
  for (const file of ['.env.local', '.env']) {
    const path = join(cwd, file);
    if (existsSync(path)) {
      loadDotenv({ path });
    }
  }
}
