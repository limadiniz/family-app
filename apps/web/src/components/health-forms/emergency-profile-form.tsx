'use client';

import { useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Input, Button, ErrorState, FormActions } from '@/components/ui';

interface EmergencyContact {
  name: string;
  relationship?: string;
  phone: string;
}

export interface EmergencyProfileData {
  blood_type: string | null;
  allergies: string[];
  conditions: string[];
  critical_medications: string[];
  health_plan_name: string | null;
  health_plan_card_number: string | null;
  pediatrician_name: string | null;
  preferred_hospital: string | null;
  emergency_contacts: EmergencyContact[];
}

function toList(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const EMPTY_CONTACT: EmergencyContact = { name: '', relationship: '', phone: '' };

/**
 * POST /persons/:id/emergency-profile (upsert, escopo MANAGE:EMERGENCY —
 * mais restrito que o VIEW usado pra ler a página). O endpoint já
 * existia; até este formulário, a página só sabia mostrar o perfil, nunca
 * criar um — por isso o EmptyState de /app/emergency nunca tinha um
 * caminho de próxima ação.
 */
export function EmergencyProfileForm({
  personId,
  initial,
  onSaved,
  onCancel,
}: {
  personId: string;
  initial: EmergencyProfileData | null;
  onSaved: (data: EmergencyProfileData) => void;
  onCancel: () => void;
}) {
  const [bloodType, setBloodType] = useState(initial?.blood_type ?? '');
  const [allergies, setAllergies] = useState((initial?.allergies ?? []).join(', '));
  const [conditions, setConditions] = useState((initial?.conditions ?? []).join(', '));
  const [criticalMedications, setCriticalMedications] = useState((initial?.critical_medications ?? []).join(', '));
  const [healthPlanName, setHealthPlanName] = useState(initial?.health_plan_name ?? '');
  const [healthPlanCardNumber, setHealthPlanCardNumber] = useState(initial?.health_plan_card_number ?? '');
  const [pediatricianName, setPediatricianName] = useState(initial?.pediatrician_name ?? '');
  const [preferredHospital, setPreferredHospital] = useState(initial?.preferred_hospital ?? '');
  const [contacts, setContacts] = useState<EmergencyContact[]>(
    initial?.emergency_contacts?.length ? initial.emergency_contacts : [{ ...EMPTY_CONTACT }],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function updateContact(index: number, patch: Partial<EmergencyContact>) {
    setContacts((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function addContact() {
    setContacts((prev) => [...prev, { ...EMPTY_CONTACT }]);
  }

  function removeContact(index: number) {
    setContacts((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const cleanContacts = contacts
        .map((c) => ({ name: c.name.trim(), relationship: c.relationship?.trim() || undefined, phone: c.phone.trim() }))
        .filter((c) => c.name && c.phone);
      const data = await apiFetch<EmergencyProfileData>(`/persons/${personId}/emergency-profile`, {
        method: 'POST',
        body: JSON.stringify({
          bloodType: bloodType.trim() || undefined,
          allergies: toList(allergies),
          conditions: toList(conditions),
          criticalMedications: toList(criticalMedications),
          healthPlanName: healthPlanName.trim() || undefined,
          healthPlanCardNumber: healthPlanCardNumber.trim() || undefined,
          pediatricianName: pediatricianName.trim() || undefined,
          preferredHospital: preferredHospital.trim() || undefined,
          emergencyContacts: cleanContacts,
        }),
      });
      onSaved(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar as informações de emergência.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label="Tipo sanguíneo" value={bloodType} onChange={(e) => setBloodType(e.target.value)} placeholder="Ex: O+" />
        <Input label="Alergias" hint="Separe por vírgula." value={allergies} onChange={(e) => setAllergies(e.target.value)} />
        <Input label="Condições" hint="Separe por vírgula." value={conditions} onChange={(e) => setConditions(e.target.value)} />
        <Input
          label="Medicamentos críticos"
          hint="Separe por vírgula — os que precisam ser conhecidos em uma emergência."
          value={criticalMedications}
          onChange={(e) => setCriticalMedications(e.target.value)}
        />
        <Input label="Plano de saúde" value={healthPlanName} onChange={(e) => setHealthPlanName(e.target.value)} />
        <Input label="Número da carteirinha" value={healthPlanCardNumber} onChange={(e) => setHealthPlanCardNumber(e.target.value)} />
        <Input label="Pediatra" value={pediatricianName} onChange={(e) => setPediatricianName(e.target.value)} />
        <Input label="Hospital preferencial" value={preferredHospital} onChange={(e) => setPreferredHospital(e.target.value)} />

        <div>
          <p className="mb-2 text-sm font-medium text-ink">Contatos de emergência</p>
          <div className="flex flex-col gap-3">
            {contacts.map((contact, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-end">
                <Input
                  label="Nome"
                  className="flex-1"
                  value={contact.name}
                  onChange={(e) => updateContact(i, { name: e.target.value })}
                />
                <Input
                  label="Relação (opcional)"
                  className="flex-1"
                  value={contact.relationship ?? ''}
                  onChange={(e) => updateContact(i, { relationship: e.target.value })}
                  placeholder="Ex: Avó"
                />
                <Input
                  label="Telefone"
                  className="flex-1"
                  value={contact.phone}
                  onChange={(e) => updateContact(i, { phone: e.target.value })}
                  placeholder="(11) 90000-0000"
                />
                {contacts.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeContact(i)}>
                    Remover
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={addContact} className="mt-2">
            + Contato
          </Button>
        </div>

        {error && <ErrorState description={error} />}
        <FormActions submitLabel="Salvar informações de emergência" onCancel={onCancel} busy={busy} />
      </form>
    </Card>
  );
}
