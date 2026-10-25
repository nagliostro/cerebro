import { defineConfig } from 'vitest/config';

// The core tests start real processes (core and workers), so they get more time than the default.
export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'], testTimeout: 30_000 },
});
