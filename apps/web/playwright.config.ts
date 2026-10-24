import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

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
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    // Next directly, not through pnpm: on Linux and macOS the pnpm wrapper kept the server alive
    // after the tests and the run never ended.
    command: `node node_modules/next/dist/bin/next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
  },
  projects: chosen.flatMap((engine) =>
    widths.map((w) => ({
      name: `${engine}-${w.name}`,
      use: { ...engines[engine], viewport: w.viewport, hasTouch: w.hasTouch },
      // Firefox on Windows sometimes hangs opening a page when several run at once; one retry,
      // and the report marks the test as flaky instead of hiding it.
      retries: engine === 'firefox' ? 1 : 0,
    })),
  ),
});
