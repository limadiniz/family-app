'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { PageHeader, Card, PersonAvatar, StatusBadge, LoadingState, ErrorState, EmptyState, Input, Select, Button } from '@/components/ui';

interface Person {
  id: string;
  display_name: string;
  is_minor: boolean;
  person_type: string;
  roles: string[];
}

interface FamilyUnitOption {
  family_unit_id: string;
  family_units: { id: string; name: string };
}

type FilterKey = 'all' | 'dependents' | 'guardians' | 'caregivers' | 'professionals';

/**
 * §5 — Pessoas substitui as antigas páginas Família (lista de pessoas) e
 * Filhos como o destino único pra "quem está na minha família". Os
 * filtros usam o campo `roles` que `GET /persons` passou a devolver
 * nesta mesma leva (apps/api/.../family.service.ts) — nada é inferido
 * no cliente que o backend já não tenha decidido (a lista em si já veio
 * filtrada pelo Policy Engine antes de chegar aqui).
 *
 * O card "Adicionar dependente" reaproveita o mesmo POST /dependents já
 * usado no onboarding e na antiga página Filhos — é a única operação de
 * criação de pessoa com backend confirmado hoje. Criar um cuidador ou
 * profissional como pessoa nova exigiria um endpoint que ainda não
 * existe, então fica para a Central de Cadastros (P1) em vez de simular
 * aqui um formulário que não persistiria de verdade.
 */
const FILTERS: Array<{ key: FilterKey; label: string; test: (p: Person) => boolean }> = [
  { key: 'all', label: 'Todos', test: () => true },
  {
    key: 'dependents',
    label: 'Filhos e dependentes',
    test: (p) => p.is_minor || p.roles.some((r) => r === 'CHILD' || r === 'TEEN'),
  },
  {
    key: 'guardians',
    label: 'Responsáveis',
    test: (p) => p.roles.some((r) => r === 'FAMILY_OWNER' || r === 'GUARDIAN' || r === 'CO_GUARDIAN'),
  },
  {
    key: 'caregivers',
    label: 'Cuidadores',
    test: (p) => p.roles.some((r) => r === 'CAREGIVER' || r === 'TEMPORARY_CAREGIVER' || r === 'EXTENDED_FAMILY'),
  },
  { key: 'professionals', label: 'Profissionais', test: (p) => p.roles.some((r) => r === 'PROFESSIONAL') },
];

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [units, setUnits] = useState<FamilyUnitOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');

  const [showAddForm, setShowAddForm] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [familyUnitId, setFamilyUnitId] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    setError(null);
    apiFetch<Person[]>('/persons')
      .then(setPeople)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Erro ao carregar pessoas.'));
    apiFetch<FamilyUnitOption[]>('/family-units')
      .then((u) => {
        setUnits(u);
        setFamilyUnitId((current) => current || u[0]?.family_unit_id || '');
      })
      .catch(() => undefined); // só necessário se o formulário de adicionar for aberto
  }

  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!people) return null;
    const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
    return people.filter(active.test);
  }, [people, filter]);

  async function handleAddDependent(e: React.FormEvent) {
    e.preventDefault();
    if (!familyUnitId) {
      setAddError('Crie uma unidade familiar antes de adicionar um dependente.');
      return;
    }
    setAddError(null);
    setBusy(true);
    try {
      await apiFetch('/dependents', {
        method: 'POST',
        body: JSON.stringify({ displayName, birthDate: birthDate || undefined, familyUnitId }),
      });
      setDisplayName('');
      setBirthDate('');
      setShowAddForm(false);
      load();
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Erro ao adicionar dependente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Pessoas"
        description="Todo mundo que faz parte da sua família na ZELII — dependentes, responsáveis, cuidadores e profissionais."
        actions={
          <Button size="sm" onClick={() => setShowAddForm((v) => !v)}>
            {showAddForm ? 'Cancelar' : 'Adicionar dependente'}
          </Button>
        }
      />

      {showAddForm && (
        <Card className="mt-4">
          <form onSubmit={handleAddDependent} className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Nome"
                className="flex-1"
              />
              <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="sm:w-48" />
            </div>
            {units.length > 1 && (
              <Select label="Unidade familiar" value={familyUnitId} onChange={(e) => setFamilyUnitId(e.target.value)}>
                {units.map((u) => (
                  <option key={u.family_unit_id} value={u.family_unit_id}>
                    {u.family_units?.name}
                  </option>
                ))}
              </Select>
            )}
            <Button type="submit" disabled={busy || !displayName.trim()} className="self-start">
              Adicionar
            </Button>
            {addError && <p className="text-sm text-critical">{addError}</p>}
          </form>
        </Card>
      )}

      <div role="group" aria-label="Filtrar pessoas" className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`min-h-touch rounded-full border px-3 text-sm font-medium transition-colors ${
              filter === f.key ? 'border-primary bg-primary/10 text-ink' : 'border-border bg-surface text-inkMuted hover:bg-surfaceMuted'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {error && <ErrorState description={error} onRetry={load} />}

        {!error && !filtered && <LoadingState label="Carregando pessoas…" />}

        {!error && filtered && filtered.length === 0 && (
          <EmptyState
            title={filter === 'all' ? 'Nenhuma pessoa cadastrada ainda' : 'Nenhuma pessoa nesse filtro'}
            description={
              filter === 'all'
                ? 'Adicione o primeiro dependente para começar a organizar sua família.'
                : 'Experimente outro filtro para ver as pessoas já cadastradas.'
            }
          />
        )}

        {!error && filtered && filtered.length > 0 && (
          <ul className="space-y-2">
            {filtered.map((p) => (
              <li key={p.id}>
                <Card className="flex items-center gap-3">
                  <PersonAvatar person={{ id: p.id, displayName: p.display_name }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{p.display_name}</p>
                    {p.roles.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {p.roles.map((role) => (
                          <StatusBadge key={role} domain="role" value={role} />
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-inkMuted">Sem vínculo ativo em nenhuma família</p>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
