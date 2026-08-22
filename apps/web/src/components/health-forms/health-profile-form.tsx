'use client';

import { useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Input, ErrorState, FormActions } from '@/components/ui';

export interface HealthProfileData {
  blood_type: string | null;
  allergies: string[];
  conditions: string[];
  health_plan_name: string | null;
  health_plan_card_number: string | null;
}

function toList(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * POST /persons/:id/health-profile (upsert) — o mesmo endpoint que já
 * existia e alimenta `getHealthProfile`, sem consumidor até agora. Listas
 * (alergias/condições) entram como texto separado por vírgula — mesmo
 * padrão de entrada simples usado no resto do P1, sem um componente de
 * "tags" dedicado, que seria investimento maior que o proporcional aqui.
 */
export function HealthProfileForm({
  personId,
  initial,
  onSaved,
  onCancel,
}: {
  personId: string;
  initial: HealthProfileData | null;
  onSaved: (data: HealthProfileData) => void;
  onCancel: () => void;
}) {
  const [bloodType, setBloodType] = useState(initial?.blood_type ?? '');
  const [allergies, setAllergies] = useState((initial?.allergies ?? []).join(', '));
  const [conditions, setConditions] = useState((initial?.conditions ?? []).join(', '));
  const [healthPlanName, setHealthPlanName] = useState(initial?.health_plan_name ?? '');
  const [healthPlanCardNumber, setHealthPlanCardNumber] = useState(initial?.health_plan_card_number ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await apiFetch<HealthProfileData>(`/persons/${personId}/health-profile`, {
        method: 'POST',
        body: JSON.stringify({
          bloodType: bloodType.trim() || undefined,
          allergies: toList(allergies),
          conditions: toList(conditions),
          healthPlanName: healthPlanName.trim() || undefined,
          healthPlanCardNumber: healthPlanCardNumber.trim() || undefined,
        }),
      });
      onSaved(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar o perfil de saúde.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label="Tipo sanguíneo" value={bloodType} onChange={(e) => setBloodType(e.target.value)} placeholder="Ex: O+" />
        <Input
          label="Alergias"
          hint="Separe por vírgula."
          value={allergies}
          onChange={(e) => setAllergies(e.target.value)}
          placeholder="Ex: Amoxicilina, Amendoim"
        />
        <Input
          label="Condições"
          hint="Separe por vírgula."
          value={conditions}
          onChange={(e) => setConditions(e.target.value)}
          placeholder="Ex: Asma"
        />
        <Input label="Plano de saúde" value={healthPlanName} onChange={(e) => setHealthPlanName(e.target.value)} />
        <Input
          label="Número da carteirinha"
          value={healthPlanCardNumber}
          onChange={(e) => setHealthPlanCardNumber(e.target.value)}
        />
        {error && <ErrorState description={error} />}
        <FormActions submitLabel="Salvar perfil de saúde" onCancel={onCancel} busy={busy} />
      </form>
    </Card>
  );
}
