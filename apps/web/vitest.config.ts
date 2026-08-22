import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Dois tipos de teste convivem aqui: lógica pura (`test/*.test.ts` —
 * status-i18n, api-client, cadastro-config, ...) e componentes React
 * (`test/*.test.tsx` — os formulários de cadastro, o error boundary de
 * `/app`, a validação de shape de `today`/`calendar`). jsdom é
 * superconjunto de node (tem os globals do Node + o DOM), então um único
 * ambiente serve os dois — não precisa de dois projetos Vitest
 * separados. `setupFiles` registra os matchers do jest-dom
 * (`toBeInTheDocument`, ...) e o `cleanup()` automático do Testing
 * Library.
 *
 * O alias `@` espelha `paths` do tsconfig.json — sem ele, um módulo que
 * importa algo como `@/components/ui/nav-icons` (convenção do resto do
 * app) falha só dentro do Vitest, não no build real do Next (que já
 * resolve `paths` nativamente).
 */
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['./test/setup-tests.ts'],
    css: false,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
