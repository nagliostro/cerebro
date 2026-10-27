import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { t, type Locale } from '@/lib/i18n';

import { privateMtime, readPrivateJson, removePrivate, writePrivateJson } from './private-files';

// Who is the owner. There is no password: whoever started the Cerebro is the owner, so the
// terminal shows a link with a one-time key (the way Jupyter and VS Code Server do it), and a
// phone is paired by a one-time code shown on the computer. Either gives that browser a session
// cookie; the server keeps only hashes, so reading its files never reveals a usable key or
// session. Each session is one device: listed with what it is and when it was last seen, and
// revoked on its own.
//
// Everything lives in files of the data folder, not in memory: the proxy and the pages run
// as separate bundles that share no state, and sessions must survive a restart.

export const SESSION_COOKIE = 'cerebro_session';
export const KEY_PARAM = 'key';
export const PAIR_PARAM = 'pair';

/** A key that was never used expires, so a link left in the terminal's history is worthless. */
const KEY_LIFETIME_MS = 15 * 60_000;
/** A pairing code is on the screen, in front of the owner: it lasts only a few minutes. */
const PAIR_LIFETIME_MS = 5 * 60_000;
/** "Last seen" is written at most this often, so a request does not mean a write. */
const SEEN_EVERY_MS = 10 * 60_000;

const SESSIONS_FILE = 'sessions.json';
const KEY_FILE = 'launch-key.json';
const PAIR_FILE = 'pair-key.json';

/** What a device is, read from its browser, for the owner to recognize it. */
export type Device = { browser: string; system: string; kind: 'phone' | 'tablet' | 'computer' };
// Times are durations and labels on this computer, so its clock is enough even when it is off.
type Session = { hash: string; createdAt: number; lastSeen: number; device: Device };
type SessionsFile = { sessions: Session[] } | { hashes: string[] };
type KeyFile = { hash: string; expiresAt: number };

/** A session as the screen shows it: an id that is not the secret, never the hash itself. */
export type SessionInfo = { id: string; createdAt: number; lastSeen: number; device: Device };

const newSecret = () => randomBytes(32).toString('base64url');
const hash = (secret: string) => createHash('sha256').update(secret).digest('hex');
const idOf = (h: string) => h.slice(0, 16);
const UNKNOWN: Device = { browser: '', system: '', kind: 'computer' };

/** The browser and system from a User-Agent, the way sites list "where you're signed in". */
export function deviceFrom(ua: string | null | undefined): Device {
  const s = ua ?? '';
  const system = /iPhone|iPad|iPod/.test(s)
    ? 'iOS'
    : /Android/.test(s)
      ? 'Android'
      : /Windows/.test(s)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(s)
          ? 'macOS'
          : /Linux|X11/.test(s)
            ? 'Linux'
            : '';
  const browser = /Edg\//.test(s)
    ? 'Edge'
    : /Firefox\/|FxiOS/.test(s)
      ? 'Firefox'
      : /Chrome\/|CriOS/.test(s)
        ? 'Chrome'
        : /Safari\//.test(s)
          ? 'Safari'
          : '';
  const kind = /iPad|Tablet/.test(s)
    ? 'tablet'
    : /Mobile|iPhone|Android/.test(s)
      ? 'phone'
      : 'computer';
  return { browser, system, kind };
}

let cache: { mtime: number; sessions: Session[] } | null = null;

async function sessions(): Promise<Session[]> {
  const mtime = await privateMtime(SESSIONS_FILE);
  if (cache?.mtime !== mtime) {
    const file = await readPrivateJson<SessionsFile>(SESSIONS_FILE);
    // A file from before devices were kept: its sessions stay valid, as unknown devices.
    const list =
      file && 'hashes' in file
        ? file.hashes.map((h) => ({ hash: h, createdAt: 0, lastSeen: 0, device: UNKNOWN }))
        : (file?.sessions ?? []);
    cache = { mtime, sessions: list };
  }
  return cache.sessions;
}

const save = (list: Session[]) => writePrivateJson(SESSIONS_FILE, { sessions: list });

export async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const h = hash(token);
  return (await sessions()).some((s) => s.hash === h);
}

/** A new session for one device; returns the token that goes into its cookie. */
export async function createSession(device: Device = UNKNOWN, now = Date.now()): Promise<string> {
  const token = newSecret();
  const list = await sessions();
  await save([...list, { hash: hash(token), createdAt: now, lastSeen: now, device }]);
  return token;
}

/** The device was here now; written only when the last mark is old. */
export async function touchSession(token: string | undefined, now = Date.now()) {
  if (!token) return;
  const h = hash(token);
  const list = await sessions();
  const s = list.find((x) => x.hash === h);
  if (!s || now - s.lastSeen < SEEN_EVERY_MS) return;
  await save(list.map((x) => (x.hash === h ? { ...x, lastSeen: now } : x)));
}

/** Every device that can enter, the most recently seen first. */
export async function listSessions(): Promise<SessionInfo[]> {
  return [...(await sessions())]
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .map((s) => ({
      id: idOf(s.hash),
      createdAt: s.createdAt,
      lastSeen: s.lastSeen,
      device: s.device,
    }));
}

/** The id the screen uses for the session behind this cookie. */
export const sessionId = (token: string) => idOf(hash(token));

/** Takes one device out at once; true if it existed. */
export async function revokeSession(id: string): Promise<boolean> {
  const list = await sessions();
  const rest = list.filter((s) => idOf(s.hash) !== id);
  if (rest.length === list.length) return false;
  await save(rest);
  return true;
}

// ---- One-time keys: the terminal's link and the pairing code. ----

async function issue(file: string, lifetime: number, now: number): Promise<string> {
  const key = newSecret();
  await writePrivateJson(file, { hash: hash(key), expiresAt: now + lifetime });
  return key;
}

async function redeem(file: string, key: string, now: number): Promise<boolean> {
  const stored = await readPrivateJson<KeyFile>(file);
  if (!stored || stored.expiresAt <= now) return false;
  const matches = timingSafeEqual(Buffer.from(hash(key)), Buffer.from(stored.hash));
  if (matches) await removePrivate(file);
  return matches;
}

/** A fresh one-time key, replacing any earlier one. The caller shows it in the terminal. */
export const issueLaunchKey = (now = Date.now()) => issue(KEY_FILE, KEY_LIFETIME_MS, now);

/** Whether there is a key that can still be used, so a new one is issued only when needed. */
export async function hasLiveLaunchKey(now = Date.now()): Promise<boolean> {
  const file = await readPrivateJson<KeyFile>(KEY_FILE);
  return !!file && file.expiresAt > now;
}

/** Uses the key up: true at most once per key, and never after it expires. */
export const redeemLaunchKey = (key: string, now = Date.now()) => redeem(KEY_FILE, key, now);

/** A pairing code for one phone, replacing any earlier one; with when it expires. */
export async function issuePairKey(now = Date.now()) {
  return { key: await issue(PAIR_FILE, PAIR_LIFETIME_MS, now), expiresAt: now + PAIR_LIFETIME_MS };
}

export const redeemPairKey = (key: string, now = Date.now()) => redeem(PAIR_FILE, key, now);

/** The line the terminal shows. The link points to the address the owner already uses. */
export function launchLine(origin: string, key: string, locale: Locale): string {
  return t(locale).launch(`${origin}/?${KEY_PARAM}=${key}`);
}
