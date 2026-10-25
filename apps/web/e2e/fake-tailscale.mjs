// A fake Tailscale CLI for the screen tests: installed, signed in, and serving whatever the
// Cerebro asks, kept in a file of the test data folder. Answers like the real one where the
// Cerebro reads it (status --json, serve status --json).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const HOST = 'cerebro-e2e.tail-example.ts.net';
const file = path.join(process.env.CEREBRO_DATA_DIR ?? '.', 'fake-tailscale.json');
const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { target: null };
const args = process.argv.slice(2);
const out = (o) => process.stdout.write(typeof o === 'string' ? o : JSON.stringify(o));

if (args[0] === 'version') out('1.90.0\n');
else if (args[0] === 'status' && process.env.FAKE_TAILSCALE_STUCK)
  out({
    BackendState: 'NoState',
    Self: { DNSName: '' },
    Health: ['Tailscale is starting. Please wait.'],
  });
else if (args[0] === 'status') out({ BackendState: 'Running', Self: { DNSName: `${HOST}.` } });
else if (args[0] === 'serve' && args[1] === 'status')
  out(
    state.target
      ? { Web: { [`${HOST}:443`]: { Handlers: { '/': { Proxy: state.target } } } } }
      : {},
  );
else if (args[0] === 'serve' && args.at(-1) === 'off')
  writeFileSync(file, JSON.stringify({ target: null }));
else if (args[0] === 'serve' && process.env.FAKE_TAILSCALE_NEEDS_SERVE) {
  // A network where Serve was never allowed: the real CLI prints a link and waits.
  out(
    'Serve is not enabled on your tailnet.\nTo enable, visit:\n\n         https://login.tailscale.com/f/serve?node=TEST\n',
  );
  setInterval(() => {}, 1000);
} else if (args[0] === 'serve') writeFileSync(file, JSON.stringify({ target: args.at(-1) }));
else process.exit(1);
