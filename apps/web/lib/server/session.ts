import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { privateMtime, readPrivateJson, removePrivate, writePrivateJson } from './private-files';

// Who is the owner. There is no password: whoever started the Cerebro is the owner, so the
// terminal shows a link with a one-time key (the way Jupyter and VS Code Server do it).
// Opening it gives that browser a session cookie; the server keeps only hashes, so reading
// its files never reveals a usable key or session.
//
// Everything lives in files of the data folder, not in memory: the proxy and the pages run
// as separate bundles that share no state, and sessions must survive a restart.

export const SESSION_COOKIE = 'cerebro_session';
export const KEY_PARAM = 'key';

/** A key that was never used expires, so a link left in the terminal's history is worthless. */
const KEY_LIFETIME_MS = 15 * 60_000;

const SESSIONS_FILE = 'sessions.json';
const KEY_FILE = 'launch-key.json';

type SessionsFile = { hashes: string[] };
// Only a duration is measured here (issued vs. used on the same computer), so the computer's
// clock is enough even when it is off.
type KeyFile = { hash: string; expiresAt: number };

const newSecret = () => randomBytes(32).toString('base64url');
const hash = (secret: string) => createHash('sha256').update(secret).digest('hex');

let cache: { mtime: number; hashes: Set<string> } | null = null;

async function sessionHashes(): Promise<Set<string>> {
  const mtime = await privateMtime(SESSIONS_FILE);
  if (cache?.mtime !== mtime) {
    const file = await readPrivateJson<SessionsFile>(SESSIONS_FILE);
    cache = { mtime, hashes: new Set(file?.hashes ?? []) };
  }
  return cache.hashes;
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  return !!token && (await sessionHashes()).has(hash(token));
}

/** A new session for one browser; returns the token that goes into its cookie. */
export async function createSession(): Promise<string> {
  const token = newSecret();
  const hashes = await sessionHashes();
  await writePrivateJson(SESSIONS_FILE, { hashes: [...hashes, hash(token)] });
  return token;
}

/** A fresh one-time key, replacing any earlier one. The caller shows it in the terminal. */
export async function issueLaunchKey(now = Date.now()): Promise<string> {
  const key = newSecret();
  await writePrivateJson(KEY_FILE, { hash: hash(key), expiresAt: now + KEY_LIFETIME_MS });
  return key;
}

/** Whether there is a key that can still be used, so a new one is issued only when needed. */
export async function hasLiveLaunchKey(now = Date.now()): Promise<boolean> {
  const file = await readPrivateJson<KeyFile>(KEY_FILE);
  return !!file && file.expiresAt > now;
}

/** Uses the key up: true at most once per key, and never after it expires. */
export async function redeemLaunchKey(key: string, now = Date.now()): Promise<boolean> {
  const file = await readPrivateJson<KeyFile>(KEY_FILE);
  if (!file || file.expiresAt <= now) return false;
  const matches = timingSafeEqual(Buffer.from(hash(key)), Buffer.from(file.hash));
  if (matches) await removePrivate(KEY_FILE);
  return matches;
}

/** The line the terminal shows. The link points to the host the owner already uses. */
export function launchLine(host: string, key: string, portuguese: boolean): string {
  const link = `http://${host}/?${KEY_PARAM}=${key}`;
  return portuguese
    ? `Cerebro: para entrar, abra ${link} (vale uma vez, por 15 minutos)`
    : `Cerebro: to enter, open ${link} (works once, for 15 minutes)`;
}
