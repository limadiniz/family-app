'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabase-client';

type Status = 'checking' | 'ready' | 'invalid' | 'done';

/**
 * Segunda etapa do reset de senha — aberta a partir do link que o Supabase
 * manda por e-mail (`resetPasswordForEmail` em `/recuperar-senha`, com
 * `redirectTo` apontando pra cá). O Supabase volta com um token de
 * recuperação na URL; o client-side já processa isso sozinho
 * (`detectSessionInUrl`, ligado por padrão) e dispara o evento
 * `PASSWORD_RECOVERY` — é esse evento que confirma que dá pra trocar a
 * senha, não a mera presença da página.
 */
export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setStatus('ready');
    });

    // Se o evento já disparou antes deste efeito montar (ex.: navegação
    // rápida), uma sessão válida já existe — trata como pronto também.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setStatus((s) => (s === 'checking' ? 'ready' : s));
    });

    const timeout = setTimeout(() => {
      setStatus((s) => (s === 'checking' ? 'invalid' : s));
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não são iguais.');
      return;
    }
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setStatus('done');
      setTimeout(() => router.push('/app/today'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar sua senha agora.');
    } finally {
      setLoading(false);
    }
  }

  if (status === 'checking') {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 text-inkMuted">Carregando...</main>
    );
  }

  if (status === 'invalid') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-ink">Link inválido ou expirado</h1>
        <p className="mt-3 text-sm leading-relaxed text-inkMuted">
          Esse link de redefinição de senha não é mais válido. Peça um novo.
        </p>
        <Link
          href="/recuperar-senha"
          className="mt-8 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 font-medium text-white hover:opacity-90"
        >
          Pedir novo link
        </Link>
      </main>
    );
  }

  if (status === 'done') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-ink">Senha atualizada</h1>
        <p className="mt-3 text-sm text-inkMuted">Redirecionando...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold text-ink">Criar nova senha</h1>
      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink">
          Nova senha
          <input
            required
            minLength={8}
            type="password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          Confirmar nova senha
          <input
            required
            minLength={8}
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-critical">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-2 min-h-11 rounded-md bg-primary px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Salvando...' : 'Salvar nova senha'}
        </button>
      </form>
    </main>
  );
}
