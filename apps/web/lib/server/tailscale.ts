import { spawn } from 'node:child_process';

// The remote channel (D23): Tailscale, the owner's own private network. The Cerebro never sees
// their account; it only runs the official CLI, as a script of theirs would: to know whether it
// is installed and signed in, and to turn "serve" on or off, which publishes the Cerebro over
// HTTPS to the owner's own devices only (never to the internet; that would be Funnel).

/** Where the CLI usually is when it is not on the PATH. Tests point CEREBRO_TAILSCALE_BIN to a fake. */
const CANDIDATES = [
  'tailscale',
  'C:\\Program Files\\Tailscale\\tailscale.exe',
  '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
];

export type ChannelStatus =
  | { state: 'not-installed' }
  | { state: 'signed-out' }
  /** Installed and signed in, but not up: starting, stopped, or stuck (it says why). */
  | { state: 'not-running'; detail: string }
  | { state: 'ready'; host: string }
  | { state: 'serving'; host: string };

type Run = { code: number | null; out: string; err: string };

function run(bin: string, args: string[], timeoutMs = 20_000): Promise<Run | null> {
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
    // Stopped by the time limit, it still says what it printed (e.g. a link it waits on).
    p.on('error', () => resolve(out || err ? { code: null, out, err } : null));
    p.on('close', (code) => resolve({ code, out, err }));
  });
}

let found: string | null = null;

/** The CLI that answers, or null when Tailscale is not installed. */
async function cli(): Promise<string | null> {
  const given = process.env.CEREBRO_TAILSCALE_BIN;
  if (!given && found) return found;
  for (const bin of given ? [given] : CANDIDATES) {
    const r = await run(bin, ['version'], 10_000);
    if (r?.code === 0) return given ? bin : (found = bin);
  }
  return null;
}

const nameOf = (dns: string) => dns.replace(/\.$/, '').toLowerCase();

/** What the channel can do now, and whether this Cerebro is already served on it. */
export async function channelStatus(port: number): Promise<ChannelStatus> {
  const bin = await cli();
  if (!bin) return { state: 'not-installed' };
  const status = await run(bin, ['status', '--json']);
  let info: { BackendState?: string; Self?: { DNSName?: string }; Health?: string[] } = {};
  try {
    info = JSON.parse(status?.out ?? '{}');
  } catch {
    // Unreadable: treated as signed out, the safe answer.
  }
  const host = nameOf(info.Self?.DNSName ?? '');
  // Only a login it lacks is "signed out"; anything else not running is said as it is.
  if (
    info.BackendState === 'NeedsLogin' ||
    info.BackendState === 'NeedsMachineAuth' ||
    !info.BackendState
  )
    return { state: 'signed-out' };
  if (info.BackendState !== 'Running' || !host)
    return { state: 'not-running', detail: (info.Health ?? []).join(' ').slice(0, 300) };
  const serve = await run(bin, ['serve', 'status', '--json']);
  const target = `127.0.0.1:${port}`;
  const serving = !!serve?.out && serve.out.includes(target);
  return serving ? { state: 'serving', host } : { state: 'ready', host };
}

export type ServeResult =
  | { ok: true }
  /** `enable`: the owner must first allow Serve (or HTTPS) in their network, at this page. */
  | { ok: false; detail: string; enable?: string };

/** Serves this Cerebro to the owner's devices over HTTPS; what is missing when it cannot. */
export async function serve(port: number): Promise<ServeResult> {
  const bin = await cli();
  if (!bin) return { ok: false, detail: 'not-installed' };
  // When Serve is not yet allowed in the network, the CLI prints a link and waits: not long.
  const r = await run(bin, ['serve', '--bg', '--https=443', `http://127.0.0.1:${port}`], 8000);
  if (r?.code === 0) return { ok: true };
  const text = `${r?.err ?? ''}${r?.out ?? ''}`.trim();
  const enable = text.match(/https:\/\/login\.tailscale\.com\/\S+/)?.[0];
  return { ok: false, detail: text.split('\n')[0]!.slice(0, 200), enable };
}

export async function unserve(): Promise<boolean> {
  const bin = await cli();
  if (!bin) return false;
  return (await run(bin, ['serve', '--https=443', 'off']))?.code === 0;
}
