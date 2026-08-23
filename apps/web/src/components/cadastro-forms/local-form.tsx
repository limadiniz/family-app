'use client';

import { useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Input, Select, LoadingState, ErrorState, FormActions } from '@/components/ui';

const PLACE_TYPES = [
  ['HOME', 'Casa'],
  ['SCHOOL', 'Escola'],
  ['HEALTHCARE', 'Hospital / clínica'],
  ['ACADEMY', 'Academia'],
  ['SPORT', 'Esporte'],
  ['THERAPY', 'Terapia'],
  ['OTHER', 'Outro'],
] as const;

export function LocalForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [label, setLabel] = useState('');
  const [placeType, setPlaceType] = useState('HOME');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/residences', {
        method: 'POST',
        body: JSON.stringify({
          label: label.trim(), placeType, addressLine: addressLine.trim(), city: city.trim(),
          state: state.trim().toUpperCase(), postalCode: postalCode.trim(),
        }),
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar o local.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-inkMuted">
          Cadastre casa, escola, hospital ou outro ponto de cuidado. O endereço fica restrito à família e só é enviado ao Google Maps quando você pedir uma rota.
        </p>
        <Input label="Nome do local" required value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ex.: Escola Miguel" />
        <Select label="Tipo de local" value={placeType} onChange={(event) => setPlaceType(event.target.value)}>
          {PLACE_TYPES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </Select>
        <Input label="Endereço" required value={addressLine} onChange={(event) => setAddressLine(event.target.value)} placeholder="Rua, número e complemento" />
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem_8rem]">
          <Input label="Cidade" required value={city} onChange={(event) => setCity(event.target.value)} />
          <Input label="UF" maxLength={2} required value={state} onChange={(event) => setState(event.target.value)} placeholder="SP" />
          <Input label="CEP" value={postalCode} onChange={(event) => setPostalCode(event.target.value)} placeholder="00000-000" />
        </div>
        {error && <ErrorState description={error} />}
        <FormActions submitLabel="Salvar local" onCancel={onCancel} busy={busy} disabled={!label.trim() || !addressLine.trim() || !city.trim() || state.trim().length !== 2} />
      </form>
    </Card>
  );
}
