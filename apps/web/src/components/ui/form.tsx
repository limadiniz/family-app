'use client';

import type { ReactNode } from 'react';
import { Button } from './button';

interface FormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

/** P0.2 base component (§6.3) — groups related fields with a heading, used by the Central de Cadastros forms (P1). */
export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-1 text-sm font-semibold text-ink">{title}</legend>
      {description && <p className="-mt-3 text-xs text-inkMuted">{description}</p>}
      {children}
    </fieldset>
  );
}

interface FormActionsProps {
  submitLabel: string;
  onCancel: () => void;
  cancelLabel?: string;
  busy?: boolean;
  disabled?: boolean;
}

/** P0.2 base component (§6.3) — standard submit/cancel row so every Central de Cadastros form ends the same way. */
export function FormActions({ submitLabel, onCancel, cancelLabel = 'Cancelar', busy, disabled }: FormActionsProps) {
  return (
    <div className="flex gap-2 pt-2">
      <Button type="submit" disabled={busy || disabled}>
        {busy ? 'Salvando…' : submitLabel}
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
        {cancelLabel}
      </Button>
    </div>
  );
}
