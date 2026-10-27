import { corePaths } from './paths.ts';
import { loadProviders } from './providers/index.ts';
import { MODEL_ROLES, type AskMode, type ModelRole } from './providers/types.ts';

// A worker runs exactly one job in its own process and talks to the core only through IPC. It
// never touches the database. If the core goes away, the worker exits too.

type JobMessage = { id: string; type: string; payload: unknown; checkpoint: unknown };
type ToWorker = { kind: 'start'; job: JobMessage } | { kind: 'cancel' };

export type AskPayload = {
  provider: string;
  role: ModelRole;
  mode: AskMode;
  prompt: string;
  system?: string;
  effort?: 'low' | 'medium' | 'high';
  cwd?: string;
  /**
   * files: the agent reads and writes inside cwd and nothing else (building a neuron).
   * research: only the research tools, recording in cwd (researching before a plan).
   */
  access?: 'files' | 'research';
  /** Research: navigations allowed, by the depth. */
  maxPages?: number;
  /** Research: the language the browser announces. */
  locale?: string;
  sessionId?: string;
  /** The kind of task ("chat", "build"...), so the Router learns what works for each. */
  kind?: string;
  /** Why the Router chose this connection and role, when it did. */
  route?: string[];
  /** The role comes from the tuning (it is trying it out): the Router keeps it. */
  tuned?: boolean;
};

export function isAskPayload(p: unknown): p is AskPayload {
  const a = p as AskPayload;
  return (
    typeof a?.provider === 'string' &&
    MODEL_ROLES.includes(a.role) &&
    (a.mode === 'text' || a.mode === 'agent') &&
    typeof a.prompt === 'string' &&
    a.prompt.length > 0 &&
    (a.kind === undefined || (typeof a.kind === 'string' && a.kind.length <= 40)) &&
    (a.access === undefined ||
      ((a.access === 'files' || a.access === 'research') && a.mode === 'agent' && !!a.cwd)) &&
    (a.maxPages === undefined ||
      (Number.isInteger(a.maxPages) && a.maxPages >= 1 && a.maxPages <= 100)) &&
    (a.locale === undefined ||
      (typeof a.locale === 'string' && /^[a-z]{2}(-[A-Z]{2})?$/.test(a.locale)))
  );
}

const send = (msg: object) => process.send?.(msg);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let canceled = false;
// Aborting stops whatever the provider started (a CLI process, an HTTP request).
const abort = new AbortController();

type Handler = (payload: unknown, checkpoint: unknown) => Promise<unknown>;

class QuotaWait extends Error {
  until: number;
  constructor(until: number, window: string) {
    super(`quota window ${window} ran out`);
    this.until = until;
  }
}

const handlers: Record<string, Handler> = {
  /** The Dominus asks an AI by role; the adapter decides how. Quota goes back to the core. */
  async ask(payload) {
    if (!isAskPayload(payload)) throw new Error('invalid ask payload');
    const provider = loadProviders(corePaths()).get(payload.provider);
    if (!provider) throw new Error(`unknown provider: ${payload.provider}`);
    if (!provider.capabilities.modes.includes(payload.mode))
      throw new Error(`${provider.name} cannot run in ${payload.mode} mode`);
    let blocked: { name: string; resetsAt: string | null } | undefined;
    try {
      return await provider.ask({ ...payload, signal: abort.signal }, (e) => {
        if (e.type === 'quota') {
          send({ kind: 'quota', provider: provider.id, windows: e.windows });
          blocked = e.windows.find((w) => w.blocked) ?? blocked;
        } else send({ kind: 'event', event: e });
      });
    } catch (e) {
      // The provider said a window ran out: wait for it to reset instead of failing.
      const until = blocked?.resetsAt ? Date.parse(blocked.resetsAt) : NaN;
      if (blocked && !canceled && Number.isFinite(until)) throw new QuotaWait(until, blocked.name);
      throw e;
    }
  },
};

/** The answer key run against a build, in a page with no network (no AI: costs nothing). */
handlers.checks = async (payload) => {
  const p = payload as { dir?: unknown; cases?: unknown };
  if (typeof p?.dir !== 'string' || !Array.isArray(p.cases) || p.cases.length > 40)
    throw new Error('invalid checks payload');
  const { runChecks } = await import('./browser/checks.ts');
  return runChecks(p.dir, p.cases);
};

// Jobs that exist only to test the core: steps with checkpoints, and a worker that hangs.
if (process.env.CEREBRO_TEST_JOBS === '1') {
  handlers.steps = async (payload, checkpoint) => {
    const { steps, stepMs } = payload as { steps: number; stepMs: number };
    const from = (checkpoint as { step: number } | null)?.step ?? 0;
    for (let step = from + 1; step <= steps; step++) {
      if (canceled) throw new Error('canceled');
      await sleep(stepMs);
      send({ kind: 'event', event: { type: 'text', text: `step ${step}/${steps}` } });
      send({ kind: 'checkpoint', checkpoint: { step } });
    }
    return { steps, resumedFrom: from };
  };
  handlers.hang = async () => {
    for (;;);
  };
}

export const jobTypes = () => Object.keys(handlers);

// Only when the core started this file as a worker (the core also imports it, for the job types).
if (process.env.CEREBRO_WORKER === '1' && process.send) {
  process.on('disconnect', () => {
    abort.abort();
    process.exit(0);
  });

  // Heartbeat: proves the worker's event loop is alive (a hung job stops sending it).
  setInterval(() => send({ kind: 'heartbeat' }), 1000).unref();

  process.on('message', async (msg: ToWorker) => {
    if (msg.kind === 'cancel') {
      canceled = true;
      abort.abort();
      return;
    }
    try {
      const handler = handlers[msg.job.type];
      if (!handler) throw new Error(`unknown job type: ${msg.job.type}`);
      send({ kind: 'done', result: await handler(msg.job.payload, msg.job.checkpoint) });
    } catch (e) {
      if (e instanceof QuotaWait) send({ kind: 'wait', until: e.until, error: e.message });
      else
        send({ kind: canceled ? 'canceled' : 'error', error: String((e as Error).message ?? e) });
    }
    process.disconnect?.();
  });
}
