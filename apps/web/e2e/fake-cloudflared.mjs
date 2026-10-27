// A fake cloudflared for the screen tests: installed, signed in, and making whatever tunnel and
// route the Cerebro asks, kept in a file of the test data folder. Answers like the real one where
// the Cerebro reads it (tunnel list --output json, the tunnel id on create, /ready on --metrics).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ID = '00000000-0000-4000-8000-0000000000e2';
const file = path.join(process.env.CEREBRO_DATA_DIR ?? '.', 'fake-cloudflared.json');
const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { tunnel: null };
const save = () => writeFileSync(file, JSON.stringify(state));
const args = process.argv.slice(2);
const flag = (name) => args[args.indexOf(name) + 1];
const out = (o) => process.stdout.write(typeof o === 'string' ? o : JSON.stringify(o));

if (args[0] === '--version') out('cloudflared version 2026.10.3 (fake)\n');
else if (args[0] !== 'tunnel') process.exit(1);
else if (args.includes('list') && process.env.FAKE_CLOUDFLARED_SIGNED_OUT) {
  process.stderr.write('ERR Cannot determine default origin certificate path.\n');
  process.exit(1);
} else if (args.includes('list'))
  out(state.tunnel ? [{ id: ID, name: state.tunnel, connections: [] }] : null);
else if (args.includes('create')) {
  writeFileSync(flag('--credentials-file'), JSON.stringify({ TunnelID: ID }));
  state.tunnel = args.at(-1);
  save();
  out(`Created tunnel ${state.tunnel} with id ${ID}\n`);
} else if (args.includes('token'))
  writeFileSync(flag('--cred-file'), JSON.stringify({ TunnelID: ID }));
else if (args.includes('route')) {
  // A name outside the owner's domains: Cloudflare refuses it.
  if (args.at(-1).endsWith('.invalid')) {
    process.stderr.write('ERR Failed to add route: zone not found\n');
    process.exit(1);
  }
} else if (args.includes('login')) {
  out('https://dash.cloudflare.com/argotunnel?aud=&callback=https%3A%2F%2Ftest\n');
  setInterval(() => {}, 1000);
} else if (args.at(-1) === 'run') {
  writeFileSync(flag('--pidfile'), String(process.pid));
  const [host, port] = flag('--metrics').split(':');
  http.createServer((_, res) => res.end('{"status":200}')).listen(Number(port), host);
} else process.exit(1);
