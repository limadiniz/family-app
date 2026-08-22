'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError, isPermissionDenied } from '@/lib/api-client';
import { PageHeader, Select, Button, LoadingState, ErrorState, EmptyState, PermissionDeniedState, SuccessToast } from '@/components/ui';
import { EmergencyProfileForm, type EmergencyProfileData } from '@/components/health-forms/emergency-profile-form';

interface Person {
  id: string;
  display_name: string;
}

type EmergencyProfile = EmergencyProfileData;

/**
 * Emergency Profile (§41-44). Every load of this page hits GET
 * /persons/:id/emergency-profile, which is ALWAYS audited server-side —
 * allowed or denied — regardless of what's shown here. Editing goes
 * through POST /persons/:id/emergency-profile (MANAGE:EMERGENCY — a
 * narrower scope than the VIEW used to read the page), an endpoint that
 * existed since Health Core but had no form until now: before this, the
 * EmptyState below had no path to actually fill the profile in.
 */
export default function EmergencyPage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [profile, setProfile] = useState<EmergencyProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function loadPeople() {
    setError(null);
    apiFetch<Person[]>('/persons')
      .then((list) => {
        setPeople(list);
        if (list.length > 0) setSelected(list[0].id);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(loadPeople, []);

  useEffect(() => {
    if (!selected) return;
    setError(null);
    setPermissionDenied(false);
    setProfile(null);
    setEditing(false);
    setLoadingProfile(true);
    apiFetch<EmergencyProfile | null>(`/persons/${selected}/emergency-profile`)
      .then(setProfile)
      .catch((err) => {
        if (isPermissionDenied(err)) {
          setPermissionDenied(true);
        } else {
          setError(err instanceof ApiError ? err.message : 'Erro inesperado.');
        }
      })
      .finally(() => setLoadingProfile(false));
  }, [selected]);

  return (
    <div className="max-w-2xl">
      {toast && <SuccessToast message={toast} onDismiss={() => setToast(null)} />}

      <PageHeader
        title="Informações de Emergência"
        description="Acesso rápido a alergias, medicamentos, plano de saúde e contatos — todo acesso a esta página é registrado."
        actions={
          people && people.length > 1 ? (
            <Select className="w-auto" value={selected ?? ''} onChange={(e) => setSelected(e.target.value)}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />

      {error && (
        <div className="mt-6">
          <ErrorState description={error} onRetry={loadPeople} />
        </div>
      )}

      {!error && loadingProfile && <LoadingState label="Carregando informações de emergência…" />}

      {!error && !loadingProfile && permissionDenied && (
        <div className="mt-8">
          <PermissionDeniedState description="Você não tem acesso às informações de emergência desta pessoa." />
        </div>
      )}

      {!error && !permissionDenied && editing && selected && (
        <div className="mt-8">
          <EmergencyProfileForm
            personId={selected}
            initial={profile}
            onSaved={(data) => {
              setProfile(data);
              setEditing(false);
              setToast('Informações de emergência salvas.');
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}

      {!error && !permissionDenied && !editing && profile && (
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
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => setEditing(true)}>
            Editar informações de emergência
          </Button>
        </div>
      )}

      {!error && !loadingProfile && !permissionDenied && !editing && profile === null && selected && (
        <div className="mt-8">
          <EmptyState title="Nenhuma informação de emergência cadastrada" description="Ainda não há dados de emergência para esta pessoa." />
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setEditing(true)}>
            Cadastrar informações de emergência
          </Button>
        </div>
      )}
    </div>
  );
}
