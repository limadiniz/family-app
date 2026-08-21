'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';

/**
 * Onboarding wizard (§85), steps 4-8 (FamilyUnit -> dependente ->
 * relacionamento -> residência -> notificações -> Home). Steps 1-3
 * already happened on /cadastro. Kept as a single guided page rather
 * than separate routes so the "poucos toques" UX goal (§82) holds even
 * on mobile web.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [familyUnitId, setFamilyUnitId] = useState<string | null>(null);
  const [familyUnitName, setFamilyUnitName] = useState('');
  const [childName, setChildName] = useState('');
  const [childBirthDate, setChildBirthDate] = useState('');
  const [childPersonId, setChildPersonId] = useState<string | null>(null);
  const [residenceLabel, setResidenceLabel] = useState('Casa');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ bootstrapped: boolean }>('/onboarding/status').catch(() => undefined);
  }, []);

  async function createFamilyUnit() {
    setError(null);
    try {
      const unit = await apiFetch<{ id: string }>('/family-units', {
        method: 'POST',
        body: JSON.stringify({ name: familyUnitName || 'Minha família' }),
      });
      setFamilyUnitId(unit.id);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar família.');
    }
  }

  async function createDependent() {
    if (!familyUnitId) return;
    setError(null);
    try {
      const child = await apiFetch<{ id: string }>('/dependents', {
        method: 'POST',
        body: JSON.stringify({ displayName: childName, birthDate: childBirthDate || undefined, familyUnitId }),
      });
      setChildPersonId(child.id);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar dependente.');
    }
  }

  async function createResidence() {
    setError(null);
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
      router.push('/app/today');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar residência.');
    }
  }

  return (
    <main className="mx-auto max-w-lg py-16">
      <p className="text-sm text-inkMuted">Etapa {step} de 3</p>
      {step === 1 && (
        <>
          <h1 className="mt-2 text-2xl font-semibold text-ink">Crie sua unidade familiar</h1>
          <input
            value={familyUnitName}
            onChange={(e) => setFamilyUnitName(e.target.value)}
            placeholder="Ex: Família da Ana"
            className="mt-4 w-full rounded-md border border-border bg-surface px-3 py-2"
          />
          <button onClick={createFamilyUnit} className="mt-4 rounded-md bg-primary px-4 py-2 font-medium text-white">
            Continuar
          </button>
        </>
      )}
      {step === 2 && (
        <>
          <h1 className="mt-2 text-2xl font-semibold text-ink">Adicione o primeiro dependente</h1>
          <input
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            placeholder="Nome da criança"
            className="mt-4 w-full rounded-md border border-border bg-surface px-3 py-2"
          />
          <input
            type="date"
            value={childBirthDate}
            onChange={(e) => setChildBirthDate(e.target.value)}
            className="mt-3 w-full rounded-md border border-border bg-surface px-3 py-2"
          />
          <button onClick={createDependent} className="mt-4 rounded-md bg-primary px-4 py-2 font-medium text-white">
            Continuar
          </button>
        </>
      )}
      {step === 3 && (
        <>
          <h1 className="mt-2 text-2xl font-semibold text-ink">Primeira residência</h1>
          <input
            value={residenceLabel}
            onChange={(e) => setResidenceLabel(e.target.value)}
            placeholder="Ex: Casa da mãe"
            className="mt-4 w-full rounded-md border border-border bg-surface px-3 py-2"
          />
          <button onClick={createResidence} className="mt-4 rounded-md bg-primary px-4 py-2 font-medium text-white">
            Concluir e ir para o Hoje
          </button>
        </>
      )}
      {error && <p className="mt-4 text-sm text-critical">{error}</p>}
    </main>
  );
}
