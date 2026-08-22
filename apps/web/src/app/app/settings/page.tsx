'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Button, Card, ErrorState, Input, LoadingState, PageHeader } from '@/components/ui';

interface MyProfile {
  id: string;
  displayName: string;
  email: string;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function loadProfile() {
    setLoading(true);
    setError(null);
    apiFetch<MyProfile>('/accounts/me/profile')
      .then((data) => {
        setProfile(data);
        setDisplayName(data.displayName);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar seu perfil.'))
      .finally(() => setLoading(false));
  }

  useEffect(loadProfile, []);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await apiFetch<MyProfile>('/accounts/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ displayName }),
      });
      setProfile(updated);
      setDisplayName(updated.displayName);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar seu nome.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Configurações" description="Controle como a ZELII organiza, lembra e explica informações da família." />
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card className="sm:col-span-2">
          <h2 className="font-semibold text-ink">Meu perfil</h2>
          <p className="mt-2 text-sm text-inkMuted">Este é o nome exibido para você na família selecionada.</p>
          {loading && <div className="mt-5"><LoadingState label="Carregando seu perfil…" /></div>}
          {!loading && error && !profile && <div className="mt-5"><ErrorState description={error} onRetry={loadProfile} /></div>}
          {!loading && profile && (
            <form onSubmit={saveProfile} className="mt-5 max-w-lg space-y-4">
              <Input
                label="Seu nome"
                value={displayName}
                minLength={2}
                maxLength={150}
                required
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  setSaved(false);
                }}
              />
              <Input label="E-mail da conta" value={profile.email} disabled />
              {error && <p role="alert" className="text-sm text-critical">{error}</p>}
              {saved && <p role="status" className="text-sm text-success">Nome atualizado com sucesso.</p>}
              <Button type="submit" disabled={saving || displayName.trim().length < 2 || displayName.trim() === profile.displayName}>
                {saving ? 'Salvando…' : 'Salvar nome'}
              </Button>
            </form>
          )}
        </Card>
        <Link href="/app/ai" className="rounded-xl focus:outline-none focus:ring-2 focus:ring-primary">
          <Card className="h-full transition-colors hover:border-primary/40">
            <h2 className="font-semibold text-ink">Memória e IA da ZELII</h2>
            <p className="mt-2 text-sm text-inkMuted">Revise fatos lembrados, corrija, esqueça, exporte e desative a memória personalizada.</p>
          </Card>
        </Link>
        <Card>
          <h2 className="font-semibold text-ink">Notificações e dispositivos</h2>
          <p className="mt-2 text-sm text-inkMuted">Preferências adicionais serão disponibilizadas gradualmente.</p>
        </Card>
      </div>
    </div>
  );
}
