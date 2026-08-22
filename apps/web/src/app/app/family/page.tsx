'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { PageHeader, Input, Button, Card, Select, LoadingState, ErrorState, EmptyState, StatusBadge } from '@/components/ui';

interface FamilyUnit {
  family_unit_id: string;
  role: string;
  family_units: { id: string; name: string; kind: string };
}

interface Person {
  id: string;
  display_name: string;
  person_type: string;
  is_minor: boolean;
}

interface FamilyInvitation {
  id: string;
  family_unit_id: string;
  invitee_email: string;
  proposed_role: string;
  status: string;
  expires_at: string;
}

/**
 * Unidades familiares (§10/§68) — distinto da página Pessoas: aqui é
 * sobre as FamilyUnits em si (o "onde" — pode haver mais de uma, ex.
 * pais separados), não sobre as pessoas dentro delas.
 */
export default function FamilyPage() {
  const [units, setUnits] = useState<FamilyUnit[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedFamilyUnitId, setSelectedFamilyUnitId] = useState('');
  const [invitations, setInvitations] = useState<FamilyInvitation[]>([]);
  const [inviteeEmail, setInviteeEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('CO_GUARDIAN');
  const [subjectPersonIds, setSubjectPersonIds] = useState<string[]>([]);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  function refresh() {
    setError(null);
    Promise.all([
      apiFetch<FamilyUnit[]>('/family-units'),
      apiFetch<FamilyInvitation[]>('/invitations'),
    ])
      .then(([familyUnits, pendingInvitations]) => {
        setUnits(familyUnits);
        setInvitations(pendingInvitations);
        setSelectedFamilyUnitId((current) => {
          if (familyUnits.some((unit) => unit.family_unit_id === current)) return current;
          return familyUnits.find((unit) => ['FAMILY_OWNER', 'GUARDIAN', 'CO_GUARDIAN'].includes(unit.role))?.family_unit_id ?? '';
        });
      })
      .catch((err) => setError(err.message));
  }

  async function createInvitation(event: React.FormEvent) {
    event.preventDefault();
    const familyUnitId = selectedFamilyUnitId;
    if (!familyUnitId) return;
    setInviteBusy(true);
    setInviteLink(null);
    setCopied(false);
    setError(null);
    try {
      const invitation = await apiFetch<{ token: string }>('/invitations', {
        method: 'POST',
        body: JSON.stringify({ familyUnitId, inviteeEmail, subjectPersonIds, role: inviteRole }),
      });
      setInviteLink(`${window.location.origin}/convite/${invitation.token}`);
      setInviteeEmail('');
      const updated = await apiFetch<FamilyInvitation[]>('/invitations');
      setInvitations(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar o convite.');
    } finally {
      setInviteBusy(false);
    }
  }

  async function copyInvitation() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
  }

  const dependents = people.filter((person) => person.is_minor || person.person_type !== 'ADULT');
  const canInvite = !!units?.some((unit) => ['FAMILY_OWNER', 'GUARDIAN', 'CO_GUARDIAN'].includes(unit.role));

  useEffect(refresh, []);

  useEffect(() => {
    if (!selectedFamilyUnitId) return;
    apiFetch<Person[]>(`/invitations/eligible-subjects/list?familyUnitId=${encodeURIComponent(selectedFamilyUnitId)}`)
      .then((familyPeople) => {
        setPeople(familyPeople);
        setSubjectPersonIds(familyPeople.map((person) => person.id));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar os filhos desta família.'));
  }, [selectedFamilyUnitId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/family-units', { method: 'POST', body: JSON.stringify({ name }) });
      setName('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar unidade familiar.');
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Família" description="Unidades familiares — cada uma pode ter seu próprio conjunto de pessoas e residências." />

      <form onSubmit={handleCreate} className="mt-6 flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da unidade familiar (ex: Família da Ana)"
          className="flex-1"
        />
        <Button type="submit" disabled={!name.trim()}>
          Criar
        </Button>
      </form>

      <div className="mt-6">
        {error && <ErrorState description={error} onRetry={refresh} />}

        {!error && units === null && <LoadingState label="Carregando famílias…" />}

        {!error && units && units.length === 0 && (
          <EmptyState title="Nenhuma unidade familiar ainda" description="Crie a primeira acima." />
        )}

        {!error && units && units.length > 0 && (
          <ul className="space-y-2">
            {units.map((u) => (
              <li key={u.family_unit_id} className="rounded-lg border border-border bg-surface p-4">
                <p className="font-medium text-ink">{u.family_units?.name}</p>
                <div className="mt-1">
                  <StatusBadge domain="role" value={u.role} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!error && units && units.length > 0 && canInvite && (
        <Card className="mt-8">
          <p className="text-sm font-medium text-primary">Cuidado compartilhado</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">Conectar outro responsável</h2>
          <p className="mt-2 text-sm text-inkMuted">
            Convide mãe, pai ou outro responsável para a mesma família. A pessoa entra com a própria conta e passa a ver as agendas dos filhos dessa unidade e receber tarefas.
          </p>

          <form onSubmit={createInvitation} className="mt-5 space-y-4">
            {units.length > 1 && (
              <label className="block text-sm text-ink">
                Família que será compartilhada
                <Select className="mt-1 w-full" value={selectedFamilyUnitId} onChange={(event) => setSelectedFamilyUnitId(event.target.value)}>
                  {units.filter((unit) => ['FAMILY_OWNER', 'GUARDIAN', 'CO_GUARDIAN'].includes(unit.role)).map((unit) => (
                    <option key={unit.family_unit_id} value={unit.family_unit_id}>{unit.family_units.name}</option>
                  ))}
                </Select>
              </label>
            )}
            <Input
              type="email"
              label="E-mail do outro responsável"
              value={inviteeEmail}
              onChange={(event) => setInviteeEmail(event.target.value)}
              placeholder="responsavel@email.com"
            />
            <label className="block text-sm text-ink">
              Perfil de acesso
              <Select className="mt-1 w-full" value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
                <option value="CO_GUARDIAN">Responsável compartilhado</option>
                <option value="GUARDIAN">Responsável com acesso completo</option>
              </Select>
            </label>
            <fieldset>
              <legend className="text-sm font-medium text-ink">Filhos incluídos nesta família</legend>
              {dependents.length === 0 ? (
                <p className="mt-2 text-sm text-inkMuted">Cadastre ao menos um filho antes de criar o convite.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {dependents.map((person) => (
                    <span key={person.id} className="rounded-full border border-border bg-surfaceMuted px-3 py-1.5 text-sm text-ink">
                      {person.display_name}
                    </span>
                  ))}
                </div>
              )}
            </fieldset>
            <Button type="submit" disabled={inviteBusy || !inviteeEmail.trim() || subjectPersonIds.length === 0}>
              {inviteBusy ? 'Criando convite…' : 'Criar link de convite'}
            </Button>
          </form>

          {inviteLink && (
            <div className="mt-5 rounded-lg border border-success/30 bg-success/5 p-4">
              <p className="text-sm font-medium text-ink">Convite pronto para compartilhar</p>
              <p className="mt-1 break-all text-xs text-inkMuted">{inviteLink}</p>
              <Button className="mt-3" variant="secondary" onClick={copyInvitation}>{copied ? 'Link copiado' : 'Copiar link'}</Button>
            </div>
          )}

          {invitations.length > 0 && (
            <div className="mt-6 border-t border-border pt-5">
              <h3 className="text-sm font-medium text-ink">Convites</h3>
              <ul className="mt-2 space-y-2">
                {invitations.slice(0, 5).map((invitation) => (
                  <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surfaceMuted px-3 py-2 text-sm">
                    <span className="text-ink">{invitation.invitee_email}</span>
                    <StatusBadge domain="invitationStatus" value={invitation.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
