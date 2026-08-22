'use client';

import { useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase-client';

/**
 * Botão "Continuar com Google" — usado em `/entrar` e `/cadastro` (é o
 * mesmo fluxo OAuth para os dois casos: o Supabase cria a conta na primeira
 * vez que aquele e-mail do Google aparece e faz login normalmente depois).
 *
 * IMPORTANTE: isto chama a API certa (`signInWithOAuth`), mas só funciona de
 * fato depois que o provider Google estiver habilitado no painel do
 * Supabase (Authentication → Providers → Google, com Client ID/Secret do
 * Google Cloud) — algo que precisa ser feito manualmente lá, nunca por
 * código. Até isso acontecer, o clique aqui mostra o erro que o Supabase
 * devolver ("provider not enabled" ou similar) em vez de fingir sucesso.
 */
export function GoogleButton({ label }: { label: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/app/today` },
      });
      if (oauthError) throw oauthError;
      // Em caso de sucesso o navegador já é redirecionado para o Google —
      // não há mais nada a fazer aqui.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível continuar com o Google agora.');
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex min-h-11 w-full items-center justify-center gap-3 rounded-md border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-surfaceMuted disabled:opacity-50"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
          <path
            fill="#4285F4"
            d="M19.6 10.23c0-.68-.06-1.32-.17-1.94H10v3.68h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.99-4.33 2.99-7.26Z"
          />
          <path
            fill="#34A853"
            d="M10 20c2.7 0 4.96-.9 6.61-2.43l-3.23-2.5c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.75-5.59-4.11H1.06v2.59A10 10 0 0 0 10 20Z"
          />
          <path
            fill="#FBBC05"
            d="M4.41 11.92A6 6 0 0 1 4.1 10c0-.67.11-1.31.31-1.92V5.49H1.06A10 10 0 0 0 0 10c0 1.61.39 3.14 1.06 4.51l3.35-2.59Z"
          />
          <path
            fill="#EA4335"
            d="M10 3.98c1.47 0 2.79.5 3.83 1.49l2.87-2.87C14.95.99 12.7 0 10 0 6.09 0 2.71 2.24 1.06 5.49l3.35 2.59C5.2 5.73 7.4 3.98 10 3.98Z"
          />
        </svg>
        {loading ? 'Redirecionando...' : label}
      </button>
      {error && <p className="mt-2 text-sm text-critical">{error}</p>}
    </div>
  );
}
