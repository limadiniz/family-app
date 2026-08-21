import { defineConfig } from 'vitest/config';

/**
 * Testes de lógica pura (sem DOM/React) — apps/web/src/lib. Testar
 * componentes React exigiria jsdom + Testing Library, um investimento
 * maior que o proporcional a este passo do P0; o que vale testar agora
 * é a lógica que já tem efeito em várias telas por trás dos componentes
 * de UI, como translateStatus (todo StatusBadge passa por ela).
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
