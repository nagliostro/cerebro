import { spawn, type ChildProcess } from 'node:child_process';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';

import { privatePath, readPrivateJson, writePrivateJson } from './private-files';
import { clearRemoteHost, remoteHost, setRemoteHost } from './remote';

// The remote channel: a Cloudflare Tunnel to an address of the owner's own domain (e.g.
// "meucerebro.app"). The Cerebro never sees their account; it only runs the official CLI,
// cloudflared, as a script of theirs would: to sign in once (a page of Cloudflare, in their
// browser), to make the tunnel and point the address to it, and to keep it running while the
// Cerebro runs. To the networks on the way it is plain HTTPS, which firewalls let through. The
// address reaches the door of the Cerebro from anywhere; only paired devices go in.

/** Where the CLI usually is when it is not on the PATH. Tests point CEREBRO_CLOUDFLARED_BIN to a fake. */
const CANDIDATES = [
  'cloudflared',
  'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
  'C:\\Program Files\\cloudflared\\cloudflared.exe',
  '/opt/homebrew/bin/cloudflared',
  '/usr/local/bin/cloudflared',
];

const TUNNEL = 'cerebro';
// What the tunnel needs, in the data folder: its secret, its routes, and its process number.
const CREDENTIALS = 'tunnel-credentials.json';
const CONFIG = 'tunnel.yml';
const PIDFILE = 'tunnel.pid';
/** The last address used, to offer it again after turning off. */
const LAST = 'tunnel.json';

/** Where cloudflared says whether it is connected (GET /ready answers 200 when it is). */
const metrics = () => process.env.CEREBRO_TUNNEL_METRICS ?? '127.0.0.1:20241';

export type ChannelStatus =
  | { state: 'not-installed' }
  | { state: 'signed-out' }
  /** Signed in; `host` is the address used before, if any. */
  | { state: 'ready'; host: string | null }
  | { state: 'connecting'; host: string }
  | { state: 'serving'; host: string }
  /** On, but the tunnel is not connected (it says why when it can). */
  | { state: 'not-running'; host: string; detail: string };

type Run = { code: number | null; out: string; err: string };

function run(bin: string, args: string[], timeoutMs = 30_000): Promise<Run | null> {
  // A fake CLI in the tests is a Node script.
  const [cmd, pre] = /\.m?js$/.test(bin) ? [process.execPath, [bin]] : [bin, []];
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    const p = spawn(cmd, [...pre, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      signal: AbortSignal.timeout(timeoutMs),
    });
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', () => resolve(out || err ? { code: null, out, err } : null));
    p.on('close', (code) => resolve({ code, out, err }));
  });
}

let found: string | null = null;

/** The CLI that answers, or null when cloudflared is not installed. */
async function cli(): Promise<string | null> {
  const given = process.env.CEREBRO_CLOUDFLARED_BIN;
  if (!given && found) return found;
  for (const bin of given ? [given] : CANDIDATES) {
    const r = await run(bin, ['--version'], 10_000);
    if (r?.code === 0) return given ? bin : (found = bin);
  }
  return null;
}

/** cloudflared logs as lines of "time LEVEL message"; the last error says what went wrong. */
const lastError = (text: string) =>
  text
    .split('\n')
    .filter((l) => /\b(ERR|error)\b/i.test(l) && !/outdated/i.test(l))
    .at(-1)
    ?.replace(/^(?:\S+\s+)?ERR\s+/, '')
    .trim()
    .slice(0, 200) ?? '';

// The running tunnel and the sign-in waiting on the browser, kept across reloads of this module
// in development.
type Live = { tunnel: ChildProcess | null; log: string; login: Promise<string | null> | null };
const live: Live = ((globalThis as { __cerebroTunnel?: Live }).__cerebroTunnel ??= {
  tunnel: null,
  log: '',
  login: null,
});

const alive = (p: ChildProcess | null) => !!p && p.exitCode === null && p.signalCode === null;

async function connected(): Promise<boolean> {
  try {
    const res = await fetch(`http://${metrics()}/ready`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** A tunnel left by an earlier run of the Cerebro (it outlives the server on Windows). */
async function stopLeftover() {
  const pid = Number(await readFile(privatePath(PIDFILE), 'utf8').catch(() => ''));
  if (pid > 0 && pid !== live.tunnel?.pid) {
    try {
      process.kill(pid);
    } catch {
      // Already gone.
    }
  }
  await rm(privatePath(PIDFILE), { force: true });
}

/**
 * The tunnel goes to the port this server answers on now, not the one it had when turned on
 * (started on another port, the address would answer 502 Bad gateway).
 */
async function followPort() {
  const port = process.env.PORT;
  if (!port) return;
  const config = await readFile(privatePath(CONFIG), 'utf8').catch(() => null);
  const moved = config?.replace(/(service: http:\/\/127\.0\.0\.1:)\d+/, `$1${port}`);
  if (moved && moved !== config) await writeFile(privatePath(CONFIG), moved, { mode: 0o600 });
}

/** Runs the tunnel made by turnOn, if it is not running yet. */
export async function startTunnel(): Promise<void> {
  if (alive(live.tunnel)) return;
  const bin = await cli();
  if (!bin) return;
  await stopLeftover();
  await followPort();
  const [cmd, pre] = /\.m?js$/.test(bin) ? [process.execPath, [bin]] : [bin, []];
  // Auto-update off: the CLI belongs to the owner's installer (winget, Homebrew), not to us.
  const p = spawn(
    cmd,
    [
      ...pre,
      'tunnel',
      '--no-autoupdate',
      '--metrics',
      metrics(),
      '--pidfile',
      privatePath(PIDFILE),
      '--config',
      privatePath(CONFIG),
      'run',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
  );
  live.tunnel = p;
  live.log = '';
  p.stderr?.on('data', (d) => (live.log = (live.log + d).slice(-4000)));
  p.on('error', (e) => (live.log += `\nERR ${e.message}`));
}

function stopTunnel() {
  if (alive(live.tunnel)) live.tunnel!.kill();
  live.tunnel = null;
}

/** What the channel can do now, and whether this Cerebro is reachable on it. */
export async function channelStatus(): Promise<ChannelStatus> {
  const bin = await cli();
  if (!bin) return { state: 'not-installed' };
  const host = await remoteHost();
  if (host) {
    if (await connected()) return { state: 'serving', host };
    if (alive(live.tunnel)) return { state: 'connecting', host };
    return { state: 'not-running', host, detail: lastError(live.log) };
  }
  // Signed in is having the certificate of the sign-in; listing the tunnels proves it.
  const list = await run(bin, ['tunnel', 'list', '--output', 'json', '--name', TUNNEL]);
  if (list?.code !== 0) return { state: 'signed-out' };
  const last = await readPrivateJson<{ host?: string }>(LAST);
  return { state: 'ready', host: last?.host ?? null };
}

/**
 * Signs cloudflared in to the owner's Cloudflare account: it opens a page of Cloudflare in the
 * browser (on this computer) and waits there until they authorize. The link, to open it again.
 */
export async function signIn(): Promise<string | null> {
  const bin = await cli();
  if (!bin) return null;
  live.login ??= new Promise<string | null>((resolve) => {
    const [cmd, pre] = /\.m?js$/.test(bin) ? [process.execPath, [bin]] : [bin, []];
    // Cloudflare gives the page some minutes; the Cerebro waits as long.
    const p = spawn(cmd, [...pre, 'tunnel', 'login'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      signal: AbortSignal.timeout(10 * 60_000),
    });
    let text = '';
    const read = (d: Buffer) => {
      text += d;
      const url = text.match(/https:\/\/dash\.cloudflare\.com\/\S+/)?.[0];
      if (url) resolve(url);
    };
    p.stdout.on('data', read);
    p.stderr.on('data', read);
    p.on('error', () => resolve(null));
    p.on('close', () => {
      live.login = null;
      resolve(null);
    });
  });
  return live.login;
}

export type TurnOnResult =
  { ok: true } | { ok: false; error: 'bad-host' | 'failed'; detail?: string };

const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** The tunnel's id, made the first time; its secret goes to the data folder. */
async function tunnelId(bin: string): Promise<{ id: string } | { detail: string }> {
  const list = await run(bin, ['tunnel', 'list', '--output', 'json', '--name', TUNNEL]);
  let found: { id: string }[] = [];
  try {
    found = JSON.parse(list?.out || '[]') ?? [];
  } catch {
    // Read as none.
  }
  const file = privatePath(CREDENTIALS);
  const hasFile = await stat(file).then(
    () => true,
    () => false,
  );
  if (found[0] && hasFile) return { id: found[0].id };
  const r = found[0]
    ? // Made before (on another computer, or the file was lost): its secret again.
      await run(bin, ['tunnel', 'token', '--cred-file', file, TUNNEL])
    : await run(bin, ['tunnel', 'create', '--credentials-file', file, TUNNEL]);
  if (r?.code !== 0) return { detail: lastError(`${r?.err}\n${r?.out}`) || 'tunnel' };
  if (found[0]) return { id: found[0].id };
  const id = r.out.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0];
  return id ? { id } : { detail: 'tunnel' };
}

/**
 * Puts this Cerebro at `address`, a domain (or a name under it) of the owner's Cloudflare
 * account: the tunnel made once, the address pointed to it, and the tunnel running.
 */
export async function turnOn(address: string, port: number): Promise<TurnOnResult> {
  const host = address
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  if (!HOST.test(host)) return { ok: false, error: 'bad-host' };
  const bin = await cli();
  if (!bin) return { ok: false, error: 'failed', detail: 'not-installed' };
  const tunnel = await tunnelId(bin);
  if ('detail' in tunnel) return { ok: false, error: 'failed', detail: tunnel.detail };
  const dns = await run(bin, ['tunnel', 'route', 'dns', '--overwrite-dns', tunnel.id, host]);
  if (dns?.code !== 0)
    return { ok: false, error: 'failed', detail: lastError(`${dns?.err}\n${dns?.out}`) || 'dns' };
  // Only this address goes to the Cerebro; anything else the tunnel is asked for is a 404.
  await writeFile(
    privatePath(CONFIG),
    [
      `tunnel: ${tunnel.id}`,
      `credentials-file: ${JSON.stringify(privatePath(CREDENTIALS))}`,
      'ingress:',
      `  - hostname: ${host}`,
      `    service: http://127.0.0.1:${port}`,
      '  - service: http_status:404',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  await writePrivateJson(LAST, { host });
  await setRemoteHost(host);
  stopTunnel();
  await startTunnel();
  // The first connection takes a few seconds; the screen keeps asking after that.
  for (let i = 0; i < 20 && !(await connected()); i++) await new Promise((r) => setTimeout(r, 500));
  return { ok: true };
}

export async function turnOff(): Promise<void> {
  stopTunnel();
  await stopLeftover();
  await clearRemoteHost();
}
