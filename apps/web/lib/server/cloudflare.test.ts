import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { channelStatus, turnOff, turnOn } from './cloudflare';
import { remoteHost } from './remote';

// The channel against the fake CLI of the screen tests (e2e/fake-cloudflared.mjs).

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'cerebro-cloudflare-'));
  process.env.CEREBRO_DATA_DIR = dir;
  process.env.CEREBRO_TUNNEL_METRICS = '127.0.0.1:20298';
  process.env.CEREBRO_CLOUDFLARED_BIN = fileURLToPath(
    new URL('../../e2e/fake-cloudflared.mjs', import.meta.url),
  );
});
afterAll(async () => {
  await turnOff();
  delete process.env.CEREBRO_CLOUDFLARED_BIN;
  delete process.env.CEREBRO_TUNNEL_METRICS;
  delete process.env.CEREBRO_DATA_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe('the remote channel', () => {
  it('ready, then serving at the address, only to this port; off lets the address out', async () => {
    expect(await channelStatus()).toEqual({ state: 'ready', host: null });
    expect(await turnOn('https://Cerebro.Example.com/', 3000)).toEqual({ ok: true });
    expect(await channelStatus()).toEqual({ state: 'serving', host: 'cerebro.example.com' });
    expect(await remoteHost()).toBe('cerebro.example.com');
    const config = await readFile(path.join(dir, 'tunnel.yml'), 'utf8');
    expect(config).toContain('hostname: cerebro.example.com');
    expect(config).toContain('service: http://127.0.0.1:3000');
    expect(config).toContain('service: http_status:404');
    await turnOff();
    expect(await remoteHost()).toBeNull();
    // The address is offered again.
    expect(await channelStatus()).toEqual({ state: 'ready', host: 'cerebro.example.com' });
  }, 20_000);

  it('started on another port, the tunnel goes to the port the server answers on now', async () => {
    process.env.PORT = '3300';
    try {
      expect(await turnOn('cerebro.example.com', 3000)).toEqual({ ok: true });
      const config = await readFile(path.join(dir, 'tunnel.yml'), 'utf8');
      expect(config).toContain('service: http://127.0.0.1:3300');
    } finally {
      delete process.env.PORT;
      await turnOff();
    }
  }, 20_000);

  it('a name that is not a domain, or not one of the account, is refused', async () => {
    expect(await turnOn('meu cerebro', 3000)).toEqual({ ok: false, error: 'bad-host' });
    expect(await turnOn('cerebro.invalid', 3000)).toEqual({
      ok: false,
      error: 'failed',
      detail: 'Failed to add route: zone not found',
    });
    expect(await remoteHost()).toBeNull();
  });

  it('signed out until the sign-in', async () => {
    process.env.FAKE_CLOUDFLARED_SIGNED_OUT = '1';
    expect(await channelStatus()).toEqual({ state: 'signed-out' });
    delete process.env.FAKE_CLOUDFLARED_SIGNED_OUT;
  });

  it('not installed when there is no CLI', async () => {
    process.env.CEREBRO_CLOUDFLARED_BIN = path.join(dir, 'no-cloudflared.exe');
    expect(await channelStatus()).toEqual({ state: 'not-installed' });
  });
});
