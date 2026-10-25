import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createSession,
  deviceFrom,
  hasLiveLaunchKey,
  isValidSession,
  issueLaunchKey,
  issuePairKey,
  listSessions,
  redeemLaunchKey,
  redeemPairKey,
  revokeSession,
  sessionId,
  touchSession,
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

describe('devices', () => {
  const iphone =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const edge =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0';

  it('tells what each browser is, as sites list where you are signed in', () => {
    expect(deviceFrom(iphone)).toEqual({ browser: 'Safari', system: 'iOS', kind: 'phone' });
    expect(deviceFrom(edge)).toEqual({ browser: 'Edge', system: 'Windows', kind: 'computer' });
    expect(deviceFrom(null)).toEqual({ browser: '', system: '', kind: 'computer' });
  });

  it('lists each device, marks when it was seen, and revokes one alone', async () => {
    const phone = await createSession(deviceFrom(iphone), 1000);
    const pc = await createSession(deviceFrom(edge), 2000);
    await touchSession(phone, 1000 + 5 * 60_000); // too soon to write again
    await touchSession(phone, 1000 + 11 * 60_000);
    const list = await listSessions();
    expect(list.map((d) => d.device.system)).toEqual(['iOS', 'Windows']);
    expect(list[0]!.lastSeen).toBe(1000 + 11 * 60_000);
    expect(await revokeSession(sessionId(phone))).toBe(true);
    expect(await revokeSession(sessionId(phone))).toBe(false);
    expect(await isValidSession(phone)).toBe(false);
    expect(await isValidSession(pc)).toBe(true);
    // The list never carries the hash, only a short id.
    expect(JSON.stringify(await listSessions())).not.toContain(
      (await readFile(path.join(dir, 'sessions.json'), 'utf8')).match(/"hash":"(\w+)"/)![1]!,
    );
  });

  it('sessions from before devices were kept stay valid', async () => {
    const { createHash } = await import('node:crypto');
    const old = 'old-token';
    await writeFile(
      path.join(dir, 'sessions.json'),
      JSON.stringify({ hashes: [createHash('sha256').update(old).digest('hex')] }),
    );
    expect(await isValidSession(old)).toBe(true);
    expect((await listSessions())[0]!.device.browser).toBe('');
  });

  it('a pairing code works once, for five minutes', async () => {
    const t = 1_000_000;
    const { key, expiresAt } = await issuePairKey(t);
    expect(expiresAt).toBe(t + 5 * 60_000);
    expect(await redeemPairKey(key, t + 5 * 60_000)).toBe(false);
    const fresh = await issuePairKey(t);
    expect(await redeemPairKey(fresh.key, t)).toBe(true);
    expect(await redeemPairKey(fresh.key, t)).toBe(false);
    // A pairing code is not a terminal key, nor the other way round.
    const launch = await issueLaunchKey(t);
    expect(await redeemPairKey(launch, t)).toBe(false);
    expect(await redeemLaunchKey(launch, t)).toBe(true);
  });
});
