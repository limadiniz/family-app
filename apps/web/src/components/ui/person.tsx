'use client';

/**
 * Subconjunto de Person (packages/domain/src/entities/person.ts) que os
 * componentes visuais realmente precisam — evita acoplar toda a UI ao
 * schema Zod completo do domínio.
 */
export interface PersonSummary {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  isMinor?: boolean;
}

const SIZE_CLASSES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-14 w-14 text-base',
} as const;

/** Paleta estável derivada do id — mesma pessoa sempre com a mesma cor, sem precisar guardar isso em lugar nenhum. */
const AVATAR_TINTS = ['bg-primary/15 text-primary', 'bg-info/15 text-info', 'bg-success/15 text-success', 'bg-warning/15 text-warning'];

function tintFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

interface PersonAvatarProps {
  person: PersonSummary;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}

/**
 * Foto se houver `avatarUrl`; caso contrário, iniciais sobre um tint
 * estável derivado do id. `isMinor` nunca vira um rótulo textual aqui —
 * é dado sensível de perfil, não decoração (§4: dados de crianças
 * recebem proteção reforçada, inclusive na superfície visual).
 */
export function PersonAvatar({ person, size = 'md', className = '' }: PersonAvatarProps) {
  const sizeClass = SIZE_CLASSES[size];
  if (person.avatarUrl) {
    // <img> puro em vez de next/image: avatarUrl vem de armazenamento do
    // usuário (ex.: Supabase Storage) com domínio ainda não fixado em
    // next.config.js `images.remotePatterns` — next/image quebraria em
    // runtime com "domain not configured" até essa allowlist existir.
    return (
      <span className={`block overflow-hidden rounded-full ${sizeClass} ${className}`}>
        <img src={person.avatarUrl} alt={person.displayName} className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${tintFor(person.id)} ${sizeClass} ${className}`}
      aria-hidden="true"
    >
      {initialsFor(person.displayName)}
    </span>
  );
}

interface PersonPickerProps {
  people: PersonSummary[];
  value: string | null;
  onChange: (personId: string) => void;
  label?: string;
  className?: string;
}

/**
 * Seleção de pessoa via botões nativamente focáveis (não uma div-list) —
 * usado em captura, atribuição de responsabilidade, etc. Nunca decide
 * sozinho quem PODE ser escolhido: a lista `people` já deve vir filtrada
 * pelo backend/Policy Engine (§10) antes de chegar aqui.
 */
export function PersonPicker({ people, value, onChange, label, className = '' }: PersonPickerProps) {
  return (
    <div className={className}>
      {label && <p className="mb-2 text-sm font-medium text-ink">{label}</p>}
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {people.map((person) => {
          const selected = person.id === value;
          return (
            <button
              key={person.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(person.id)}
              className={`flex min-h-touch items-center gap-2 rounded-full border pl-1 pr-3 text-sm font-medium transition-colors ${
                selected ? 'border-primary bg-primary/10 text-ink' : 'border-border bg-surface text-ink hover:bg-surfaceMuted'
              }`}
            >
              <PersonAvatar person={person} size="sm" />
              {person.displayName}
            </button>
          );
        })}
      </div>
    </div>
  );
}
