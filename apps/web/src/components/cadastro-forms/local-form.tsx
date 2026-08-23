'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Input, Select, ErrorState, FormActions } from '@/components/ui';

export interface ResidenceRecord {
  id?: string;
  label: string;
  place_type: string;
  address_line: string | null;
  city: string | null;
  state: string | null;
  postal_code?: string | null;
  google_place_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export const PLACE_TYPES = [
  ['HOME', 'Casa'], ['SCHOOL', 'Escola'], ['DAYCARE', 'Creche / berçário'],
  ['HEALTHCARE', 'Hospital / clínica'], ['DENTIST', 'Dentista'], ['PHARMACY', 'Farmácia'],
  ['ACADEMY', 'Academia'], ['SPORT', 'Esporte'], ['THERAPY', 'Terapia'],
  ['SALON', 'Salão / barbearia'], ['WORK', 'Trabalho'], ['COURSE', 'Curso'],
  ['RELATIVE', 'Casa de familiar'], ['RELIGIOUS', 'Igreja / comunidade'],
  ['MARKET', 'Mercado / serviço'], ['OTHER', 'Outro'],
] as const;

export const PLACE_TYPE_LABELS = Object.fromEntries(PLACE_TYPES) as Record<string, string>;

interface PlaceSuggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

interface PlaceDetails {
  placeId: string;
  label: string;
  formattedAddress: string;
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
}

interface LocalFormProps {
  initialResidence?: ResidenceRecord | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function LocalForm({ initialResidence = null, onSuccess, onCancel }: LocalFormProps) {
  const [label, setLabel] = useState(initialResidence?.label ?? '');
  const [placeType, setPlaceType] = useState(initialResidence?.place_type ?? 'HOME');
  const [addressLine, setAddressLine] = useState(initialResidence?.address_line ?? '');
  const [city, setCity] = useState(initialResidence?.city ?? '');
  const [state, setState] = useState(initialResidence?.state ?? '');
  const [postalCode, setPostalCode] = useState(initialResidence?.postal_code ?? '');
  const [googlePlaceId, setGooglePlaceId] = useState(initialResidence?.google_place_id ?? '');
  const [latitude, setLatitude] = useState<number | null>(initialResidence?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(initialResidence?.longitude ?? null);
  const [searchText, setSearchText] = useState(initialResidence?.address_line ?? '');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLabel(initialResidence?.label ?? '');
    setPlaceType(initialResidence?.place_type ?? 'HOME');
    setAddressLine(initialResidence?.address_line ?? '');
    setCity(initialResidence?.city ?? '');
    setState(initialResidence?.state ?? '');
    setPostalCode(initialResidence?.postal_code ?? '');
    setGooglePlaceId(initialResidence?.google_place_id ?? '');
    setLatitude(initialResidence?.latitude ?? null);
    setLongitude(initialResidence?.longitude ?? null);
    setSearchText(initialResidence?.address_line ?? '');
    setSuggestions([]);
    setSearchMessage(null);
  }, [initialResidence]);

  useEffect(() => {
    const query = searchText.trim();
    if (query.length < 3 || query === addressLine.trim()) {
      setSuggestions([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      setSearchBusy(true);
      setSearchMessage(null);
      try {
        const result = await apiFetch<{ suggestions: PlaceSuggestion[] }>('/places/autocomplete', {
          method: 'POST',
          body: JSON.stringify({ query }),
        });
        if (active) setSuggestions(result.suggestions);
      } catch (err) {
        if (active) {
          setSuggestions([]);
          setSearchMessage(err instanceof ApiError ? err.message : 'Não foi possível buscar no Google. Preencha o endereço manualmente.');
        }
      } finally {
        if (active) setSearchBusy(false);
      }
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [searchText, addressLine]);

  async function selectSuggestion(suggestion: PlaceSuggestion) {
    setDetailsBusy(true);
    setError(null);
    try {
      const details = await apiFetch<PlaceDetails>(`/places/${encodeURIComponent(suggestion.placeId)}`);
      setGooglePlaceId(details.placeId);
      setAddressLine(details.addressLine || details.formattedAddress);
      setCity(details.city);
      setState(details.state);
      setPostalCode(details.postalCode);
      setLatitude(details.latitude);
      setLongitude(details.longitude);
      setSearchText(details.formattedAddress);
      setLabel((current) => current.trim() || details.label);
      setSuggestions([]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os detalhes do local.');
    } finally {
      setDetailsBusy(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload = {
        label: label.trim(), placeType, addressLine: addressLine.trim(), city: city.trim(),
        state: state.trim().toUpperCase(), postalCode: postalCode.trim(),
        googlePlaceId: googlePlaceId || undefined, latitude: latitude ?? undefined, longitude: longitude ?? undefined,
      };
      await apiFetch(initialResidence?.id ? `/residences/${initialResidence.id}` : '/residences', {
        method: initialResidence?.id ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
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
          Cadastre casa, escola, hospital, academia, salão ou qualquer outro lugar importante para a família. Busque no Google para preencher o endereço, ou digite tudo manualmente.
        </p>
        <Input label="Nome que a família verá" required value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ex.: Escola Miguel" />
        <Select label="Tipo de local" value={placeType} onChange={(event) => setPlaceType(event.target.value)}>
          {PLACE_TYPES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </Select>
        <div className="relative">
          <Input
            label="Buscar no Google Maps"
            value={searchText}
            onChange={(event) => { setSearchText(event.target.value); setGooglePlaceId(''); }}
            placeholder="Digite escola, academia, hospital ou endereço"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-inkMuted">Sugestões do Google · a busca só é enviada quando você digita e solicita um local.</p>
          {(searchBusy || detailsBusy) && <p className="mt-1 text-xs text-inkMuted">{detailsBusy ? 'Carregando endereço…' : 'Buscando locais…'}</p>}
          {suggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-surface shadow-lg" role="listbox" aria-label="Sugestões de locais">
              {suggestions.map((suggestion) => (
                <button type="button" key={suggestion.placeId} className="block min-h-touch w-full border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-surfaceMuted" onClick={() => selectSuggestion(suggestion)}>
                  <span className="block text-sm font-medium text-ink">{suggestion.mainText}</span>
                  <span className="block text-xs text-inkMuted">{suggestion.secondaryText || suggestion.description}</span>
                </button>
              ))}
              <div className="border-t border-border px-3 py-1.5 text-[11px] text-inkMuted">Powered by Google</div>
            </div>
          )}
          {searchMessage && <p className="mt-1 text-xs text-inkMuted">{searchMessage}</p>}
        </div>
        <Input label="Endereço confirmado" required value={addressLine} onChange={(event) => setAddressLine(event.target.value)} placeholder="Rua, número e complemento" />
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem_8rem]">
          <Input label="Cidade" required value={city} onChange={(event) => setCity(event.target.value)} />
          <Input label="UF" maxLength={2} required value={state} onChange={(event) => setState(event.target.value)} placeholder="SP" />
          <Input label="CEP" value={postalCode} onChange={(event) => setPostalCode(event.target.value)} placeholder="00000-000" />
        </div>
        {googlePlaceId && <p className="text-xs text-inkMuted">Local vinculado à referência do Google Maps.</p>}
        {error && <ErrorState description={error} />}
        <FormActions submitLabel={initialResidence?.id ? 'Salvar alterações' : 'Salvar local'} onCancel={onCancel} busy={busy || detailsBusy} disabled={!label.trim() || !addressLine.trim() || !city.trim() || state.trim().length !== 2} />
      </form>
    </Card>
  );
}
