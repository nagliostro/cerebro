import { fork, type ChildProcess } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { clockState, nowMs, setOffset, syncClock } from './clock.ts';
import { Contracts, ContractError } from './contract.ts';
import { Graph, GraphError } from './graph.ts';
import { corePaths } from './paths.ts';
import { loadProviders } from './providers/index.ts';
import type { AiProvider, AskMode, HealthCheck, ModelRole } from './providers/types.ts';
import { buildEstimate, guard } from './quota/guard.ts';
import { route as pickRoute, type Candidate, type RouteRequest } from './quota/router.ts';
import { windowStatus } from './quota/status.ts';
import { Queue, toJob, type JobRow, type NewJob } from './queue.ts';
import { isAskPayload, jobTypes, type AskPayload } from './worker.ts';

// The Dominus core: an event bus, a durable queue and a supervisor that runs each AI job in a
// worker process of its own. The core never awaits the AI; it only reacts to events (a request,
// a worker message, a worker exit, that job's timer). No polling loops.
//
// It listens on a named pipe or Unix socket of the data folder (see paths.ts) and answers only
// requests that carry the token in the core-token file, which only the owner can read.

const MAX_WORKERS = Number(process.env.CEREBRO_MAX_WORKERS ?? 2);
const HEARTBEAT_MS = 5000;
const CANCEL_GRACE_MS = 2000;
const HEALTH_TTL_MS = 5 * 60_000;
const CLOCK_SYNC_MS = 60 * 60_000;
const MAX_BODY = 1 << 20;
const WORKER = fileURLToPath(new URL('./worker.ts', import.meta.url));

const paths = corePaths();
mkdirSync(paths.dir, { recursive: true, mode: 0o700 });

function loadToken(): string {
  try {
    const token = readFileSync(paths.token, 'utf8').trim();
    if (token.length >= 32) return token;
  } catch {
    // First start: create it below.
  }
  const token = randomBytes(32).toString('base64url');
  writeFileSync(paths.token, token, { mode: 0o600 });
  return token;
}
const token = Buffer.from(loadToken());

const queue = new Queue(paths.db);
const graph = new Graph(paths.db);
const contracts = new Contracts(paths.db);
const bus = new EventEmitter();
bus.setMaxListeners(50);
const lag = monitorEventLoopDelay({ resolution: 10 });
lag.enable();

// The clock: the last offset first (in case there is no internet), then a fresh measurement.
setOffset(Number(queue.getMeta('clock.offsetMs') ?? 0));
async function sync() {
  if (process.env.CEREBRO_CLOCK === 'off') return;
  const state = await syncClock();
  if (state.synced) {
    queue.setMeta('clock.offsetMs', String(state.offsetMs));
    emit('clock.synced', { offsetMs: state.offsetMs });
  }
}
setInterval(sync, CLOCK_SYNC_MS).unref();

type Running = {
  job: JobRow;
  proc: ChildProcess;
  heartbeat: NodeJS.Timeout;
  deadline: NodeJS.Timeout;
  settled: boolean;
};
const running = new Map<string, Running>();

function emit(type: string, data: object) {
  bus.emit('event', { type, at: nowMs(), ...data });
}

function dispatch() {
  while (running.size < MAX_WORKERS) {
    const job = queue.claim();
    if (!job) break;
    startWorker(job);
  }
  scheduleWakeup();
}

// Jobs waiting for a quota to reset: one timer for the earliest, set again after each change.
let wakeup: NodeJS.Timeout | undefined;
function scheduleWakeup() {
  clearTimeout(wakeup);
  const at = queue.nextWakeup();
  if (at === null) return;
  // Timers hold at most ~24 days; a later wake-up just sets the timer again.
  wakeup = setTimeout(dispatch, Math.min(Math.max(0, at - nowMs()) + 50, 2 ** 31 - 1));
}

type FromWorker =
  | { kind: 'heartbeat' }
  | { kind: 'checkpoint'; checkpoint: unknown }
  | { kind: 'quota'; provider: string; windows: Parameters<Queue['saveQuota']>[1] }
  | { kind: 'event'; event: object }
  | { kind: 'done'; result: unknown }
  | { kind: 'wait'; until: number; error: string }
  | { kind: 'canceled' | 'error'; error: string };

function startWorker(job: JobRow) {
  const proc = fork(WORKER, [], {
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    env: { ...process.env, CEREBRO_WORKER: '1' },
  });
  const r: Running = {
    job,
    proc,
    settled: false,
    heartbeat: setTimeout(() => kill(r, 'no heartbeat'), HEARTBEAT_MS),
    deadline: setTimeout(() => kill(r, `timeout after ${job.max_ms} ms`), job.max_ms),
  };
  running.set(job.id, r);
  queue.setWorker(job.id, proc.pid!);
  emit('job.started', { id: job.id, jobType: job.type, attempt: job.attempts, pid: proc.pid });

  const { payload, checkpoint } = toJob(job);
  proc.send({ kind: 'start', job: { id: job.id, type: job.type, payload, checkpoint } });

  proc.on('message', (msg: FromWorker) => {
    if (msg.kind === 'heartbeat') r.heartbeat.refresh();
    else if (msg.kind === 'checkpoint') queue.saveCheckpoint(job.id, msg.checkpoint);
    else if (msg.kind === 'quota') {
      queue.saveQuota(msg.provider, msg.windows);
      emit('quota.updated', { provider: msg.provider });
    } else if (msg.kind === 'event') emit('job.progress', { id: job.id, ...msg.event });
    else if (msg.kind === 'done') settle(r, 'done', { result: msg.result });
    else if (msg.kind === 'wait') {
      // Not a failure: back to the queue, keeping the checkpoint, until the window resets.
      r.settled = true;
      queue.defer(job.id, msg.until, msg.error);
      emit('job.waiting', { id: job.id, until: msg.until, reason: msg.error });
    } else if (msg.kind === 'canceled') settle(r, 'canceled', { error: 'canceled by the owner' });
    else if (msg.kind === 'error') settle(r, 'failed', { error: msg.error });
  });

  // Crash, kill or normal exit: anything not settled yet goes back to the queue.
  proc.on('exit', (code, signal) => {
    clearTimeout(r.heartbeat);
    clearTimeout(r.deadline);
    running.delete(job.id);
    if (!r.settled) {
      queue.retryOrFail(job.id, `worker exited (${signal ?? code})`);
      emit('job.crashed', { id: job.id, code, signal, status: queue.get(job.id)?.status });
    }
    dispatch();
  });
}

function settle(
  r: Running,
  status: 'done' | 'failed' | 'canceled',
  data: { result?: unknown; error?: string },
) {
  if (r.settled) return;
  r.settled = true;
  queue.finish(r.job.id, status, data);
  emit(`job.${status}`, { id: r.job.id, ...data });
}

/** Hung or over time: no retry, a stuck job would only get stuck again. */
function kill(r: Running, reason: string) {
  settle(r, 'failed', { error: reason });
  r.proc.kill('SIGKILL');
}

function cancel(id: string) {
  if (queue.cancelQueued(id)) {
    emit('job.canceled', { id });
    return true;
  }
  const r = running.get(id);
  if (!r) return false;
  r.proc.send({ kind: 'cancel' });
  setTimeout(() => {
    if (running.has(id)) {
      settle(r, 'canceled', { error: 'canceled by the owner (forced)' });
      r.proc.kill('SIGKILL');
    }
  }, CANCEL_GRACE_MS).unref();
  return true;
}

function stats() {
  const m = process.memoryUsage();
  return {
    pid: process.pid,
    rssMb: +(m.rss / 2 ** 20).toFixed(1),
    heapMb: +(m.heapUsed / 2 ** 20).toFixed(1),
    lagP99Ms: +(lag.percentile(99) / 1e6).toFixed(2),
    running: running.size,
  };
}

// Checking a provider can start a CLI or call the internet: the answer is kept for a while.
const health = new Map<string, { at: number; check: HealthCheck }>();
async function providerList(fresh: boolean) {
  const providers = [...loadProviders(paths).values()];
  return Promise.all(
    providers.map(async (p) => {
      let h = health.get(p.id);
      if (fresh || !h || nowMs() - h.at > HEALTH_TTL_MS) {
        h = { at: nowMs(), check: await p.check() };
        health.set(p.id, h);
      }
      return { id: p.id, name: p.name, capabilities: p.capabilities, health: h.check };
    }),
  );
}

function quota(p: AiProvider) {
  return windowStatus(queue, p, nowMs());
}

/** What the Router needs to know about each connection, all from the database and the cache. */
async function candidates(kind: string | undefined): Promise<Candidate[]> {
  const healthy = new Map((await providerList(false)).map((p) => [p.id, p.health.ok]));
  const since = nowMs() - 30 * 86_400_000;
  return [...loadProviders(paths).values()].map((p) => ({
    id: p.id,
    capabilities: p.capabilities,
    healthy: healthy.get(p.id) ?? false,
    windows: quota(p),
    history: queue
      .asks(p.id, since)
      .filter((a) => (a.kind ?? undefined) === kind)
      .map((a) => ({ role: a.role, ok: a.status === 'done', costUsd: a.costUsd })),
  }));
}

const modeOf = (v: unknown): AskMode | null => (v === 'text' || v === 'agent' ? v : null);

function routeRequest(body: unknown): RouteRequest {
  const b = body as {
    mode?: unknown;
    kind?: unknown;
    lock?: { provider?: unknown; role?: unknown };
  };
  const mode = modeOf(b?.mode);
  if (!mode) throw new BadRequest('invalid mode');
  const kind = typeof b.kind === 'string' && b.kind.length <= 40 ? b.kind : undefined;
  const lock =
    typeof b.lock?.provider === 'string'
      ? { provider: b.lock.provider, role: b.lock.role as ModelRole | undefined }
      : undefined;
  return { mode, kind, lock };
}

/** An ask for provider "auto" is routed when it enters the queue; the choice is recorded. */
async function resolveAuto(payload: AskPayload): Promise<AskPayload> {
  if (payload.provider !== 'auto') return payload;
  const r = pickRoute({ mode: payload.mode, kind: payload.kind }, await candidates(payload.kind));
  if (!r.ok) throw new BadRequest(r.why);
  return { ...payload, provider: r.provider, role: r.role, route: r.reasons } as AskPayload;
}

class BadRequest extends Error {}

/** Checks a new job before it enters the queue, so the queue holds only runnable work. */
function validJob(body: unknown): NewJob {
  const j = body as NewJob;
  if (!j || typeof j.type !== 'string' || !jobTypes().includes(j.type))
    throw new BadRequest('unknown job type');
  if (j.type === 'ask') {
    if (!isAskPayload(j.payload)) throw new BadRequest('invalid ask payload');
    if (j.payload.provider === 'auto') return j; // routed by the caller, then checked again
    const provider = loadProviders(paths).get(j.payload.provider);
    if (!provider) throw new BadRequest('unknown provider');
    if (!provider.capabilities.modes.includes(j.payload.mode))
      throw new BadRequest('mode not supported by this provider');
  }
  const int = (v: unknown, min: number, max: number) =>
    v === undefined || (Number.isInteger(v) && (v as number) >= min && (v as number) <= max);
  if (!int(j.priority, -10, 10)) throw new BadRequest('invalid priority');
  if (!int(j.maxMs, 1000, 4 * 3600_000)) throw new BadRequest('invalid maxMs');
  if (!int(j.maxAttempts, 1, 10)) throw new BadRequest('invalid maxAttempts');
  return {
    type: j.type,
    payload: j.payload,
    priority: j.priority,
    maxMs: j.maxMs,
    maxAttempts: j.maxAttempts,
  };
}

const readBody = (req: IncomingMessage) =>
  new Promise<unknown>((resolve, reject) => {
    let s = '';
    req.on('data', (d) => {
      s += d;
      if (s.length > MAX_BODY) reject(new BadRequest('body too large'));
    });
    req.on('end', () => {
      try {
        resolve(s ? JSON.parse(s) : {});
      } catch {
        reject(new BadRequest('invalid JSON'));
      }
    });
  });

function authorized(req: IncomingMessage) {
  const given = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer /, ''));
  return given.length === token.length && timingSafeEqual(given, token);
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const json = (code: number, data: unknown) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  if (!authorized(req)) return json(401, { error: 'unauthorized' });

  const url = new URL(req.url ?? '/', 'http://core');
  const jobMatch = url.pathname.match(/^\/jobs\/([\w-]+)(\/cancel)?$/);

  if (req.method === 'POST' && url.pathname === '/jobs') {
    let job = validJob(await readBody(req));
    if (job.type === 'ask' && (job.payload as AskPayload).provider === 'auto')
      job = validJob({ ...job, payload: await resolveAuto(job.payload as AskPayload) });
    const id = queue.enqueue(job);
    emit('job.queued', { id });
    dispatch();
    return json(201, { id });
  }
  if (req.method === 'GET' && url.pathname === '/jobs') return json(200, queue.list().map(toJob));
  if (req.method === 'GET' && jobMatch && !jobMatch[2]) {
    const job = queue.get(jobMatch[1]!);
    return job ? json(200, toJob(job)) : json(404, { error: 'not found' });
  }
  if (req.method === 'POST' && jobMatch?.[2]) return json(200, { ok: cancel(jobMatch[1]!) });
  if (req.method === 'GET' && url.pathname === '/stats') return json(200, stats());
  if (req.method === 'GET' && url.pathname === '/clock') return json(200, clockState());
  // Dominus calls: the same shape for every provider; no AI is called to answer them.
  if (req.method === 'GET' && url.pathname === '/providers')
    return json(200, await providerList(url.searchParams.has('fresh')));
  if (req.method === 'GET' && url.pathname === '/quota') {
    const week = nowMs() - 7 * 86_400_000;
    return json(
      200,
      [...loadProviders(paths).values()].map((p) => ({
        provider: p.id,
        name: p.name,
        source: p.capabilities.quotaSource,
        windows: quota(p),
        spentLast7Days: queue.spent(p.id, week),
      })),
    );
  }
  // The Router's choice for a request, without running it.
  if (req.method === 'POST' && url.pathname === '/route') {
    const r = routeRequest(await readBody(req));
    return json(200, pickRoute(r, await candidates(r.kind)));
  }
  // The Guard before a big job: the estimate (or a given cost) against each window.
  if (req.method === 'POST' && url.pathname === '/guard') {
    const b = (await readBody(req)) as { provider?: unknown; kind?: unknown; costUsd?: unknown };
    const p = typeof b.provider === 'string' ? loadProviders(paths).get(b.provider) : undefined;
    if (!p) throw new BadRequest('unknown provider');
    const kind = typeof b.kind === 'string' ? b.kind : 'build';
    const past = queue
      .asks(p.id, nowMs() - 90 * 86_400_000)
      .filter((a) => a.kind === kind && a.status === 'done')
      .map((a) => a.costUsd ?? 0);
    const cost = typeof b.costUsd === 'number' && b.costUsd > 0 ? b.costUsd : buildEstimate(past);
    return json(200, { costUsd: cost, ...guard(cost, quota(p), nowMs()) });
  }
  // The graph: what the Memória draws, and the few changes the rest of the Cerebro makes to it.
  if (req.method === 'GET' && url.pathname === '/graph') return json(200, graph.view());
  if (req.method === 'POST' && url.pathname.startsWith('/graph/')) {
    const b = (await readBody(req)) as Record<string, unknown>;
    const text = (v: unknown) => (typeof v === 'string' ? v : '');
    let result: unknown = { ok: true };
    if (url.pathname === '/graph/neurons')
      result = { id: graph.addNeuron({ name: b.name, role: b.role, hue: b.hue }) };
    else if (url.pathname === '/graph/conversations')
      graph.recordConversation(text(b.a), text(b.b));
    else if (url.pathname === '/graph/links') graph.addLink(text(b.reader), text(b.target));
    else return json(404, { error: 'not found' });
    emit('graph.changed', {});
    return json(201, result);
  }
  // A neuron, its data, its contract and who may ask it what. The screens reach these only for
  // the neuron whose page is open, and only the owner's own page changes permissions.
  const neuronMatch = url.pathname.match(/^\/neurons\/([a-z0-9-]{1,40})(?:\/(\w+))?$/);
  if (neuronMatch) {
    const [, id, what] = neuronMatch as unknown as [string, string, string | undefined];
    const neuron = graph.neuron(id);
    if (!neuron) return json(404, { error: 'unknown neuron' });
    if (req.method === 'GET' && !what) return json(200, neuron);
    if (req.method === 'GET' && what === 'contract') return json(200, contracts.contract(id));
    if (req.method === 'GET' && what === 'permissions') return json(200, contracts.permissions(id));
    if (req.method === 'POST') {
      const b = (await readBody(req)) as Record<string, unknown>;
      if (what === 'data') return json(200, contracts.run(id, b.collection, b.op, b.input));
      if (what === 'call') {
        // One neuron asks another: only what the owner allowed; it counts as a conversation.
        const target = typeof b.target === 'string' ? b.target : '';
        const [collection, op] = typeof b.operation === 'string' ? b.operation.split('.') : [];
        if (!graph.neuron(target)) return json(404, { error: 'unknown neuron' });
        if (!collection || !op) throw new BadRequest('operation must be collection.op');
        if (!contracts.allowed(id, target, collection, op as never))
          return json(403, { error: 'not allowed' });
        const result = contracts.run(target, collection, op, b.input);
        graph.recordConversation(id, target);
        emit('graph.changed', {});
        return json(200, result);
      }
      if (what === 'permissions') {
        if (b.revokeAll === true) contracts.revokeAll(id);
        else {
          if (typeof b.caller !== 'string' || !graph.neuron(b.caller))
            throw new BadRequest('unknown caller');
          contracts.setPermission(id, b.caller, b.collection, b.grants);
        }
        return json(200, contracts.permissions(id));
      }
    }
    return json(404, { error: 'not found' });
  }
  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    const listener = (e: object) => res.write(`data: ${JSON.stringify(e)}\n\n`);
    bus.on('event', listener);
    req.on('close', () => bus.off('event', listener));
    return;
  }
  json(404, { error: 'not found' });
}

const server = createServer((req, res) => {
  route(req, res).catch((e) => {
    const bad = e instanceof BadRequest || e instanceof GraphError || e instanceof ContractError;
    if (!bad) console.error('dominus core:', e);
    if (!res.headersSent) res.writeHead(bad ? 400 : 500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: bad ? e.message : 'internal error' }));
  });
});

function shutdown() {
  for (const r of running.values()) r.proc.kill('SIGKILL');
  server.close();
  queue.close();
  graph.close();
  contracts.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

/** A Unix socket file left by a core that died: remove it, but never one that still answers. */
function clearStaleSocket() {
  if (process.platform === 'win32') return Promise.resolve();
  return new Promise<void>((resolve) => {
    const probe = createConnection(paths.socket);
    probe.on('connect', () => {
      probe.destroy();
      resolve();
    });
    probe.on('error', () => {
      rmSync(paths.socket, { force: true });
      resolve();
    });
  });
}

// The socket doubles as a single-instance lock: a second core fails here before touching jobs.
server.on('error', (e) => {
  console.error(`dominus core not started: ${e.message}`);
  process.exit(1);
});
await clearStaleSocket();
server.listen(paths.socket, () => {
  const recovered = queue.recover();
  console.log(`dominus core ${process.pid} ready, ${recovered} job(s) resumed`);
  dispatch();
  void sync();
});
