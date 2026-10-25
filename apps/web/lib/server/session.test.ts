import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createSession,
  hasLiveLaunchKey,
  isValidSession,
  issueLaunchKey,
  redeemLaunchKey,
} from './session';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'cerebro-session-'));
  process.env.CEREBRO_DATA_DIR = dir;
});
afterEach(async () => {
  delete process.env.CEREBRO_DATA_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe('launch key', () => {
  it('works once', async () => {
    const key = await issueLaunchKey();
    expect(await redeemLaunchKey('wrong')).toBe(false);
    expect(await redeemLaunchKey(key)).toBe(true);
    expect(await redeemLaunchKey(key)).toBe(false);
    expect(await hasLiveLaunchKey()).toBe(false);
  });

  it('expires after 15 minutes and is replaced by a new one', async () => {
    const t = 1_000_000;
    const old = await issueLaunchKey(t);
    expect(await hasLiveLaunchKey(t + 14 * 60_000)).toBe(true);
    expect(await redeemLaunchKey(old, t + 15 * 60_000)).toBe(false);
    const fresh = await issueLaunchKey(t);
    expect(await redeemLaunchKey(old, t)).toBe(false);
    expect(await redeemLaunchKey(fresh, t)).toBe(true);
  });
});

describe('sessions', () => {
  it('knows its own tokens and nothing else', async () => {
    const a = await createSession();
    const b = await createSession();
    expect(await isValidSession(a)).toBe(true);
    expect(await isValidSession(b)).toBe(true);
    expect(await isValidSession('forged')).toBe(false);
    expect(await isValidSession(undefined)).toBe(false);
  });

  it('keeps only hashes on disk, in a file only the owner reads', async () => {
    const token = await createSession();
    const key = await issueLaunchKey();
    const files = ['sessions.json', 'launch-key.json'].map((f) => path.join(dir, f));
    const disk = (await Promise.all(files.map((f) => readFile(f, 'utf8')))).join();
    expect(disk).not.toContain(token);
    expect(disk).not.toContain(key);
    if (process.platform !== 'win32')
      for (const f of files) expect((await stat(f)).mode & 0o777).toBe(0o600);
  });
});
