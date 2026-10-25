import { fork, type ChildProcess } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { clockState, nowMs, setOffset, syncClock } from './clock.ts';
import { corePaths } from './paths.ts';
import { loadProviders } from './providers/index.ts';
import type { HealthCheck } from './providers/types.ts';
import { Queue, toJob, type JobRow, type NewJob } from './queue.ts';
import { isAskPayload, jobTypes } from './worker.ts';

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
    if (!job) return;
    startWorker(job);
  }
}

type FromWorker =
  | { kind: 'heartbeat' }
  | { kind: 'checkpoint'; checkpoint: unknown }
  | { kind: 'quota'; provider: string; windows: Parameters<Queue['saveQuota']>[1] }
  | { kind: 'event'; event: object }
  | { kind: 'done'; result: unknown }
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
    else if (msg.kind === 'canceled') settle(r, 'canceled', { error: 'canceled by the owner' });
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

class BadRequest extends Error {}

/** Checks a new job before it enters the queue, so the queue holds only runnable work. */
function validJob(body: unknown): NewJob {
  const j = body as NewJob;
  if (!j || typeof j.type !== 'string' || !jobTypes().includes(j.type))
    throw new BadRequest('unknown job type');
  if (j.type === 'ask') {
    if (!isAskPayload(j.payload)) throw new BadRequest('invalid ask payload');
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
    const id = queue.enqueue(validJob(await readBody(req)));
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
        source: p.capabilities.quotaSource,
        windows: queue.quota(p.id),
        spentLast7Days: queue.spent(p.id, week),
      })),
    );
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
    const bad = e instanceof BadRequest;
    if (!bad) console.error('dominus core:', e);
    if (!res.headersSent) res.writeHead(bad ? 400 : 500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: bad ? e.message : 'internal error' }));
  });
});

function shutdown() {
  for (const r of running.values()) r.proc.kill('SIGKILL');
  server.close();
  queue.close();
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
