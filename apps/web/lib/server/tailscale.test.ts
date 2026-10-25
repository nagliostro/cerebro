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

  it('a network where Serve is not allowed yet: the link to allow it, without waiting long', async () => {
    process.env.FAKE_TAILSCALE_NEEDS_SERVE = '1';
    const started = Date.now();
    expect(await serve(3000)).toEqual({
      ok: false,
      detail: 'Serve is not enabled on your tailnet.',
      enable: 'https://login.tailscale.com/f/serve?node=TEST',
    });
    expect(Date.now() - started).toBeLessThan(12_000);
    delete process.env.FAKE_TAILSCALE_NEEDS_SERVE;
  }, 15_000);

  it('installed but stuck starting is said as it is, not as signed out', async () => {
    process.env.FAKE_TAILSCALE_STUCK = '1';
    expect(await channelStatus(3000)).toEqual({
      state: 'not-running',
      detail: 'Tailscale is starting. Please wait.',
    });
    delete process.env.FAKE_TAILSCALE_STUCK;
  });

  it('not installed when there is no CLI', async () => {
    process.env.CEREBRO_TAILSCALE_BIN = path.join(dir, 'no-tailscale.exe');
    expect(await channelStatus(3000)).toEqual({ state: 'not-installed' });
  });
});
