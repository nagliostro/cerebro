import { createSocket } from 'node:dgram';

// The Dominus clock: never trust the computer's clock for dates and times, it may be wrong by
// hours or days. Measure its offset against online time services and apply it; the system clock
// is never changed. NTP first (UDP 123, precise); the Date header of well-known HTTPS sites as a
// fallback where UDP is blocked (~1 s precision). Offline: the last offset, marked as unchecked.
//
// This is the only file that may read the computer's clock. Everything else calls nowMs().

export type ClockState = {
  /** Added to the computer's clock to get the real time. */
  offsetMs: number;
  sources: { source: string; offsetMs: number; rttMs: number }[];
  /** Real time of the last successful sync; null when it never synced. */
  syncedAt: number | null;
  /** false: no source answered on the last try, so the time was not checked. */
  synced: boolean;
};

const NTP_SERVERS = ['time.google.com', 'time.cloudflare.com', 'pool.ntp.org'];
const HTTP_SOURCES = ['https://www.google.com', 'https://www.cloudflare.com'];
const NTP_EPOCH = 2_208_988_800; // seconds from 1900 to 1970

const computerMs = () => Date.now();

function ntp(host: string, timeoutMs = 2000): Promise<{ offsetMs: number; rttMs: number }> {
  return new Promise((resolve, reject) => {
    const sock = createSocket('udp4');
    const packet = Buffer.alloc(48);
    packet[0] = 0x1b; // client, version 3
    const timer = setTimeout(() => (sock.close(), reject(new Error('timeout'))), timeoutMs);
    const t0 = computerMs();
    sock.once('message', (msg) => {
      const t3 = computerMs();
      clearTimeout(timer);
      sock.close();
      const read = (at: number) =>
        (msg.readUInt32BE(at) - NTP_EPOCH) * 1000 + (msg.readUInt32BE(at + 4) * 1000) / 2 ** 32;
      const t1 = read(32); // server received
      const t2 = read(40); // server sent
      resolve({ offsetMs: (t1 - t0 + (t2 - t3)) / 2, rttMs: t3 - t0 - (t2 - t1) });
    });
    sock.once('error', (e) => (clearTimeout(timer), sock.close(), reject(e)));
    sock.send(packet, 123, host);
  });
}

async function httpDate(url: string, timeoutMs = 3000) {
  const t0 = computerMs();
  const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs) });
  const t1 = computerMs();
  const date = Date.parse(res.headers.get('date') ?? '');
  if (Number.isNaN(date)) throw new Error('no Date header');
  // The header has whole seconds: +500 ms centers the truncation.
  return { offsetMs: date + 500 - (t0 + t1) / 2, rttMs: t1 - t0 };
}

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

let state: ClockState = { offsetMs: 0, sources: [], syncedAt: null, synced: false };

/** The real time in milliseconds: the computer's clock corrected by the measured offset. */
export const nowMs = () => computerMs() + state.offsetMs;
export const clockState = () => state;

/** For tests and for restoring the last offset measured before a restart. */
export function setOffset(offsetMs: number) {
  state = { ...state, offsetMs };
}

/** `ntp: false` skips NTP, as on a network that blocks UDP. */
export async function syncClock(opts: { ntp?: boolean } = {}): Promise<ClockState> {
  const tries = await Promise.allSettled(
    (opts.ntp === false ? [] : NTP_SERVERS).map((h) =>
      ntp(h).then((r) => ({ source: `ntp:${h}`, ...r })),
    ),
  );
  let sources = tries.flatMap((t) => (t.status === 'fulfilled' ? [t.value] : []));
  if (!sources.length) {
    const http = await Promise.allSettled(
      HTTP_SOURCES.map((u) => httpDate(u).then((r) => ({ source: u, ...r }))),
    );
    sources = http.flatMap((t) => (t.status === 'fulfilled' ? [t.value] : []));
  }
  if (sources.length) {
    const offsetMs = Math.round(median(sources.map((s) => s.offsetMs)));
    state = { offsetMs, sources, syncedAt: computerMs() + offsetMs, synced: true };
  } else state = { ...state, sources: [], synced: false };
  return state;
}
