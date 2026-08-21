import type { ReactNode } from 'react';
import { Button } from './button';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

/** Nada aqui ainda — nunca um espaço em branco silencioso. */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface p-6 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 text-sm text-inkMuted">{description}</p>}
      {action && (
        <Button variant="secondary" size="sm" onClick={action.onClick} className="mt-4">
          {action.label}
        </Button>
      )}
    </div>
  );
}

interface LoadingStateProps {
  label?: string;
}

/** Estado de carregamento — texto, não só um spinner mudo, pra leitor de tela também dizer algo. */
export function LoadingState({ label = 'Carregando…' }: LoadingStateProps) {
  return (
    <div role="status" className="flex items-center gap-2 p-6 text-sm text-inkMuted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" aria-hidden="true" />
      {label}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  children?: ReactNode;
}

/**
 * Erro isolado a UM widget — nunca derruba a página inteira (§7: "um
 * widget não crítico com erro não deve inutilizar toda a página").
 */
export function ErrorState({ title = 'Não foi possível carregar', description, onRetry, children }: ErrorStateProps) {
  return (
    <div className="rounded-lg border border-critical/30 bg-critical/5 p-6" role="alert">
      <p className="text-sm font-medium text-critical">{title}</p>
      {description && <p className="mt-1 text-sm text-inkMuted">{description}</p>}
      {children}
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-4">
          Tentar de novo
        </Button>
      )}
    </div>
  );
}
