import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { dataDir } from '@cerebro/dominus/data-dir';

import { readPrivateJson, writePrivateJson } from './private-files';

// A neuron's application is served at /apps/<id>/<token>/..., never under a session cookie: it
// runs sandboxed with an opaque origin, so its requests carry no cookies anyway. The token, signed
// by a secret only the server knows, says which neuron and until when; the page makes a fresh one
// each time it opens. Relative links inside the application keep the token.

const LIFETIME_MS = 12 * 3600_000;
const SECRET_FILE = 'app-secret.json';

let secret: Buffer | null = null;
async function key(): Promise<Buffer> {
  if (secret) return secret;
  const stored = await readPrivateJson<{ secret: string }>(SECRET_FILE);
  if (stored?.secret) secret = Buffer.from(stored.secret, 'base64url');
  else {
    secret = randomBytes(32);
    await writePrivateJson(SECRET_FILE, { secret: secret.toString('base64url') });
  }
  return secret;
}

const mac = async (id: string, until: number) =>
  createHmac('sha256', await key())
    .update(`${id}.${until}`)
    .digest('base64url');

// Only a duration is measured (made vs. used on this computer), so its clock is enough.

export async function appToken(id: string, now = Date.now()): Promise<string> {
  const until = now + LIFETIME_MS;
  return `${until.toString(36)}.${await mac(id, until)}`;
}

export async function validAppToken(id: string, token: string, now = Date.now()) {
  const [untilText, sig] = token.split('.');
  const until = parseInt(untilText ?? '', 36);
  if (!sig || !Number.isFinite(until) || until <= now) return false;
  const expected = Buffer.from(await mac(id, until));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Where a neuron's application lives: the data folder, never the program folder. */
export const appDir = (id: string) => path.join(dataDir(), 'neurons', id, 'app');

/**
 * The application's version: the time of its newest file, or null when it has none. The screen
 * reloads the application only when this changes, never just because the link was signed again.
 */
export async function appVersion(id: string): Promise<number | null> {
  try {
    if (!(await stat(path.join(appDir(id), 'index.html'))).isFile()) return null;
    const files = await readdir(appDir(id), { recursive: true, withFileTypes: true });
    const times = await Promise.all(
      files
        .filter((f) => f.isFile())
        .map((f) => stat(path.join(f.parentPath, f.name)).then((s) => s.mtimeMs)),
    );
    return Math.floor(Math.max(...times));
  } catch {
    return null;
  }
}
