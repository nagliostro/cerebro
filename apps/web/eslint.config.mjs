import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // One way to show a notice: lib/toast.ts (and the Toaster that draws them), never Sonner itself.
  {
    ignores: ['lib/toast.ts', 'components/toaster.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'sonner', message: 'Use notify from @/lib/toast.' }] },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    '.next-e2e/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'playwright-report/**',
    'test-results/**',
    // Libraries of the neuron kit, copied as their authors publish them (scripts/kit-libs.mjs).
    'public/neuron-kit/lib/**',
  ]),
]);

export default eslintConfig;
