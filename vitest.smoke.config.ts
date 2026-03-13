import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/smoke/api/**/*.smoke.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    sequence: { concurrent: false },
    globalSetup: ['tests/smoke/api/global-setup.ts'],
  },
});
