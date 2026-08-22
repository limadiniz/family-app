'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabase-client';

/**
 * Pedido de reset de senha. Mensagem de sucesso é a MESMA independente de o
 * e-mail existir ou não na base — não dá pra confirmar/negar a existência
 * de uma conta por esse formulário (evita enumeração de e-mails).
 */
export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      if (resetError) throw resetError;
      setSent(true);
    } catch (err) {
      // Erros de rede/config aparecem aqui; um e-mail simplesmente
      // inexistente NÃO cai neste catch — o Supabase responde sucesso
      // igual, de propósito.
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o link agora. Tente de novo.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-ink">Confira seu e-mail</h1>
        <p className="mt-3 text-sm leading-relaxed text-inkMuted">
          Se <strong className="text-ink">{email}</strong> estiver cadastrado, você vai receber um link para
          redefinir sua senha em instantes.
        </p>
        <Link href="/entrar" className="mt-8 text-sm font-medium text-primary underline-offset-2 hover:underline">
          Voltar para o login
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold text-ink">Recuperar senha</h1>
      <p className="mt-2 text-sm text-inkMuted">
        Digite o e-mail da sua conta. Vamos mandar um link para você criar uma senha nova.
      </p>
      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink">
          E-mail
          <input
            required
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-critical">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-2 min-h-11 rounded-md bg-primary px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Enviando...' : 'Enviar link'}
        </button>
      </form>
      <Link
        href="/entrar"
        className="mt-6 text-center text-sm font-medium text-primary underline-offset-2 hover:underline"
      >
        Voltar para o login
      </Link>
    </main>
  );
}
