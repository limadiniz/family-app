import { translateStatus, type StatusDomain, type StatusTone } from '@/lib/status-i18n';

const TONE_CLASSES: Record<StatusTone, { bg: string; dot: string }> = {
  // Fundo = tint claro; texto sempre `ink` (nunca a cor de acento como
  // texto pequeno — ver a nota de contraste em packages/ui/src/tokens.ts).
  // O `dot` carrega a cor semântica; o texto não depende dela pra ser lido.
  neutral: { bg: 'bg-surfaceMuted', dot: 'bg-inkMuted' },
  info: { bg: 'bg-info/10', dot: 'bg-info' },
  success: { bg: 'bg-success/10', dot: 'bg-success' },
  warning: { bg: 'bg-warning/10', dot: 'bg-warning' },
  critical: { bg: 'bg-critical/10', dot: 'bg-critical' },
};

interface StatusBadgeProps {
  domain: StatusDomain;
  value: string;
  className?: string;
}

/** Chip de status traduzido (nunca um enum bruto) — ver apps/web/src/lib/status-i18n.ts. */
export function StatusBadge({ domain, value, className = '' }: StatusBadgeProps) {
  const { label, tone } = translateStatus(domain, value);
  const { bg, dot } = TONE_CLASSES[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-ink ${bg} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}
