import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { request } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { existsSync, mkdirSync, readFileSync } from 'node:fs';

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

  it('a copy is researched first: the steps, the answer key, then a plan of that feature', async () => {
    const id = await ask('copy the yield simulator of https://invest.example.com/sim');
    const researching = await until(id, 'researching', 'thinking', 'ready');
    expect(researching.steps.map((s) => s.kind).slice(0, 3)).toEqual(['read', 'memory', 'guide']);
    const ready = await until(id, 'ready', 'failed');
    expect(ready.status).toBe('ready');
    expect(ready.plan!.name).toBe('Yield simulator');
    expect(ready.research).toMatchObject({
      feature: 'Yield simulator',
      cases: [
        { input: { value: '1000' }, output: { net: '1106.50' }, source: 'observed' },
        { input: { value: '20' }, output: { net: '22.13' }, source: 'observed' },
      ],
      rules: [{ text: 'The rate is 10.65% a year', source: 'https://help.example.com/rate' }],
      improvements: [{ text: 'Compare with savings', source: 'https://forum.example.com/1' }],
      gaps: ['The rate changes every day'],
    });
    const kinds = ready.steps.map((s) => s.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['browse', 'search', 'cases', 'rules', 'findings', 'think']),
    );
    expect(ready.steps.find((s) => s.kind === 'cases')).toMatchObject({ count: 2, done: true });
    expect(
      ready.steps.filter((s) => s.kind === 'browse').map((s) => 'host' in s && s.host),
    ).toEqual(['invest.example.com', 'help.example.com']);
    // The Navegador was born with the first research, as craft, and keeps what it did.
    const nav = (
      await call<{ neurons: { id: string; role: string }[] }>('GET', '/graph')
    ).neurons.find((n) => n.id === 'navegador');
    expect(nav).toMatchObject({ role: 'craft' });
    expect(existsSync(path.join(dir, 'neurons', 'navegador', 'app', 'index.html'))).toBe(true);
    const kept = await call<{ data: { feature: string; cases: number } }[]>(
      'POST',
      '/neurons/navegador/data',
      { collection: 'researches', op: 'list' },
    );
    expect(kept[0]!.data).toMatchObject({ feature: 'Yield simulator', cases: 2 });
    await call('POST', `/plans/${id}/reject`);
  });

  it('a copy is checked against its answer key; a failing case goes back to the Builder', async () => {
    const id = await ask('copy the simulator of https://invest.example.com/sim [check-fail-once]');
    await until(id, 'ready', 'failed');
    await call('POST', `/plans/${id}/accept`, { improvements: [0, 7] });
    // Two rounds of building and of checking (a browser each): more than the usual wait.
    const built = await waitFor(async () => {
      const p = await plan(id);
      return ['built', 'failed'].includes(p.status) && p;
    }, 45_000);
    expect(built.status).toBe('built');
    const verify = built.steps.filter((s) => s.kind === 'verify');
    // First round: no case matched (the rate was wrong); second: both.
    expect(verify).toEqual([
      { kind: 'verify', passed: 0, total: 2, done: true },
      { kind: 'verify', passed: 2, total: 2, done: true },
    ]);
    // The answer key goes with the neuron.
    const kept = JSON.parse(
      readFileSync(path.join(dir, 'neurons', built.neuron!, 'research.json'), 'utf8'),
    );
    expect(kept.cases).toHaveLength(2);
    expect(kept.gaps).toEqual(['The rate changes every day']);
  }, 60_000);

  it('a free library the plan names is checked on the registry and carried inside', async (ctx) => {
    const online = await fetch('https://registry.npmjs.org/-/ping', {
      signal: AbortSignal.timeout(5000),
    }).then(
      (r) => r.ok,
      () => false,
    );
    if (!online) ctx.skip();
    const id = await ask('Zips: make zip files [lib:jszip] [lib:surely-not-a-package-cerebro-xyz]');
    const ready = await until(id, 'ready', 'failed');
    // The one that does not exist is dropped, never carried unchecked.
    expect(ready.plan!.libraries.map((l) => l.name)).toEqual(['jszip']);
    await call('POST', `/plans/${id}/accept`);
    const built = await until(id, 'built', 'failed');
    const vendor = path.join(dir, 'neurons', built.neuron!, 'app', 'vendor', 'jszip');
    expect(existsSync(path.join(vendor, 'LICENSE.txt'))).toBe(true);
  }, 60_000);

  it('a vague copy asks which feature, with the options found, and goes on with the answer', async () => {
    const id = await ask('copy this app https://invest.example.com [ask-which]');
    const asked = await until(id, 'questions', 'failed');
    expect(asked.plan).toMatchObject({
      ready: false,
      questions: ['Which feature should I copy?'],
      options: ['Yield simulator', 'Comparator'],
    });
    await call('POST', `/plans/${id}/answer`, { text: 'Yield simulator' });
    const ready = await until(id, 'ready', 'failed');
    expect(ready.research?.question).toBeNull();
    expect(ready.research?.cases).toHaveLength(2);
    await call('POST', `/plans/${id}/reject`);
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

  // Settings: neurons renamed, moved between roles and removed for good; options; connections.
  it('a neuron is renamed, changes role, and is removed with its data, links and folder', async () => {
    await call('POST', '/graph/neurons', { name: 'Old Thing' });
    await call('POST', '/neurons/old-thing/data', {
      collection: 'notes',
      op: 'create',
      input: { data: { t: 'x' } },
    });
    await call('POST', '/graph/links', { reader: 'old-thing', target: 'notes' });
    await call('POST', '/neurons/notes/permissions', {
      caller: 'old-thing',
      collection: 'pages',
      grants: ['view'],
    });
    const edited = await call<{ name: string; role: string }>('POST', '/neurons/old-thing/edit', {
      name: 'Renamed',
      role: 'craft',
    });
    expect(edited).toMatchObject({ name: 'Renamed', role: 'craft' });
    await expect(call('POST', '/neurons/old-thing/edit', { name: '' })).rejects.toThrow(/400/);
    // An open plan to adjust it closes with it.
    const open = await ask('a change to it', 'old-thing');
    await until(open, 'ready', 'questions');
    mkdirSync(path.join(dir, 'neurons', 'old-thing', 'app'), { recursive: true });
    await call('POST', '/neurons/old-thing/remove');
    expect((await neurons()).some((n) => n.id === 'old-thing')).toBe(false);
    expect(existsSync(path.join(dir, 'neurons', 'old-thing'))).toBe(false);
    expect((await plan(open)).status).toBe('rejected');
    const g = await call<{ links: { reader: string }[] }>('GET', '/graph');
    expect(g.links.some((l) => l.reader === 'old-thing')).toBe(false);
    expect(await call('GET', '/neurons/notes/permissions')).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ caller: 'old-thing' })]),
    );
    await expect(call('POST', '/neurons/dominus/remove')).rejects.toThrow(/404/);
  });

  it('the options change what they say: the depth sets how far a research goes', async () => {
    expect(await call('GET', '/settings')).toEqual({ depth: 'medium' });
    expect(await call('POST', '/settings', { depth: 'deep' })).toEqual({ depth: 'deep' });
    await expect(call('POST', '/settings', { depth: 'endless' })).rejects.toThrow(/400/);
    await expect(call('POST', '/settings', { other: 1 })).rejects.toThrow(/400/);
    const id = await ask('copy the simulator of https://invest.example.com/x');
    await until(id, 'ready', 'failed');
    const job = await call<{ payload: { maxPages: number } }>(
      'GET',
      `/jobs/${(await plan(id)).researchJob}`,
    );
    expect(job.payload.maxPages).toBe(60);
    await call('POST', `/plans/${id}/reject`);
    await call('POST', '/settings', { depth: 'medium' });
  });

  it('an API connection is added from a preset, listed without its key, and removed', async () => {
    const before = await call<{ presets: Record<string, object>; list: object[] }>(
      'GET',
      '/connections',
    );
    expect(Object.keys(before.presets)).toContain('ollama');
    // A local server needs no key, so nothing goes to the system's credential store here.
    await call('POST', '/connections', { preset: 'ollama' });
    const after = await call<{ list: { id: string; needsKey: boolean; baseUrl: string }[] }>(
      'GET',
      '/connections',
    );
    expect(after.list).toContainEqual(
      expect.objectContaining({
        id: 'ollama',
        needsKey: false,
        baseUrl: 'http://localhost:11434/v1',
      }),
    );
    expect(JSON.stringify(after)).not.toMatch(/key"\s*:\s*"/);
    await expect(
      call('POST', '/connections', { name: 'Bad', baseUrl: 'http://evil.example.com/v1' }),
    ).rejects.toThrow(/400/);
    expect((await call<{ id: string }[]>('GET', '/providers')).map((p) => p.id)).toContain(
      'ollama',
    );
    await call('POST', '/connections/ollama/remove');
    expect((await call<{ id: string }[]>('GET', '/providers')).map((p) => p.id)).not.toContain(
      'ollama',
    );
  });

  it('the runs are listed with what, how it ended and the cost, never the prompt', async () => {
    const runs = await call<{ kind: string; status: string; prompt?: string }[]>('GET', '/runs');
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.some((r) => r.kind === 'build' && r.status === 'done')).toBe(true);
    expect(JSON.stringify(runs)).not.toContain('"prompt"');
  });

  it('the history has every request, newest first, with its way through the stages', async () => {
    type H = {
      request: string;
      status: string;
      research: { cases: number; sites: number } | null;
      plan: { name: string } | null;
      build: { files: number; verified: { passed: number; total: number } | null } | null;
    };
    const list = await call<H[]>('GET', '/plans/history');
    expect(list.length).toBeGreaterThan(5);
    const copy = list.find((h) => h.request.includes('[check-fail-once]'))!;
    expect(copy).toMatchObject({
      status: 'built',
      research: { cases: 2 },
      plan: { name: 'Yield simulator' },
      build: { verified: { passed: 2, total: 2 } },
    });
    expect(list.some((h) => h.status === 'rejected')).toBe(true);
    expect(JSON.stringify(list)).not.toContain('"prompt"');
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

  it('a core killed in the middle of a build finishes it after it restarts', async () => {
    const id = await ask('Crash: built across a restart');
    await until(id, 'ready');
    await call('POST', `/plans/${id}/accept`);
    await waitFor(async () => (await plan(id)).steps.some((s) => s.kind === 'file'));
    core.kill('SIGKILL');
    await new Promise((r) => core.on('exit', r));
    core = startCore();
    await waitFor(() => isCoreUp(paths));
    const done = await until(id, 'built', 'failed');
    expect(done.status).toBe('built');
    expect(existsSync(path.join(dir, 'neurons', done.neuron!, 'app', 'index.html'))).toBe(true);
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
