// The screen tests' build, in .next-e2e: a Cerebro running from .next keeps its own files.
import { spawnSync } from 'node:child_process';

const r = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, NEXT_DIST_DIR: '.next-e2e' },
});
process.exit(r.status ?? 1);
