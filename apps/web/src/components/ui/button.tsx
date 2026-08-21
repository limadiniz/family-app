'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type ButtonSize = 'md' | 'sm';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // primary: preenchimento sólido `primary` + texto branco 16px semibold —
  // ver a nota de contraste em packages/ui/src/tokens.ts (fica no piso AA
  // para texto grande/negrito, não para texto pequeno; por isso o padrão
  // aqui nunca cai abaixo de text-base font-semibold).
  primary: 'bg-primary text-white hover:opacity-90 disabled:opacity-50',
  secondary: 'bg-surfaceMuted text-ink hover:opacity-80 disabled:opacity-50',
  ghost: 'bg-transparent text-ink hover:bg-surfaceMuted disabled:opacity-50',
  destructive: 'bg-critical text-white hover:opacity-90 disabled:opacity-50',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'min-h-touch px-4 text-base font-semibold',
  sm: 'min-h-touch px-3 text-sm font-medium',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

/** Botão base do design system (ZELII P0 §6.3) — alvo de toque ≥44px, foco visível herdado do :focus-visible global. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className = '', children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 rounded-md transition-colors disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Obrigatório — um botão só de ícone sem rótulo acessível é um beco sem saída pra leitor de tela. */
  'aria-label': string;
  children: ReactNode;
}

/** Botão só-ícone, mesmo alvo de toque mínimo de 44px do Button. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', className = '', children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex min-h-touch min-w-touch items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});
