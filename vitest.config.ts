// Vitest configuration for the TypeScript extraction and compatibility test suites.

import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], testTimeout: 15000, restoreMocks: true },
});
