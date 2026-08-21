'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';

interface Person {
  id: string;
  display_name: string;
}

interface EmergencyProfile {
  blood_type: string | null;
  allergies: string[];
  conditions: string[];
  critical_medications: string[];
  pediatrician_name: string | null;
  preferred_hospital: string | null;
  emergency_contacts: Array<{ name: string; phone: string; relationship?: string }>;
}

/**
 * Emergency Profile (§41-44). Every load of this page hits GET
 * /persons/:id/emergency-profile, which is ALWAYS audited server-side —
 * allowed or denied — regardless of what's shown here.
 */
export default function EmergencyPage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [profile, setProfile] = useState<EmergencyProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Person[]>('/persons')
      .then((list) => {
        setPeople(list);
        if (list.length > 0) setSelected(list[0].id);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setError(null);
    setProfile(null);
    apiFetch<EmergencyProfile | null>(`/persons/${selected}/emergency-profile`)
      .then(setProfile)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Erro inesperado.'));
  }, [selected]);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Informações de Emergência</h1>
        {people && people.length > 1 && (
          <select
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
            value={selected ?? ''}
            onChange={(e) => setSelected(e.target.value)}
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="mt-1 text-sm text-inkMuted">
        Acesso rápido a alergias, medicamentos, plano de saúde e contatos — todo acesso a esta página é registrado.
      </p>

      {error && <p className="mt-6 text-sm text-critical">{error}</p>}

      {profile && (
        <div className="mt-8 rounded-lg border border-border bg-surface p-6">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-inkMuted">Tipo sanguíneo</dt>
              <dd className="text-ink">{profile.blood_type ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-inkMuted">Alergias</dt>
              <dd className="text-ink">{profile.allergies?.length ? profile.allergies.join(', ') : '—'}</dd>
            </div>
            <div>
              <dt className="text-inkMuted">Condições</dt>
              <dd className="text-ink">{profile.conditions?.length ? profile.conditions.join(', ') : '—'}</dd>
            </div>
            <div>
              <dt className="text-inkMuted">Medicamentos críticos</dt>
              <dd className="text-ink">{profile.critical_medications?.length ? profile.critical_medications.join(', ') : '—'}</dd>
            </div>
            <div>
              <dt className="text-inkMuted">Pediatra</dt>
              <dd className="text-ink">{profile.pediatrician_name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-inkMuted">Hospital preferencial</dt>
              <dd className="text-ink">{profile.preferred_hospital ?? '—'}</dd>
            </div>
          </dl>
          {profile.emergency_contacts?.length > 0 && (
            <div className="mt-4">
              <p className="text-inkMuted text-sm">Contatos de emergência</p>
              <ul className="mt-2 space-y-1">
                {profile.emergency_contacts.map((c, i) => (
                  <li key={i} className="text-sm text-ink">
                    {c.name} {c.relationship ? `(${c.relationship})` : ''} — {c.phone}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {profile === null && !error && (
        <p className="mt-8 text-sm text-inkMuted">Nenhuma informação de emergência cadastrada ainda para esta pessoa.</p>
      )}
    </div>
  );
}
