import type { ReactNode } from 'react';
import Link from 'next/link';
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

interface OnboardingRequiredStateProps {
  /** `/app/onboarding?returnTo=...` — build with `buildOnboardingUrl()`, never a raw string. */
  onboardingHref: string;
  onRetry: () => void;
  retrying?: boolean;
}

/**
 * §8 — dedicated state for "you haven't finished onboarding", distinct
 * from `ErrorState`: this isn't a failure, it's an expected step. Two
 * actions, in order of what most people need: finish onboarding (primary),
 * or re-check status (secondary — covers "I already finished this in
 * another tab").
 */
export function OnboardingRequiredState({ onboardingHref, onRetry, retrying }: OnboardingRequiredStateProps) {
  return (
    <div className="mx-auto mt-8 max-w-md rounded-lg border border-border bg-surface p-6 text-center" role="status">
      <p className="text-lg font-semibold text-ink">Falta pouco para preparar sua ZELII</p>
      <p className="mt-2 text-sm text-inkMuted">
        Conclua as informações básicas da família para começar a organizar sua rotina.
      </p>
      <div className="mt-4 flex flex-col items-center gap-2">
        {/* Real navigation (Link), not a button faking a click-to-navigate —
            this is the primary action, semantically a link to another page. */}
        <Link
          href={onboardingHref}
          className="inline-flex min-h-touch items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-white transition-colors hover:opacity-90"
        >
          Concluir cadastro
        </Link>
        <Button variant="ghost" size="sm" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Verificando…' : 'Tentar novamente'}
        </Button>
      </div>
    </div>
  );
}

interface PermissionDeniedStateProps {
  description?: string;
}

/**
 * P0.5 — a Policy Engine denial (`ApiError.code === 'POLICY_DENIED'`, see
 * `lib/api-client.ts`'s `isPermissionDenied`) is NOT the same state as a
 * failed request: nothing is broken, the person just isn't authorized to
 * see this — an expected boundary, not an error to retry. Distinct from
 * both `ErrorState` (no critical/red tone, no "tentar de novo" — retrying
 * the same request returns the same denial) and `OnboardingRequiredState`
 * (that one has a fix-it action; this one doesn't, by design).
 */
export function PermissionDeniedState({ description }: PermissionDeniedStateProps) {
  return (
    <div className="rounded-lg border border-border bg-surfaceMuted p-6 text-center" role="status">
      <p className="text-sm font-medium text-ink">Você não tem permissão para ver isso</p>
      <p className="mt-1 text-sm text-inkMuted">{description ?? 'Fale com um responsável da família se acha que deveria ter acesso.'}</p>
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
