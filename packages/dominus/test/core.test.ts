import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { request } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { existsSync, readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Plans, type PlanRow } from '../src/builder/plan.ts';

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
      CEREBRO_SIM_STEP_MS: '150',
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

  it('neurons talk only through the contract, as the owner allows, and it counts as a conversation', async () => {
    await call('POST', '/graph/neurons', { name: 'Agenda' });
    await call('POST', '/neurons/financas/data', {
      collection: 'gastos',
      op: 'create',
      input: { data: { desc: 'Mercado', valor: 312.4 } },
    });
    const contract = await call<{ collections: { name: string }[] }>(
      'GET',
      '/neurons/financas/contract',
    );
    expect(contract.collections.map((c) => c.name)).toEqual(['gastos']);

    const ask = { target: 'financas', operation: 'gastos.list' };
    await expect(call('POST', '/neurons/agenda/call', ask)).rejects.toThrow(/403/);
    await call('POST', '/neurons/financas/permissions', {
      caller: 'agenda',
      collection: 'gastos',
      grants: ['view'],
    });
    expect(await call('POST', '/neurons/agenda/call', ask)).toMatchObject([
      { data: { desc: 'Mercado' } },
    ]);
    await expect(
      call('POST', '/neurons/agenda/call', { target: 'financas', operation: 'gastos.delete' }),
    ).rejects.toThrow(/403/);
    const graph = await call<{ synapses: { a: string; b: string }[] }>('GET', '/graph');
    expect(graph.synapses).toContainEqual(expect.objectContaining({ a: 'agenda', b: 'financas' }));
    await call('POST', '/neurons/financas/permissions', { revokeAll: true });
    await expect(call('POST', '/neurons/agenda/call', ask)).rejects.toThrow(/403/);
    await expect(call('GET', '/neurons/ghost/contract')).rejects.toThrow(/404/);
  });

  // Building neurons, with the simulated AI: plan, questions, answers, build, adjust, failures.
  const plan = (id: string) => call<PlanRow>('GET', `/plans/${id}`);
  const until = (id: string, ...statuses: string[]) =>
    waitFor(async () => {
      const p = await plan(id);
      return statuses.includes(p.status) && p;
    });
  const ask = async (request: string, target?: string) =>
    (await call<{ id: string }>('POST', '/plans', { request, locale: 'en', target })).id;
  const neurons = async () =>
    (await call<{ neurons: { id: string; name: string }[] }>('GET', '/graph')).neurons;

  it('a short request gets questions; answered, it becomes a plan with steps and an estimate', async () => {
    const id = await ask('plants');
    const asked = await until(id, 'questions');
    expect(asked.plan!.questions.length).toBeGreaterThan(0);
    expect(asked.steps.map((s) => s.kind)).toEqual(['read', 'memory', 'think']);
    await call('POST', `/plans/${id}/answer`, { text: 'water them every week' });
    const ready = await until(id, 'ready');
    expect(ready.plan).toMatchObject({ ready: true, name: 'Plants' });
    expect(ready.exchanges).toEqual([{ kind: 'answer', text: 'water them every week' }]);
    expect(ready.estimate).toMatchObject({ provider: 'simulated', basis: 0 });
    expect(ready.color).toMatch(/^oklch\(0\.78 0\.11 \d+\)$/);
    expect(await call('GET', '/plans/current')).toMatchObject({ id });
    await call('POST', `/plans/${id}/reject`);
    expect((await plan(id)).status).toBe('rejected');
    expect(await call('GET', '/plans/current')).toBeNull();
    await expect(call('POST', '/plans', { request: '' })).rejects.toThrow(/400/);
  });

  it('an accepted plan builds in a draft; only a good build joins the graph, with its links', async () => {
    await call('POST', '/graph/neurons', { name: 'Notes' });
    await call('POST', '/neurons/notes/data', {
      collection: 'pages',
      op: 'create',
      input: { data: { title: 'a' } },
    });
    const id = await ask('Garden: what to plant each month [link:notes.pages]');
    const ready = await until(id, 'ready');
    expect(ready.plan!.links).toEqual([
      { neuron: 'notes', collection: 'pages', why: 'to read it' },
    ]);
    await call('POST', `/plans/${id}/accept`);
    const built = await until(id, 'built', 'failed');
    expect(built.status).toBe('built');
    expect(built.neuron).toBe('garden');
    expect(built.steps.filter((s) => s.kind === 'file').map((s) => 'path' in s && s.path)).toEqual([
      'index.html',
      'style.css',
      'app.js',
    ]);
    expect(built.steps.at(-1)).toMatchObject({ kind: 'check', files: 3 });
    expect(existsSync(path.join(dir, 'neurons', 'garden', 'app', 'index.html'))).toBe(true);
    expect(existsSync(path.join(dir, 'builds', id))).toBe(false);
    const g = await call<{ neurons: { id: string; color: string }[]; links: object[] }>(
      'GET',
      '/graph',
    );
    expect(g.neurons.find((n) => n.id === 'garden')!.color).toBe(ready.color);
    expect(g.links).toContainEqual({ reader: 'garden', target: 'notes' });
    // The owner accepted the link with the plan: Garden may read the pages, and only read them.
    await call('POST', '/neurons/garden/call', { target: 'notes', operation: 'pages.list' });
    await expect(
      call('POST', '/neurons/garden/call', { target: 'notes', operation: 'pages.create' }),
    ).rejects.toThrow(/403/);
  });

  it('adjusting a neuron changes its application and keeps the previous one', async () => {
    const id = await ask('add a counter', 'garden');
    const ready = await until(id, 'ready');
    expect(ready.plan!.name).toBe('Garden');
    await call('POST', `/plans/${id}/accept`);
    expect((await until(id, 'built', 'failed')).neuron).toBe('garden');
    expect(existsSync(path.join(dir, 'neurons', 'garden', 'app.previous', 'index.html'))).toBe(
      true,
    );
    const index = () =>
      readFileSync(path.join(dir, 'neurons', 'garden', 'app', 'index.html'), 'utf8');
    expect(index()).toContain('add a counter');
    // Taken back: the previous application returns, and only once.
    expect((await call<PlanRow>('POST', `/plans/${id}/undo`)).status).toBe('undone');
    expect(index()).toContain('Garden: what to plant each month');
    await expect(call('POST', `/plans/${id}/undo`)).rejects.toThrow(/400/);
    expect((await neurons()).filter((n) => n.name === 'Garden')).toHaveLength(1);
    expect(await call('GET', '/plans/current?target=garden')).toBeNull();
  });

  it('a plan for a neuron already there without an application builds that one, not a twin', async () => {
    await call('POST', '/graph/neurons', { name: 'Bikes' });
    const id = await ask('Bikes: rides of the week');
    const ready = await until(id, 'ready');
    expect(ready.target).toBe('bikes');
    await call('POST', `/plans/${id}/accept`);
    expect((await until(id, 'built', 'failed')).neuron).toBe('bikes');
    expect((await neurons()).filter((n) => n.name === 'Bikes')).toHaveLength(1);
    expect(existsSync(path.join(dir, 'neurons', 'bikes', 'app', 'index.html'))).toBe(true);
  });

  it('a failed or canceled build leaves nothing behind', async () => {
    const before = (await neurons()).length;
    const bad = await ask('Broken: a thing that fails [build-fail]');
    await until(bad, 'ready');
    await call('POST', `/plans/${bad}/accept`);
    const failed = await until(bad, 'failed', 'built');
    expect(failed.error).toMatch(/^bad-build: no index\.html/);
    const stop = await ask('Stopped: a thing to cancel');
    await until(stop, 'ready');
    await call('POST', `/plans/${stop}/accept`);
    await waitFor(async () => (await plan(stop)).steps.some((s) => s.kind === 'file'));
    await call('POST', `/plans/${stop}/cancel`);
    expect((await until(stop, 'canceled', 'built')).status).toBe('canceled');
    expect((await neurons()).length).toBe(before);
    expect(existsSync(path.join(dir, 'builds', bad))).toBe(false);
    expect(existsSync(path.join(dir, 'builds', stop))).toBe(false);
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

  it('a plan left running without a job fails when the core starts, instead of hanging', async () => {
    core.kill('SIGKILL');
    await new Promise((r) => core.on('exit', r));
    const stored = new Plans(paths.db);
    const id = stored.create('stuck', 'en', null);
    stored.close();
    core = startCore();
    await waitFor(() => isCoreUp(paths));
    expect(await plan(id)).toMatchObject({ status: 'failed', error: 'job lost' });
  });
});
