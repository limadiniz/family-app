'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

/** Contêiner base — raio grande (14–20px) e superfície neutra, usado por toda tela interna. */
export function Card({ children, className = '' }: CardProps) {
  return <div className={`rounded-lg border border-border bg-surface p-6 ${className}`}>{children}</div>;
}

interface ActionCardProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
}

/**
 * Cartão clicável (rota interna via `href`, ou ação via `onClick`) —
 * nunca os dois ao mesmo tempo. Sempre um elemento nativamente focável
 * (`<a>`/`<button>`), nunca uma `<div onClick>` inacessível a teclado.
 */
export function ActionCard({ title, description, icon, href, onClick, className = '' }: ActionCardProps) {
  const content = (
    <>
      {icon && <div className="text-primary">{icon}</div>}
      <div className="flex-1">
        <p className="font-medium text-ink">{title}</p>
        {description && <p className="mt-0.5 text-sm text-inkMuted">{description}</p>}
      </div>
    </>
  );
  const classes = `flex min-h-touch w-full items-center gap-3 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:bg-surfaceMuted ${className}`;

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {content}
    </button>
  );
}
