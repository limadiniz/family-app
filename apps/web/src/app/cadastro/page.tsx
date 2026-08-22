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
  const [signUpRequested, setSignUpRequested] = useState(false);

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
      // With e-mail confirmation enabled Supabase intentionally returns no
      // session. For an existing address it may also return an obfuscated user
      // instead of revealing that the account exists. The UI must therefore be
      // neutral: Supabase's unique e-mail constraint prevents a duplicate, and
      // bootstrap happens only after a confirmed login.
      if (!data.session) {
        setSignUpRequested(true);
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

  if (signUpRequested) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <p className="text-sm font-medium text-primary">Solicitação recebida</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Verifique sua caixa de entrada</h1>
        <p className="mt-3 text-sm text-inkMuted">
          Se <strong className="text-ink">{email}</strong> ainda não estiver cadastrado, enviaremos um link de confirmação. Depois de confirmar, você poderá continuar de onde parou.
        </p>
        <div className="mt-5 rounded-lg border border-border bg-surfaceMuted p-4 text-sm text-inkMuted">
          Se você já usa a ZELII com esse e-mail, nenhum novo cadastro foi criado. Entre na conta existente ou recupere sua senha.
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <Link href={buildAuthUrl('/entrar', returnTo)} className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 font-medium text-white">
            Entrar na minha conta
          </Link>
          <Link href="/recuperar-senha" className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-surface px-4 font-medium text-ink">
            Esqueci minha senha
          </Link>
          <button
            type="button"
            className="min-h-11 text-sm font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => {
              setPassword('');
              setSignUpRequested(false);
            }}
          >
            Usar outro e-mail
          </button>
        </div>
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
