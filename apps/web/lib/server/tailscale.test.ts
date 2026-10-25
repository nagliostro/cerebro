import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { channelStatus, serve, unserve } from './tailscale';

// The channel against the fake CLI of the screen tests (e2e/fake-tailscale.mjs).

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'cerebro-tailscale-'));
  process.env.CEREBRO_DATA_DIR = dir;
  process.env.CEREBRO_TAILSCALE_BIN = fileURLToPath(
    new URL('../../e2e/fake-tailscale.mjs', import.meta.url),
  );
});
afterAll(async () => {
  delete process.env.CEREBRO_TAILSCALE_BIN;
  delete process.env.CEREBRO_DATA_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe('the remote channel', () => {
  it('ready, then serving this port only, then off', async () => {
    const host = 'cerebro-e2e.tail-example.ts.net';
    expect(await channelStatus(3000)).toEqual({ state: 'ready', host });
    expect(await serve(3000)).toEqual({ ok: true });
    expect(await channelStatus(3000)).toEqual({ state: 'serving', host });
    expect(await channelStatus(3001)).toEqual({ state: 'ready', host });
    expect(await unserve()).toBe(true);
    expect(await channelStatus(3000)).toEqual({ state: 'ready', host });
  });

  it('not installed when there is no CLI', async () => {
    process.env.CEREBRO_TAILSCALE_BIN = path.join(dir, 'no-tailscale.exe');
    expect(await channelStatus(3000)).toEqual({ state: 'not-installed' });
  });
});
