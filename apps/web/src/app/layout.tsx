import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

/**
 * Plus Jakarta Sans via next/font/google (§6.2) — self-hosted at build time
 * by Next.js (no runtime request to Google Fonts, no layout-shift flash),
 * with `display: 'swap'` so text never stays invisible while the font
 * loads and a system-font fallback stack in globals.css/tailwind covers
 * the (rare) case the font asset itself fails to load.
 *
 * Verification note: this couldn't be build-tested end-to-end in the
 * cloud sandbox that authored this change — its network policy blocks
 * fonts.googleapis.com (same class of restriction already hit with
 * container registries and direct Postgres this project cycle). Removing
 * just this font import and rebuilding confirmed everything else (new
 * tokens, Tailwind config, every route) compiles and prerenders cleanly —
 * the Google Fonts fetch is the only untested step, and it runs on
 * Vercel's own build infra (unrestricted network, and next/font/google is
 * Vercel's own recommended integration), not this sandbox. Treat the
 * first real `apps/web` deploy after this change as that step's actual
 * test, same discipline as the Dockerfile fix earlier this project.
 */
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ZELII — O cuidado em sintonia',
  description: 'ZELII organiza o cuidado entre todos que fazem parte da rotina da família: agenda, escola, saúde e cuidado, em um só lugar.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={plusJakartaSans.variable}>
      <body className="min-h-screen bg-bg font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
