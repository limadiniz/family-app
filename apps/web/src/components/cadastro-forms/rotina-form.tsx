'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Input, Select, LoadingState, ErrorState, EmptyState, FormActions, Button } from '@/components/ui';

interface Person { id: string; display_name: string; }
interface Residence { id: string; label: string; place_type: string; address_line: string | null; city: string | null; state: string | null; }

const DAYS = [['1', 'Seg'], ['2', 'Ter'], ['3', 'Qua'], ['4', 'Qui'], ['5', 'Sex'], ['6', 'Sáb'], ['0', 'Dom']] as const;
const TYPES = [
  ['SCHOOL', 'Escola'], ['DAYCARE', 'Creche / berçário'], ['ACADEMY', 'Academia'],
  ['SPORT', 'Esporte'], ['THERAPY', 'Terapia'], ['DENTIST', 'Dentista'],
  ['HEALTHCARE', 'Consulta / saúde'], ['SALON', 'Salão / barbearia'],
  ['COURSE', 'Curso'], ['MEDICATION', 'Medicamento'], ['OTHER', 'Outro'],
] as const;

export function RotinaForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [residences, setResidences] = useState<Residence[]>([]);
  const [personId, setPersonId] = useState('');
  const [label, setLabel] = useState('');
  const [routineType, setRoutineType] = useState('SCHOOL');
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startsAt, setStartsAt] = useState('07:30');
  const [endsAt, setEndsAt] = useState('12:00');
  const [arrivalBufferMinutes, setArrivalBufferMinutes] = useState('15');
  const [residenceId, setResidenceId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [originId, setOriginId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [travel, setTravel] = useState<{ durationSeconds: number | null; distanceMeters: number | null; mapsUrl: string; requiresConfiguration?: boolean } | null>(null);
  const [travelBusy, setTravelBusy] = useState(false);

  useEffect(() => {
    Promise.all([apiFetch<Person[]>('/persons'), apiFetch<Residence[]>('/residences')])
      .then(([familyPeople, places]) => {
        setPeople(familyPeople);
        setPersonId(familyPeople[0]?.id ?? '');
        setResidences(places);
        setOriginId(places.find((place) => place.place_type === 'HOME')?.id ?? places[0]?.id ?? '');
        setDestinationId(places.find((place) => ['SCHOOL', 'ACADEMY'].includes(place.place_type))?.id ?? '');
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar pessoas e locais.'));
  }, []);

  function toggleDay(value: string) {
    const day = Number(value);
    setWeekdays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort());
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!personId || weekdays.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/persons/${personId}/routines`, {
        method: 'POST',
        body: JSON.stringify({ label: label.trim(), routineType, weekdays, startsAt, endsAt: endsAt || undefined, arrivalBufferMinutes: Number(arrivalBufferMinutes) || 0, residenceId: residenceId || undefined }),
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar a rotina.');
    } finally {
      setBusy(false);
    }
  }

  async function calculateTravel() {
    if (!originId || !destinationId || originId === destinationId) return;
    setTravelBusy(true);
    setTravel(null);
    try {
      setTravel(await apiFetch<{ durationSeconds: number | null; distanceMeters: number | null; mapsUrl: string; requiresConfiguration?: boolean }>('/travel-time', { method: 'POST', body: JSON.stringify({ originResidenceId: originId, destinationResidenceId: destinationId }) }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível calcular o deslocamento.');
    } finally {
      setTravelBusy(false);
    }
  }

  if (!people) return <LoadingState label="Carregando pessoas e locais…" />;
  if (people.length === 0) return <EmptyState title="Cadastre uma pessoa primeiro" description="A rotina precisa estar vinculada a uma criança ou pessoa da família." />;

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-inkMuted">Registre entrada e saída de escola, academia, esporte ou terapia. A rotina aparece no controle da agenda e ajuda a planejar o deslocamento.</p>
        <Select label="Pessoa" value={personId} onChange={(event) => setPersonId(event.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}</Select>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Nome da rotina" required value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ex.: Entrada na escola" />
          <Select label="Categoria" value={routineType} onChange={(event) => setRoutineType(event.target.value)}>{TYPES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</Select>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">Dias da semana</legend>
          <div className="flex flex-wrap gap-2">{DAYS.map(([value, text]) => <label key={value} className="flex min-h-touch items-center gap-2 rounded-full border border-border px-3 text-sm text-ink"><input type="checkbox" checked={weekdays.includes(Number(value))} onChange={() => toggleDay(value)} className="accent-primary" />{text}</label>)}</div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Entrada" type="time" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
          <Input label="Saída (opcional)" type="time" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
          <Input label="Margem de chegada (min)" type="number" min={0} max={240} value={arrivalBufferMinutes} onChange={(event) => setArrivalBufferMinutes(event.target.value)} />
        </div>
        <Select label="Local (opcional)" value={residenceId} onChange={(event) => setResidenceId(event.target.value)}><option value="">Ainda não vincular</option>{residences.map((place) => <option key={place.id} value={place.id}>{place.label}</option>)}</Select>
        {residences.length >= 2 && <div className="rounded-lg border border-border bg-background p-3"><p className="text-sm font-medium text-ink">Planejar deslocamento</p><p className="mt-1 text-xs text-inkMuted">A ZELII consulta a rota somente quando você solicitar. Sem uma chave do Google Routes, abrimos o trajeto no Google Maps.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><Select label="Saída" value={originId} onChange={(event) => setOriginId(event.target.value)}><option value="">Selecione</option>{residences.map((place) => <option key={place.id} value={place.id}>{place.label}</option>)}</Select><Select label="Destino" value={destinationId} onChange={(event) => setDestinationId(event.target.value)}><option value="">Selecione</option>{residences.map((place) => <option key={place.id} value={place.id}>{place.label}</option>)}</Select></div><Button type="button" size="sm" variant="secondary" className="mt-3" onClick={calculateTravel} disabled={travelBusy || !originId || !destinationId || originId === destinationId}>{travelBusy ? 'Calculando…' : 'Calcular deslocamento'}</Button>{travel && <div className="mt-3 text-sm text-ink">{travel.durationSeconds ? <>{Math.ceil(travel.durationSeconds / 60)} min · {travel.distanceMeters ? `${(travel.distanceMeters / 1000).toFixed(1)} km` : 'distância indisponível'}</> : <>A duração automática ainda não está configurada.</>}<br /><a className="text-primary underline" href={travel.mapsUrl} target="_blank" rel="noreferrer">Abrir rota no Google Maps</a></div>}</div>}
        {error && <ErrorState description={error} />}
        <FormActions submitLabel="Salvar rotina" onCancel={onCancel} busy={busy} disabled={!label.trim() || !personId || weekdays.length === 0} />
      </form>
    </Card>
  );
}
