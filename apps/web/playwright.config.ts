import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
// Its own data folder, so the tests never touch the owner's sessions. The tests read it too, to
// sign in the way the owner does (see e2e/sign-in.ts).
export const E2E_DATA_DIR = path.join(os.tmpdir(), `cerebro-e2e-${PORT}`);
process.env.CEREBRO_DATA_DIR = E2E_DATA_DIR;
// Each run starts from an empty data folder, so the neurons one run builds never change the next.
// Only the main process clears it (this file is loaded again in every worker), before the server.
if (!process.env.TEST_WORKER_INDEX && !process.env.CEREBRO_E2E_CLEARED) {
  rmSync(E2E_DATA_DIR, { recursive: true, force: true });
  process.env.CEREBRO_E2E_CLEARED = '1';
}
// The session the setup project leaves for every test (cookies of a signed-in browser).
export const SIGNED_IN = path.join(E2E_DATA_DIR, 'signed-in.json');

// Runs the built app (next start) on its own port: the same thing a clean install runs.
// Three engines at the three widths of the design (390, 820, 1440). CI can narrow the
// engines with BROWSERS=chromium on the slower runners.
const engines = {
  chromium: devices['Desktop Chrome'],
  firefox: devices['Desktop Firefox'],
  webkit: devices['Desktop Safari'],
};
const widths = [
  { name: 'phone', viewport: { width: 390, height: 844 }, hasTouch: true },
  { name: 'tablet', viewport: { width: 820, height: 1180 }, hasTouch: true },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, hasTouch: false },
];
const chosen = (process.env.BROWSERS ?? 'chromium,firefox,webkit').split(
  ',',
) as (keyof typeof engines)[];

export default defineConfig({
  testDir: './e2e',
  // Few browsers at once: Firefox on Windows times out while starting when many open together.
  workers: 3,
  // Firefox takes about 3x longer to start than the others; 30 s was tight under load.
  timeout: 60_000,
  // In CI, each test in the log and the failures annotated on the run.
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  // Never hang a run: the whole suite has 10 minutes.
  globalTimeout: 10 * 60_000,
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    // Next directly, not through pnpm: on Linux and macOS the pnpm wrapper kept the server alive
    // after the tests and the run never ended.
    command: `node node_modules/next/dist/bin/next start -H 127.0.0.1 -p ${PORT}`,
    // The locked screen answers too, so the server is ready when any page answers.
    url: `http://127.0.0.1:${PORT}/locked`,
    // No real AI on purpose (a Claude Code that does not exist), so the screens look the same on
    // every computer; the simulated one plans and builds, without spending anything.
    env: {
      CEREBRO_DATA_DIR: E2E_DATA_DIR,
      CEREBRO_CLAUDE_BIN: path.join(E2E_DATA_DIR, 'no-claude'),
      CEREBRO_SIMULATED: '1',
      CEREBRO_SIM_STEP_MS: '700',
    },
    reuseExistingServer: false,
  },
  projects: [
    // Signs in once, the way the owner does, before any screen test.
    { name: 'setup', testMatch: /sign-in\.setup\.ts/ },
    ...chosen.flatMap((engine) =>
      widths.map((w) => ({
        name: `${engine}-${w.name}`,
        dependencies: ['setup'],
        testIgnore: /build\.spec\.ts/,
        use: {
          ...engines[engine],
          viewport: w.viewport,
          hasTouch: w.hasTouch,
          storageState: SIGNED_IN,
        },
        // Firefox on Windows sometimes hangs opening a page when several run at once; one retry,
        // and the report marks the test as flaky instead of hiding it.
        retries: engine === 'firefox' ? 1 : 0,
      })),
    ),
    // Building neurons changes the graph the other screens count: it runs after all of them, in
    // one engine, on a phone and then on a desktop (one owner has one open plan at a time).
    ...widths
      .filter((w) => w.name !== 'tablet')
      .map((w, i) => ({
        name: `build-${w.name}`,
        dependencies: i
          ? ['build-phone']
          : chosen.flatMap((engine) => widths.map((x) => `${engine}-${x.name}`)),
        testMatch: /build\.spec\.ts/,
        use: {
          ...engines.chromium,
          viewport: w.viewport,
          hasTouch: w.hasTouch,
          storageState: SIGNED_IN,
        },
      })),
  ],
});
