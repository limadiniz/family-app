'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError, isPermissionDenied } from '@/lib/api-client';
import {
  PageHeader,
  Select,
  Input,
  Button,
  Card,
  LoadingState,
  ErrorState,
  EmptyState,
  PermissionDeniedState,
  SuccessToast,
  FormActions,
} from '@/components/ui';
import { HealthProfileForm, type HealthProfileData } from '@/components/health-forms/health-profile-form';

interface Person {
  id: string;
  display_name: string;
}

interface Medication {
  id: string;
  name: string;
  dosage_text: string | null;
  active: boolean;
}

const ADMINISTRATION_ACTIONS: Array<{ status: string; label: string }> = [
  { status: 'TAKEN', label: 'Tomou' },
  { status: 'MISSED', label: 'Perdeu' },
  { status: 'SKIPPED', label: 'Pulou' },
];

/**
 * "Saúde" (§4, dado sensível — proteção reforçada): perfil de saúde
 * (POST/GET /persons/:id/health-profile) e medicamentos ativos
 * (POST/GET /medications, /persons/:id/medications), registrando doses
 * via POST /medications/administrations. Todo endpoint aqui já existia
 * (Health Core, fases anteriores do projeto) sem nenhum consumidor de
 * frontend — esta página é a primeira tela que os usa.
 *
 * HEALTH e MEDICATION são domínios de autorização independentes no
 * Policy Engine: uma negação em um não implica negação no outro, então
 * as duas seções tratam permissão separadamente.
 */
export default function HealthPage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [peopleError, setPeopleError] = useState<string | null>(null);

  const [profile, setProfile] = useState<HealthProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profilePermissionDenied, setProfilePermissionDenied] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);

  const [medications, setMedications] = useState<Medication[] | null>(null);
  const [medsError, setMedsError] = useState<string | null>(null);
  const [medsPermissionDenied, setMedsPermissionDenied] = useState(false);
  const [addingMedication, setAddingMedication] = useState(false);
  const [medName, setMedName] = useState('');
  const [medDosage, setMedDosage] = useState('');
  const [medBusy, setMedBusy] = useState(false);
  const [medFormError, setMedFormError] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  function loadPeople() {
    setPeopleError(null);
    apiFetch<Person[]>('/persons')
      .then((list) => {
        setPeople(list);
        if (list.length > 0) setSelected((current) => current ?? list[0].id);
      })
      .catch((err) => setPeopleError(err.message));
  }

  useEffect(loadPeople, []);

  function loadProfile() {
    if (!selected) return;
    setProfileError(null);
    setProfilePermissionDenied(false);
    setProfile(null);
    setProfileLoading(true);
    apiFetch<HealthProfileData | null>(`/persons/${selected}/health-profile`)
      .then(setProfile)
      .catch((err) => {
        if (isPermissionDenied(err)) setProfilePermissionDenied(true);
        else setProfileError(err instanceof ApiError ? err.message : 'Erro inesperado.');
      })
      .finally(() => setProfileLoading(false));
  }

  function loadMedications() {
    if (!selected) return;
    setMedsError(null);
    setMedsPermissionDenied(false);
    setMedications(null);
    apiFetch<Medication[]>(`/persons/${selected}/medications`)
      .then((res) => {
        if (!Array.isArray(res)) throw new Error('Resposta inesperada do servidor.');
        setMedications(res);
      })
      .catch((err) => {
        if (isPermissionDenied(err)) setMedsPermissionDenied(true);
        else setMedsError(err instanceof Error ? err.message : 'Erro inesperado.');
      });
  }

  useEffect(() => {
    setEditingProfile(false);
    setAddingMedication(false);
    loadProfile();
    loadMedications();
    // `loadProfile`/`loadMedications` intentionally omitted — this project's
    // ESLint config doesn't ship react-hooks/exhaustive-deps, and both
    // functions only close over `selected` (already the trigger below), so
    // adding them as deps would just re-run on every render instead of only
    // when the selected person changes.
  }, [selected]);

  async function submitMedication(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !medName.trim()) return;
    setMedFormError(null);
    setMedBusy(true);
    try {
      await apiFetch('/medications', {
        method: 'POST',
        body: JSON.stringify({ subjectPersonId: selected, name: medName, dosageText: medDosage || undefined }),
      });
      setMedName('');
      setMedDosage('');
      setAddingMedication(false);
      loadMedications();
      setToast('Medicamento adicionado.');
    } catch (err) {
      setMedFormError(err instanceof ApiError ? err.message : 'Erro ao adicionar medicamento.');
    } finally {
      setMedBusy(false);
    }
  }

  async function recordAdministration(medicationId: string, status: string) {
    try {
      await apiFetch('/medications/administrations', {
        method: 'POST',
        body: JSON.stringify({ medicationId, scheduledAt: new Date().toISOString(), status }),
      });
      setToast('Dose registrada.');
    } catch (err) {
      setMedsError(err instanceof ApiError ? err.message : 'Erro ao registrar a dose.');
    }
  }

  return (
    <div className="max-w-2xl">
      {toast && <SuccessToast message={toast} onDismiss={() => setToast(null)} />}

      <PageHeader
        title="Saúde"
        description="Perfil de saúde e medicamentos — dado sensível, com proteção reforçada."
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

      {peopleError && (
        <div className="mt-6">
          <ErrorState description={peopleError} onRetry={loadPeople} />
        </div>
      )}

      {!peopleError && people && people.length === 0 && (
        <div className="mt-8">
          <EmptyState
            title="Sua família ainda não tem ninguém cadastrado"
            description="Cadastre ao menos uma pessoa para começar a organizar a saúde dela."
          />
        </div>
      )}

      {!peopleError && people && people.length > 0 && (
        <div className="mt-8 space-y-6">
          {/* ---------------------------------------------------- perfil */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-ink">Perfil de saúde</h2>

            {profileError && <ErrorState description={profileError} onRetry={loadProfile} />}

            {!profileError && profileLoading && <LoadingState label="Carregando perfil de saúde…" />}

            {!profileError && !profileLoading && profilePermissionDenied && (
              <PermissionDeniedState description="Você não tem acesso ao perfil de saúde desta pessoa." />
            )}

            {!profileError && !profileLoading && !profilePermissionDenied && editingProfile && selected && (
              <HealthProfileForm
                personId={selected}
                initial={profile}
                onSaved={(data) => {
                  setProfile(data);
                  setEditingProfile(false);
                  setToast('Perfil de saúde salvo.');
                }}
                onCancel={() => setEditingProfile(false)}
              />
            )}

            {!profileError && !profileLoading && !profilePermissionDenied && !editingProfile && (
              <Card>
                {profile ? (
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
                      <dt className="text-inkMuted">Plano de saúde</dt>
                      <dd className="text-ink">{profile.health_plan_name ?? '—'}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-sm text-inkMuted">Nenhum perfil de saúde cadastrado ainda.</p>
                )}
                <Button variant="secondary" size="sm" className="mt-4" onClick={() => setEditingProfile(true)}>
                  {profile ? 'Editar perfil de saúde' : 'Cadastrar perfil de saúde'}
                </Button>
              </Card>
            )}
          </div>

          {/* ------------------------------------------------ medicamentos */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Medicamentos</h2>
              {!medsPermissionDenied && !addingMedication && (
                <Button variant="secondary" size="sm" onClick={() => setAddingMedication(true)}>
                  + Medicamento
                </Button>
              )}
            </div>

            {medsError && <ErrorState description={medsError} onRetry={loadMedications} />}

            {!medsError && medsPermissionDenied && (
              <PermissionDeniedState description="Você não tem acesso aos medicamentos desta pessoa." />
            )}

            {!medsError && !medsPermissionDenied && addingMedication && (
              <Card>
                <form onSubmit={submitMedication} className="flex flex-col gap-4">
                  <Input label="Nome do medicamento" required value={medName} onChange={(e) => setMedName(e.target.value)} />
                  <Input
                    label="Dosagem (opcional)"
                    value={medDosage}
                    onChange={(e) => setMedDosage(e.target.value)}
                    placeholder="Ex: 5ml a cada 8 horas"
                  />
                  {medFormError && <ErrorState description={medFormError} />}
                  <FormActions
                    submitLabel="Adicionar medicamento"
                    onCancel={() => setAddingMedication(false)}
                    busy={medBusy}
                    disabled={!medName.trim()}
                  />
                </form>
              </Card>
            )}

            {!medsError && !medsPermissionDenied && medications === null && <LoadingState label="Carregando medicamentos…" />}

            {!medsError && !medsPermissionDenied && medications && medications.length === 0 && !addingMedication && (
              <EmptyState title="Nenhum medicamento cadastrado" description="Adicione um medicamento para acompanhar as doses." />
            )}

            {!medsError && !medsPermissionDenied && medications && medications.length > 0 && (
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                {medications.map((med) => (
                  <li key={med.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-ink">{med.name}</p>
                      {med.dosage_text && <p className="text-xs text-inkMuted">{med.dosage_text}</p>}
                    </div>
                    <div className="flex gap-2">
                      {ADMINISTRATION_ACTIONS.map((action) => (
                        <Button
                          key={action.status}
                          variant="ghost"
                          size="sm"
                          onClick={() => recordAdministration(med.id, action.status)}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
