'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabase-client';
import { GoogleButton } from '@/components/google-auth-button';
import { AppleButton } from '@/components/apple-auth-button';

export default function EntrarPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      router.push('/app/today');
    } catch (err) {
      setError('E-mail ou senha incorretos.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold text-ink">Entrar</h1>

      <div className="mt-8 flex flex-col gap-3">
        <GoogleButton label="Continuar com Google" />
        <AppleButton label="Continuar com Apple" />
      </div>

      <div className="my-6 flex items-center gap-3 text-xs text-inkMuted" role="separator">
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        ou
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink">
          E-mail
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          <span className="flex items-center justify-between">
            Senha
            <Link href="/recuperar-senha" className="text-xs font-medium text-primary underline-offset-2 hover:underline">
              Esqueci minha senha
            </Link>
          </span>
          <input
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-critical">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-2 min-h-11 rounded-md bg-primary px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      <div className="mt-8 border-t border-border pt-6 text-center">
        <p className="text-sm text-inkMuted">Ainda não tem conta?</p>
        <Link
          href="/cadastro"
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border bg-surface px-4 font-medium text-ink hover:bg-surfaceMuted"
        >
          Criar conta
        </Link>
      </div>
    </main>
  );
}
