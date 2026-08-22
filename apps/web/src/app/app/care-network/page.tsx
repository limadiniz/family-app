'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError, isPermissionDenied } from '@/lib/api-client';
import { PageHeader, Select, Button, LoadingState, ErrorState, EmptyState, PermissionDeniedState, StatusBadge } from '@/components/ui';

interface Person {
  id: string;
  display_name: string;
}

interface ResponsibilityAssignment {
  id: string;
  responsibility_type: string;
  status: string;
  subject_person_id: string;
  assigned_to_person_id: string;
  accountable_person_id: string;
  starts_at: string;
  ends_at: string;
  instructions: string | null;
  fallback_assignment_id: string | null;
}

interface CareNetworkMember {
  id: string;
  person_id: string;
  status: string;
  capabilities: string[];
}

/**
 * Extended Care Network (adendo) — "Quem pode ajudar?" (§28) + Family
 * Request Engine-backed responsibility proposals (§16-17). Kinship alone
 * never grants access here: a caregiver only gains scoped, time-boxed
 * permission after explicitly accepting an assignment.
 */
export default function CareNetworkPage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [members, setMembers] = useState<CareNetworkMember[] | null>(null);
  const [incoming, setIncoming] = useState<ResponsibilityAssignment[] | null>(null);
  const [outgoing, setOutgoing] = useState<ResponsibilityAssignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [membersPermissionDenied, setMembersPermissionDenied] = useState(false);

  function loadAssignments() {
    apiFetch<ResponsibilityAssignment[]>('/care-network/assignments/incoming').then(setIncoming).catch((err) => setError(err.message));
    apiFetch<ResponsibilityAssignment[]>('/care-network/assignments/outgoing').then(setOutgoing).catch((err) => setError(err.message));
  }

  function loadAll() {
    setError(null);
    apiFetch<Person[]>('/persons')
      .then((list) => {
        setPeople(list);
        if (list.length > 0) setSubject(list[0].id);
      })
      .catch((err) => setError(err.message));
    loadAssignments();
  }

  useEffect(loadAll, []);

  useEffect(() => {
    if (!subject) return;
    setMembers(null);
    setMembersPermissionDenied(false);
    apiFetch<CareNetworkMember[]>(`/care-network/members/${subject}`)
      .then(setMembers)
      .catch((err) => {
        if (isPermissionDenied(err)) {
          setMembersPermissionDenied(true);
        } else {
          setError(err instanceof ApiError ? err.message : 'Erro inesperado.');
        }
      });
  }, [subject]);

  async function act(id: string, action: 'accept' | 'decline' | 'cancel' | 'complete') {
    setError(null);
    try {
      await apiFetch(`/care-network/assignments/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
      loadAssignments();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro inesperado.');
    }
  }

  function personName(id: string) {
    return people?.find((p) => p.id === id)?.display_name ?? id;
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Rede de Cuidado"
        description="Parentesco não concede responsabilidade automaticamente — cada acesso vem de uma responsabilidade aceita, pelo tempo em que ela estiver ativa."
      />

      {error && (
        <div className="mt-4">
          <ErrorState description={error} onRetry={loadAll} />
        </div>
      )}

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-inkMuted">Quem pode ajudar?</h2>
          {people && people.length > 1 && (
            <Select className="w-auto" value={subject ?? ''} onChange={(e) => setSubject(e.target.value)}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </Select>
          )}
        </div>
        <div className="mt-3 space-y-3">
          {!error && !membersPermissionDenied && members === null && <LoadingState label="Carregando rede de cuidado…" />}
          {membersPermissionDenied && (
            <PermissionDeniedState description="Você não tem acesso à rede de cuidado desta pessoa." />
          )}
          {members?.map((m) => (
            <div key={m.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">{personName(m.person_id)}</span>
                <StatusBadge domain="careNetworkMemberStatus" value={m.status} />
              </div>
              {m.capabilities?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.capabilities.map((c) => (
                    <StatusBadge key={c} domain="capability" value={c} />
                  ))}
                </div>
              )}
            </div>
          ))}
          {members && members.length === 0 && <EmptyState title="Ninguém cadastrado na rede de cuidado ainda" />}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-inkMuted">Responsabilidades recebidas</h2>
        <div className="mt-3 space-y-3">
          {!error && incoming === null && <LoadingState label="Carregando responsabilidades…" />}
          {incoming?.map((a) => (
            <div key={a.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink">
                  <StatusBadge domain="responsibilityType" value={a.responsibility_type} />
                  <span>— {personName(a.subject_person_id)}</span>
                </span>
                <StatusBadge domain="responsibility" value={a.status} />
              </div>
              {a.instructions && <p className="mt-2 text-sm text-inkMuted">{a.instructions}</p>}
              {(a.status === 'SENT' || a.status === 'VIEWED') && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => act(a.id, 'accept')}>
                    Aceitar
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => act(a.id, 'decline')}>
                    Recusar
                  </Button>
                </div>
              )}
              {a.status === 'ACTIVE' && (
                <Button size="sm" variant="secondary" className="mt-3" onClick={() => act(a.id, 'complete')}>
                  Marcar como concluída
                </Button>
              )}
            </div>
          ))}
          {incoming && incoming.length === 0 && <EmptyState title="Nenhuma responsabilidade recebida" />}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-inkMuted">Responsabilidades atribuídas por mim</h2>
        <div className="mt-3 space-y-3">
          {!error && outgoing === null && <LoadingState label="Carregando responsabilidades…" />}
          {outgoing?.map((a) => (
            <div key={a.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink">
                  <StatusBadge domain="responsibilityType" value={a.responsibility_type} />
                  <span>— {personName(a.assigned_to_person_id)}</span>
                </span>
                <StatusBadge domain="responsibility" value={a.status} />
              </div>
              {['PROPOSED', 'SENT', 'VIEWED', 'ACCEPTED'].includes(a.status) && (
                <Button size="sm" variant="secondary" className="mt-3" onClick={() => act(a.id, 'cancel')}>
                  Cancelar
                </Button>
              )}
            </div>
          ))}
          {outgoing && outgoing.length === 0 && <EmptyState title="Nenhuma responsabilidade atribuída por você ainda" />}
        </div>
      </section>
    </div>
  );
}
