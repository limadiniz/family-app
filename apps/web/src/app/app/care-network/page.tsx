'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';

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

  function loadAssignments() {
    apiFetch<ResponsibilityAssignment[]>('/care-network/assignments/incoming').then(setIncoming).catch((err) => setError(err.message));
    apiFetch<ResponsibilityAssignment[]>('/care-network/assignments/outgoing').then(setOutgoing).catch((err) => setError(err.message));
  }

  useEffect(() => {
    apiFetch<Person[]>('/persons')
      .then((list) => {
        setPeople(list);
        if (list.length > 0) setSubject(list[0].id);
      })
      .catch((err) => setError(err.message));
    loadAssignments();
  }, []);

  useEffect(() => {
    if (!subject) return;
    setMembers(null);
    apiFetch<CareNetworkMember[]>(`/care-network/members/${subject}`)
      .then(setMembers)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Erro inesperado.'));
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
      <h1 className="text-2xl font-semibold text-ink">Rede de Cuidado</h1>
      <p className="mt-1 text-sm text-inkMuted">
        Parentesco não concede responsabilidade automaticamente — cada acesso vem de uma responsabilidade aceita, pelo tempo em que ela
        estiver ativa.
      </p>

      {error && <p className="mt-4 text-sm text-critical">{error}</p>}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-inkMuted">Quem pode ajudar?</h2>
          {people && people.length > 1 && (
            <select
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
              value={subject ?? ''}
              onChange={(e) => setSubject(e.target.value)}
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="mt-3 space-y-3">
          {(members ?? []).map((m) => (
            <div key={m.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">{personName(m.person_id)}</span>
                <span className="text-xs text-inkMuted">{m.status}</span>
              </div>
              {m.capabilities?.length > 0 && <p className="mt-1 text-xs text-inkMuted">{m.capabilities.join(', ')}</p>}
            </div>
          ))}
          {members && members.length === 0 && <p className="text-sm text-inkMuted">Ninguém cadastrado na rede de cuidado ainda.</p>}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-inkMuted">Responsabilidades recebidas</h2>
        <div className="mt-3 space-y-3">
          {(incoming ?? []).map((a) => (
            <div key={a.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">
                  {a.responsibility_type} — {personName(a.subject_person_id)}
                </span>
                <span className="text-xs text-inkMuted">{a.status}</span>
              </div>
              {a.instructions && <p className="mt-1 text-sm text-inkMuted">{a.instructions}</p>}
              {(a.status === 'SENT' || a.status === 'VIEWED') && (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => act(a.id, 'accept')} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white">
                    Aceitar
                  </button>
                  <button onClick={() => act(a.id, 'decline')} className="rounded-md border border-border px-3 py-1.5 text-xs text-ink">
                    Recusar
                  </button>
                </div>
              )}
              {a.status === 'ACTIVE' && (
                <button onClick={() => act(a.id, 'complete')} className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs text-ink">
                  Marcar como concluída
                </button>
              )}
            </div>
          ))}
          {incoming && incoming.length === 0 && <p className="text-sm text-inkMuted">Nenhuma responsabilidade recebida.</p>}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-inkMuted">Responsabilidades atribuídas por mim</h2>
        <div className="mt-3 space-y-3">
          {(outgoing ?? []).map((a) => (
            <div key={a.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">
                  {a.responsibility_type} — {personName(a.assigned_to_person_id)}
                </span>
                <span className="text-xs text-inkMuted">{a.status}</span>
              </div>
              {['PROPOSED', 'SENT', 'VIEWED', 'ACCEPTED'].includes(a.status) && (
                <button onClick={() => act(a.id, 'cancel')} className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs text-ink">
                  Cancelar
                </button>
              )}
            </div>
          ))}
          {outgoing && outgoing.length === 0 && <p className="text-sm text-inkMuted">Nenhuma responsabilidade atribuída por você ainda.</p>}
        </div>
      </section>
    </div>
  );
}
