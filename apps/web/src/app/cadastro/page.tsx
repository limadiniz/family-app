'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabase-client';
import { GoogleButton } from '@/components/google-auth-button';
import { AppleButton } from '@/components/apple-auth-button';
import { buildAuthUrl, resolveAuthReturnTo } from '@/lib/auth-return';

export default function CadastroPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <CadastroForm />
    </Suspense>
  );
}

function CadastroForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = resolveAuthReturnTo(searchParams.get('returnTo'), '/app/onboarding');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: `${window.location.origin}${returnTo}`,
        },
      });
      if (signUpError) throw signUpError;
      if (data.user && data.user.identities?.length === 0) {
        throw new Error('Este e-mail já possui uma conta. Entre com sua senha ou recupere o acesso.');
      }
      // With e-mail confirmation enabled Supabase intentionally returns no
      // session. Calling our API at this point caused the registration bug:
      // there was no bearer token yet. Bootstrap happens only after login,
      // inside the onboarding wizard (or the invitation is accepted first).
      if (!data.session) {
        setConfirmationSent(true);
        return;
      }
      const destination = returnTo === '/app/onboarding'
        ? `/app/onboarding?name=${encodeURIComponent(displayName)}`
        : returnTo;
      router.push(destination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar sua conta.');
    } finally {
      setLoading(false);
    }
  }

  if (confirmationSent) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <p className="text-sm font-medium text-primary">Conta criada</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Confirme seu e-mail</h1>
        <p className="mt-3 text-sm text-inkMuted">
          Enviamos um link para <strong className="text-ink">{email}</strong>. Depois da confirmação, você poderá continuar exatamente de onde parou.
        </p>
        <Link href={buildAuthUrl('/entrar', returnTo)} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 font-medium text-white">
          Já confirmei — entrar
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold text-ink">Criar sua conta</h1>
      <p className="mt-2 text-sm text-inkMuted">Leva menos de dois minutos.</p>

      <div className="mt-6 flex flex-col gap-3">
        <GoogleButton label="Continuar com Google" returnTo={returnTo} />
        <AppleButton label="Continuar com Apple" returnTo={returnTo} />
      </div>

      <div className="my-6 flex items-center gap-3 text-xs text-inkMuted" role="separator">
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        ou
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink">
          Seu nome
          <input
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2"
            placeholder="Ana Silva"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          E-mail
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2"
            placeholder="voce@email.com"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          Senha
          <input
            required
            minLength={8}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-critical">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-md bg-primary px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Criando conta...' : 'Criar conta'}
        </button>
      </form>
      <p className="mt-6 text-sm text-inkMuted">
        Já tem conta?{' '}
        <Link href={buildAuthUrl('/entrar', returnTo)} className="text-primary underline">
          Entrar
        </Link>
      </p>
    </main>
  );
}
