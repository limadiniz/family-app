import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // RLS integration tests share one Postgres connection/transaction
    // pattern and must not run concurrently against the same database.
    fileParallelism: false,
    testTimeout: 20000,
  },
});
