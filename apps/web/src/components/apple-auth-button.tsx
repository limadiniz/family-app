'use client';

import { useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase-client';

/**
 * Botão "Continuar com Apple" — mesmo padrão do `google-auth-button.tsx`
 * (mesma chamada `signInWithOAuth`, só troca o `provider`), usado em
 * `/entrar` e `/cadastro`.
 *
 * IMPORTANTE: só funciona de fato depois que o provider Apple estiver
 * habilitado no painel do Supabase (Authentication → Providers → Apple),
 * com Services ID + client secret gerados a partir de uma Apple Developer
 * Program (paga, US$99/ano) — configuração manual no painel da Supabase e
 * no Apple Developer Console, nunca em código. Diferente do Google, o
 * client secret da Apple é um JWT assinado que EXPIRA a cada 6 meses e
 * precisa ser regenerado manualmente — não é um "configura uma vez e
 * esquece". Até a configuração estar pronta (e, depois, sempre que o
 * secret expirar sem renovação), o clique aqui mostra o erro que o
 * Supabase devolver em vez de fingir sucesso.
 */
export function AppleButton({ label }: { label: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: { redirectTo: `${window.location.origin}/app/today` },
      });
      if (oauthError) throw oauthError;
      // Em caso de sucesso o navegador já é redirecionado para a Apple —
      // não há mais nada a fazer aqui.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível continuar com a Apple agora.');
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex min-h-11 w-full items-center justify-center gap-3 rounded-md bg-ink px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        <svg aria-hidden="true" viewBox="0 0 17 20" width="16" height="16" fill="currentColor">
          <path d="M14.15 10.62c-.02-2.06 1.68-3.05 1.75-3.1-.96-1.4-2.45-1.6-2.98-1.62-1.27-.13-2.48.75-3.12.75-.65 0-1.63-.73-2.68-.71-1.38.02-2.65.8-3.36 2.03-1.43 2.48-.37 6.16 1.03 8.17.68.98 1.5 2.08 2.57 2.04 1.03-.04 1.42-.66 2.67-.66 1.24 0 1.6.66 2.68.64 1.11-.02 1.81-1 2.48-1.99.78-1.14 1.1-2.24 1.11-2.3-.02-.01-2.13-.82-2.15-3.25ZM12.03 3.9c.56-.68.94-1.62.83-2.56-.81.03-1.79.54-2.37 1.22-.52.6-.98 1.57-.85 2.48.89.07 1.8-.45 2.39-1.14Z" />
        </svg>
        {loading ? 'Redirecionando...' : label}
      </button>
      {error && <p className="mt-2 text-sm text-critical">{error}</p>}
    </div>
  );
}
