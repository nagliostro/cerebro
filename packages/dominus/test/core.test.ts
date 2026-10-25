import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { request } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { coreRequest, isCoreUp } from '../src/client.ts';
import { corePaths, type CorePaths } from '../src/paths.ts';
import type { Job } from '../src/queue.ts';

// The real core, in its own process, with the test jobs and the simulated AI: workers that die,
// hang or run too long, a core that dies in the middle, and the memory it uses when idle.

const CORE = fileURLToPath(new URL('../src/core.ts', import.meta.url));
let dir: string;
let paths: CorePaths;
let core: ChildProcess;

function startCore() {
  const proc = spawn(process.execPath, [CORE], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      ...process.env,
      CEREBRO_DATA_DIR: dir,
      CEREBRO_TEST_JOBS: '1',
      CEREBRO_SIMULATED: '1',
      CEREBRO_CLOCK: 'off',
      CEREBRO_CLAUDE_BIN: path.join(dir, 'no-such-claude'),
    },
  });
  return proc;
}

async function waitFor<T>(fn: () => Promise<T | undefined | false>, ms = 15_000): Promise<T> {
  const until = performance.now() + ms;
  for (;;) {
    const v = await fn().catch(() => undefined);
    if (v) return v;
    if (performance.now() > until) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 100));
  }
}

const call = <T>(method: 'GET' | 'POST', p: string, body?: unknown) =>
  coreRequest<T>(method, p, body, paths);
const enqueue = async (job: object) => (await call<{ id: string }>('POST', '/jobs', job)).id;
const job = (id: string) => call<Job>('GET', `/jobs/${id}`);
const finished = (id: string) =>
  waitFor(async () => {
    const j = await job(id);
    return ['done', 'failed', 'canceled'].includes(j.status) && j;
  });

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'cerebro-core-'));
  paths = corePaths(dir);
  core = startCore();
  await waitFor(() => isCoreUp(paths));
});

afterAll(async () => {
  core.kill();
  await new Promise((r) => setTimeout(r, 300));
  await rm(dir, { recursive: true, force: true }).catch(() => {});
});

describe('dominus core', () => {
  it('answers only with the token', async () => {
    const status = await new Promise<number>((resolve, reject) =>
      request({ socketPath: paths.socket, path: '/stats' }, (res) => resolve(res.statusCode!))
        .on('error', reject)
        .end(),
    );
    expect(status).toBe(401);
  });

  it('refuses work it cannot run', async () => {
    for (const bad of [
      { type: 'nope' },
      { type: 'ask', payload: { provider: 'simulated', role: 'cheap', mode: 'text' } },
      { type: 'ask', payload: { provider: 'nobody', role: 'cheap', mode: 'text', prompt: 'hi' } },
      { type: 'ask', payload: { provider: 'simulated', role: 'huge', mode: 'text', prompt: 'x' } },
      { type: 'steps', payload: {}, maxMs: 10 },
    ])
      await expect(call('POST', '/jobs', bad)).rejects.toThrow(/400/);
  });

  it('asks an AI by role and keeps the quota it reports', async () => {
    const id = await enqueue({
      type: 'ask',
      payload: { provider: 'simulated', role: 'cheap', mode: 'text', prompt: 'hello' },
    });
    const done = await finished(id);
    expect(done.status).toBe('done');
    expect((done.result as { text: string }).text).toBe('echo(cheap, text): hello');
    const quota = await call<{ provider: string; windows: { name: string }[] }[]>('GET', '/quota');
    expect(quota.find((q) => q.provider === 'simulated')?.windows[0]?.name).toBe('month');
  });

  it('tells which AIs are ready, in codes the screen translates', async () => {
    const list = await call<{ id: string; health: { ok: boolean; problem?: string } }[]>(
      'GET',
      '/providers',
    );
    expect(list.find((p) => p.id === 'claude-code')?.health).toMatchObject({
      ok: false,
      problem: 'not-installed',
    });
    expect(list.find((p) => p.id === 'simulated')?.health.ok).toBe(true);
  });

  it('a worker killed in the middle resumes from its checkpoint', async () => {
    const id = await enqueue({ type: 'steps', payload: { steps: 8, stepMs: 150 } });
    const pid = await waitFor(async () => {
      const j = await job(id);
      return (j.checkpoint as { step: number } | null)?.step === 3 && j.worker_pid;
    });
    process.kill(pid!, 'SIGKILL');
    const done = await finished(id);
    expect(done.status).toBe('done');
    expect(done.attempts).toBe(2);
    expect((done.result as { resumedFrom: number }).resumedFrom).toBeGreaterThanOrEqual(3);
  });

  it('a hung worker is stopped by the missing heartbeat', async () => {
    const done = await finished(await enqueue({ type: 'hang' }));
    expect(done).toMatchObject({ status: 'failed', error: 'no heartbeat' });
  });

  it('respects the time limit and the owner canceling', async () => {
    const slow = { type: 'steps', payload: { steps: 100, stepMs: 100 } };
    const timedOut = await finished(await enqueue({ ...slow, maxMs: 1000 }));
    expect(timedOut).toMatchObject({ status: 'failed', error: 'timeout after 1000 ms' });

    const id = await enqueue(slow);
    await waitFor(async () => (await job(id)).status === 'running');
    expect(await call('POST', `/jobs/${id}/cancel`)).toEqual({ ok: true });
    expect((await finished(id)).status).toBe('canceled');
  });

  it('routes "auto" to a ready connection and records why', async () => {
    const choice = await call('POST', '/route', { mode: 'text', kind: 'chat' });
    expect(choice).toMatchObject({ ok: true, provider: 'simulated', role: 'balanced' });
    const done = await finished(
      await enqueue({
        type: 'ask',
        payload: { provider: 'auto', role: 'cheap', mode: 'text', kind: 'chat', prompt: 'oi' },
      }),
    );
    expect(done.payload).toMatchObject({
      provider: 'simulated',
      role: 'balanced',
      route: ['local', 'default-role'],
    });
    expect(done.status).toBe('done');
  });

  it('waits for the quota to reset instead of failing, then finishes', async () => {
    const until = Date.now() + 1500;
    const id = await enqueue({
      type: 'ask',
      payload: {
        provider: 'simulated',
        role: 'cheap',
        mode: 'text',
        prompt: `[quota-out:${until}] hello`,
      },
    });
    const waiting = await waitFor(async () => {
      const j = await job(id);
      return j.status === 'queued' && j.not_before ? j : undefined;
    });
    expect(waiting.not_before).toBe(until);
    const done = await finished(id);
    expect(done.status).toBe('done');
    expect(Date.now()).toBeGreaterThanOrEqual(until);
    expect(done.attempts).toBe(1); // waiting is not a failed attempt
  });

  it('the Guard answers from history, without calling an AI', async () => {
    const verdict = await call('POST', '/guard', { provider: 'simulated', kind: 'build' });
    expect(verdict).toMatchObject({ costUsd: null, verdict: 'unknown' });
  });

  it('keeps the graph: neurons, conversations and links, with bad input refused', async () => {
    expect(await call('GET', '/graph')).toEqual({ neurons: [], synapses: [], links: [] });
    const { id } = await call<{ id: string }>('POST', '/graph/neurons', { name: 'Finanças' });
    await call('POST', '/graph/neurons', { name: 'Pesquisa', role: 'craft' });
    await call('POST', '/graph/conversations', { a: id, b: 'dominus' });
    await call('POST', '/graph/links', { reader: id, target: 'pesquisa' });
    const view = await call<{ neurons: { id: string; weight: number; role: string }[] }>(
      'GET',
      '/graph',
    );
    expect(view.neurons).toMatchObject([
      { id: 'financas', weight: 1, role: 'life' },
      { id: 'pesquisa', weight: 0, role: 'craft' },
    ]);
    await expect(call('POST', '/graph/neurons', { name: '' })).rejects.toThrow(/400/);
    await expect(call('POST', '/graph/conversations', { a: id, b: 'ghost' })).rejects.toThrow(
      /400/,
    );
  });

  it('uses less than 150 MB when idle', async () => {
    await waitFor(async () => (await call<{ running: number }>('GET', '/stats')).running === 0);
    const { rssMb } = await call<{ rssMb: number }>('GET', '/stats');
    expect(rssMb).toBeLessThan(150);
  });

  it('a second core does not start', async () => {
    const second = startCore();
    const code = await new Promise((r) => second.on('exit', r));
    expect(code).toBe(1);
    expect(await isCoreUp(paths)).toBe(true);
  });

  it('a core killed in the middle finishes the job after it restarts', async () => {
    const id = await enqueue({ type: 'steps', payload: { steps: 6, stepMs: 200 } });
    await waitFor(async () => (await job(id)).checkpoint);
    core.kill('SIGKILL');
    await new Promise((r) => core.on('exit', r));
    core = startCore();
    await waitFor(() => isCoreUp(paths));
    const done = await finished(id);
    expect(done.status).toBe('done');
    expect((done.result as { resumedFrom: number }).resumedFrom).toBeGreaterThan(0);
  });
});
