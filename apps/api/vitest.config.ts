import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/db/migrations/**',
        'src/db/seed.ts',
        'src/shared/hono-env.ts',
        'src/domains/blueprint/repository.ts',
        'src/domains/blueprint/service.ts',
        'src/domains/blueprint/repository-live.ts',
        'src/domains/blueprint/routes.ts',
        'src/infra/nats.ts',
        'src/test-helpers/**',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
    testTimeout: 30_000,
  },
});
