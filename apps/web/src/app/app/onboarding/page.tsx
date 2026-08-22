'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Input, Button, Card, LoadingState } from '@/components/ui';
import { ONBOARDING_FALLBACK_RETURN_TO, resolveSafeReturnTo } from '@/lib/onboarding-redirect';

const TOTAL_STEPS = 5;

/**
 * Onboarding orientado a primeiro valor (§9 do prompt mestre): as etapas
 * 1-3 continuam criando a estrutura real (FamilyUnit → dependente →
 * residência, via os mesmos endpoints de sempre), mas o fluxo não
 * termina num redirect silencioso pro Hoje vazio. O passo 4 leva a
 * pessoa a colar a primeira coisa real na Caixa de Entrada — o mesmo
 * POST /capture/items usado em apps/web/src/app/app/capture/page.tsx —
 * pra ela ver a ZELII propor algo concreto ainda dentro do onboarding,
 * em vez de descobrir isso sozinha depois. Nenhum endpoint novo: só uma
 * ordem que entrega o "aha" mais cedo.
 */
export default function OnboardingPage() {
  // useSearchParams() requires a Suspense boundary during static
  // generation (Next.js App Router) — without it `next build` fails this
  // route. The fallback only ever flashes for a static-render instant;
  // client navigation has the value immediately.
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-lg py-16">
          <LoadingState label="Carregando…" />
        </main>
      }
    >
      <OnboardingWizard />
    </Suspense>
  );
}

function OnboardingWizard() {
  const router = useRouter();
  // §8: where the gate intercepted the user from, if anywhere — validated
  // against the internal allowlist (never trusted raw; see
  // lib/onboarding-redirect.ts). Read once at mount: the value doesn't
  // change across this page's own lifetime, and re-reading it after the
  // wizard has advanced would be pointless (the URL itself isn't touched
  // by the wizard's internal step navigation, only by the initial link).
  const searchParams = useSearchParams();
  const [returnTo] = useState(() => resolveSafeReturnTo(searchParams.get('returnTo')));
  const [step, setStep] = useState(1);
  const [familyUnitId, setFamilyUnitId] = useState<string | null>(null);
  const [familyUnitName, setFamilyUnitName] = useState('');
  const [childName, setChildName] = useState('');
  const [childBirthDate, setChildBirthDate] = useState('');
  const [childPersonId, setChildPersonId] = useState<string | null>(null);
  const [residenceLabel, setResidenceLabel] = useState('Casa');
  const [captureText, setCaptureText] = useState('');
  const [captureSent, setCaptureSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createFamilyUnit() {
    setError(null);
    setBusy(true);
    try {
      const unit = await apiFetch<{ id: string }>('/family-units', {
        method: 'POST',
        body: JSON.stringify({ name: familyUnitName || 'Minha família' }),
      });
      setFamilyUnitId(unit.id);
      setStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao criar família.');
    } finally {
      setBusy(false);
    }
  }

  async function createDependent() {
    if (!familyUnitId) return;
    setError(null);
    setBusy(true);
    try {
      const child = await apiFetch<{ id: string }>('/dependents', {
        method: 'POST',
        body: JSON.stringify({ displayName: childName, birthDate: childBirthDate || undefined, familyUnitId }),
      });
      setChildPersonId(child.id);
      setStep(3);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao adicionar dependente.');
    } finally {
      setBusy(false);
    }
  }

  async function createResidence() {
    setError(null);
    setBusy(true);
    try {
      const residence = await apiFetch<{ id: string }>('/residences', {
        method: 'POST',
        body: JSON.stringify({ label: residenceLabel }),
      });
      if (childPersonId) {
        await apiFetch('/residence-memberships', {
          method: 'POST',
          body: JSON.stringify({ residenceId: residence.id, personId: childPersonId, isPrimary: true }),
        });
      }
      setStep(4);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao criar residência.');
    } finally {
      setBusy(false);
    }
  }

  async function sendFirstCapture() {
    if (!captureText.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/capture/items', { method: 'POST', body: JSON.stringify({ source: 'TEXT', rawText: captureText }) });
      setCaptureSent(true);
      setStep(5);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao enviar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg py-16">
      <p className="text-sm text-inkMuted">Etapa {step} de {TOTAL_STEPS}</p>
      <div className="mt-2 flex gap-1.5" aria-hidden="true">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? 'bg-primary' : 'bg-surfaceMuted'}`} />
        ))}
      </div>

      {step === 1 && (
        <Card className="mt-6">
          <h1 className="text-2xl font-semibold text-ink">Vamos organizar sua família</h1>
          <p className="mt-2 text-sm text-inkMuted">Leva menos de 2 minutos. Comece dando um nome à sua unidade familiar.</p>
          <Input
            className="mt-4"
            value={familyUnitName}
            onChange={(e) => setFamilyUnitName(e.target.value)}
            placeholder="Ex: Família da Ana"
          />
          <Button onClick={createFamilyUnit} disabled={busy} className="mt-4">
            Continuar
          </Button>
        </Card>
      )}

      {step === 2 && (
        <Card className="mt-6">
          <h1 className="text-2xl font-semibold text-ink">Quem a ZELII vai ajudar a cuidar?</h1>
          <p className="mt-2 text-sm text-inkMuted">Adicione o primeiro dependente — dá pra adicionar mais depois.</p>
          <Input className="mt-4" value={childName} onChange={(e) => setChildName(e.target.value)} placeholder="Nome da criança" />
          <Input
            className="mt-3"
            type="date"
            label="Data de nascimento (opcional)"
            value={childBirthDate}
            onChange={(e) => setChildBirthDate(e.target.value)}
          />
          <Button onClick={createDependent} disabled={busy || !childName.trim()} className="mt-4">
            Continuar
          </Button>
        </Card>
      )}

      {step === 3 && (
        <Card className="mt-6">
          <h1 className="text-2xl font-semibold text-ink">Onde essa criança mora?</h1>
          <p className="mt-2 text-sm text-inkMuted">Cada residência pode ter seu próprio endereço — útil se há mais de uma casa.</p>
          <Input className="mt-4" value={residenceLabel} onChange={(e) => setResidenceLabel(e.target.value)} placeholder="Ex: Casa da mãe" />
          <Button onClick={createResidence} disabled={busy || !residenceLabel.trim()} className="mt-4">
            Continuar
          </Button>
        </Card>
      )}

      {step === 4 && (
        <Card className="mt-6">
          <h1 className="text-2xl font-semibold text-ink">Agora veja a ZELII em ação</h1>
          <p className="mt-2 text-sm text-inkMuted">
            Cole um comunicado da escola, uma mensagem ou um lembrete real — a ZELII vai propor um evento ou tarefa a partir
            disso, pronto pra você revisar no próximo passo.
          </p>
          <textarea
            className="mt-4 w-full resize-none rounded-md border border-border bg-surface p-3 text-sm text-ink"
            rows={3}
            placeholder="Ex.: Reunião de pais dia 25/08 às 19h."
            value={captureText}
            onChange={(e) => setCaptureText(e.target.value)}
          />
          <div className="mt-4 flex gap-2">
            <Button onClick={sendFirstCapture} disabled={busy || !captureText.trim()}>
              Enviar e continuar
            </Button>
            <Button variant="ghost" onClick={() => setStep(5)} disabled={busy}>
              Pular por enquanto
            </Button>
          </div>
        </Card>
      )}

      {step === 5 && (() => {
        // §8: honor where the user was actually trying to go. Only takes
        // priority over the capture "aha" nudge when the gate genuinely
        // intercepted a specific other page — if returnTo is just the
        // default (nobody was intercepted, or it fell back), the existing
        // "go see your first capture" flow stays the primary CTA.
        const hadExplicitReturnTo = returnTo !== ONBOARDING_FALLBACK_RETURN_TO;
        const primaryDestination = hadExplicitReturnTo ? returnTo : captureSent ? '/app/capture' : '/app/today';
        const primaryLabel = hadExplicitReturnTo
          ? 'Continuar'
          : captureSent
            ? 'Revisar na Caixa de Entrada'
            : 'Ir para o Hoje';
        const showTodaySecondary = primaryDestination !== '/app/today';

        return (
          <Card className="mt-6">
            <h1 className="text-2xl font-semibold text-ink">Tudo pronto</h1>
            <p className="mt-2 text-sm text-inkMuted">
              {captureSent
                ? 'A ZELII já está processando o que você colou — vai te esperar na Caixa de Entrada, pronto pra revisar e confirmar.'
                : 'Sua família está criada. A qualquer momento você pode colar algo na Caixa de Entrada pra ver a ZELII em ação.'}
            </p>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => router.push(primaryDestination)}>{primaryLabel}</Button>
              {showTodaySecondary && (
                <Button variant="secondary" onClick={() => router.push('/app/today')}>
                  Ir para o Hoje
                </Button>
              )}
            </div>
          </Card>
        );
      })()}

      {error && <p className="mt-4 text-sm text-critical">{error}</p>}
    </main>
  );
}
