/**
 * Setup global para testes de componente (jsdom) — registra os matchers
 * do jest-dom (`toBeInTheDocument`, `toHaveTextContent`, ...) no `expect`
 * do Vitest e garante `cleanup()` automático do React Testing Library
 * entre testes, pra um teste nunca ver o DOM deixado pelo anterior.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
