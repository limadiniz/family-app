'use client';

import { useEffect } from 'react';

interface SuccessToastProps {
  message: string;
  onDismiss: () => void;
  /** ms before auto-dismiss; the person can still be mid-flow, so keep it generous. */
  durationMs?: number;
}

/**
 * P0.2 base component (§6.3), built now for its first real consumer —
 * the Central de Cadastros forms (P1): confirms a real write succeeded
 * (never shown for a simulated/optimistic save, per the hard rule
 * against faking persistence) without blocking the person from
 * immediately doing the next thing. Auto-dismisses, but `onDismiss` also
 * lets the parent clear it early (e.g. on navigating away).
 */
export function SuccessToast({ message, onDismiss, durationMs = 4000 }: SuccessToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [onDismiss, durationMs]);

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-sm items-center gap-2 rounded-lg border border-success/30 bg-surface p-4 shadow-lg sm:inset-x-auto sm:right-6"
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
      <p className="text-sm font-medium text-ink">{message}</p>
    </div>
  );
}
