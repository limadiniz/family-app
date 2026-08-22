'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/ui';

/**
 * Next.js App Router convention: this file becomes the error boundary
 * for everything under `/app/*` — it wraps `page.tsx` but NOT
 * `layout.tsx`, so a render-time crash in one page's content (an
 * unexpected API shape, a bug in a new page) is contained to that
 * page's body. `Sidebar`/`MobileTopBar`/`MobileBottomNav` stay mounted
 * and navigable — the person can always leave the broken page (§7: "um
 * widget não crítico com erro não deve inutilizar toda a página", taken
 * one level up: a broken PAGE must not inutilize the whole app shell).
 *
 * Complements, doesn't replace, per-fetch error handling (`ErrorState`
 * shown inline after a caught rejection) — this is the last-resort net
 * for a crash that page-level code didn't anticipate.
 */
export default function AppSegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Erro não tratado em /app:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-md">
        <ErrorState
          title="Algo deu errado nesta página"
          description="Você não perdeu seu lugar — o menu continua funcionando normalmente."
          onRetry={reset}
        />
      </div>
    </div>
  );
}
