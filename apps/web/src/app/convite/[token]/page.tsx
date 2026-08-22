'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { buildAuthUrl } from '@/lib/auth-return';
import { setStoredTenantId } from '@/lib/tenant-context';
import { getSupabaseBrowserClient } from '@/lib/supabase-client';
import { Button, Card, ErrorState, Input, LoadingState } from '@/components/ui';

interface InvitationPreview {
  family_unit_name: string;
  invited_by_name: string;
  proposed_role: string;
  expires_at: string;
}
export default function InvitationPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params.token;
  const returnTo = `/convite/${token}`;
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      setSignedIn(!!session);
      setDisplayName((session?.user.user_metadata?.display_name as string | undefined) ?? '');
      if (!session) return;
      apiFetch<InvitationPreview>(`/invitations/${token}`)
        .then(setPreview)
        .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível abrir o convite.'));
    });
  }, [token]);

  async function accept() {
    if (!displayName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ tenantId: string }>(`/invitations/${token}/accept`, {
        method: 'POST',
        body: JSON.stringify({ displayName }),
      });
      setStoredTenantId(result.tenantId);
      router.push('/app/today');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar na família.');
    } finally {
      setBusy(false);
    }
  }

  if (signedIn === null) {
    return <main className="flex min-h-screen items-center justify-center"><LoadingState label="Abrindo convite…" /></main>;
  }

  if (!signedIn) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg items-center px-6 py-16">
        <Card className="w-full">
          <p className="text-sm font-medium text-primary">Convite ZELII</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">Entre para conectar sua família</h1>
          <p className="mt-3 text-sm text-inkMuted">
            Use o mesmo e-mail que recebeu o convite. Se você já criou uma conta, ela será mantida e conectada à família — nenhum dado é mesclado sem sua confirmação.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href={buildAuthUrl('/entrar', returnTo)} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-primary px-4 font-medium text-white">
              Entrar e aceitar
            </Link>
            <Link href={buildAuthUrl('/cadastro', returnTo)} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-border bg-surface px-4 font-medium text-ink">
              Criar conta
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  if (error && !preview) {
    return <main className="mx-auto max-w-lg px-6 py-16"><ErrorState title="Não foi possível abrir o convite" description={error} /></main>;
  }

  if (!preview) {
    return <main className="flex min-h-screen items-center justify-center"><LoadingState label="Validando convite…" /></main>;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-6 py-16">
      <Card className="w-full">
        <p className="text-sm font-medium text-primary">Convite para cuidar em conjunto</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">{preview.invited_by_name} convidou você para {preview.family_unit_name}</h1>
        <p className="mt-3 text-sm text-inkMuted">
          Ao aceitar, você poderá ver as agendas compartilhadas dos filhos, assumir tarefas e organizar responsabilidades junto com a família.
        </p>
        <Input
          className="mt-6"
          label="Como a ZELII deve chamar você"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Seu nome"
        />
        {error && <p className="mt-3 text-sm text-critical">{error}</p>}
        <Button className="mt-5 w-full" onClick={accept} disabled={busy || !displayName.trim()}>
          {busy ? 'Conectando…' : 'Aceitar e entrar na família'}
        </Button>
        <p className="mt-3 text-center text-xs text-inkMuted">O convite só funciona com o e-mail ao qual foi enviado.</p>
      </Card>
    </main>
  );
}
