import { z } from 'zod';

/**
 * Brazilian formats (§123). Deliberately does NOT include a CPF schema
 * as a structural/required key anywhere in the platform — CPF is never
 * required as a structural key for a child or guardian (§123: "Não
 * exigir CPF de criança ou responsável como chave estrutural"). A CPF
 * *field* may still be added later as an OPTIONAL, purely informational
 * attribute (e.g. for invoicing) — that is a distinct, deliberate
 * product decision, not an oversight.
 */

export const cepSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === 8, { message: 'CEP deve conter 8 dígitos' });

export const brPhoneSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === 10 || v.length === 11, {
    message: 'Telefone deve conter 10 ou 11 dígitos (DDD + número)',
  });

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export function formatBRDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(iso));
}

export function formatCEP(digits: string): string {
  const clean = digits.replace(/\D/g, '');
  return clean.length === 8 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : digits;
}
