import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Unit tests; e2e/*.spec.ts belong to Playwright.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules/**', 'e2e/**', '.next/**', '.next-e2e/**'],
  },
});
