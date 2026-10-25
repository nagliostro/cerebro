import { median, nowMs } from '../clock.ts';
import type { Contracts } from '../contract.ts';
import { colorOf, DOMINUS_ID, type Graph } from '../graph.ts';
import { listFiles, readText } from '../providers/file-tools.ts';
import type { AskEvent } from '../providers/types.ts';
import { buildEstimate, guard, type GuardWindow } from '../quota/guard.ts';
import type { Queue } from '../queue.ts';
import type { AskPayload } from '../worker.ts';
import {
  appDir,
  BuildCheckError,
  checkDraft,
  draftDir,
  dropDraft,
  install,
  makeDraft,
  undo,
} from './install.ts';
import {
  ACTIVE,
  MAX_REQUEST,
  parsePlan,
  PlanError,
  type Estimate,
  type PlanRow,
  type Plans,
  type Step,
} from './plan.ts';
import {
  BUILD_SYSTEM,
  buildPrompt,
  PLAN_SYSTEM,
  planPrompt,
  type NeuronSummary,
} from './prompts.ts';

// The Builder: a request becomes a plan (text mode, cheap), an accepted plan becomes a neuron
// (agent mode, files only, in a draft folder). The core never waits for either: it enqueues the
// job and reacts to its events. Every point the screen shows comes from a step recorded here.

const BUILD_MAX_MS = 45 * 60_000;
const THINK_MAX_MS = 5 * 60_000;
const DAY = 86_400_000;
/** How much of an application's code the planner reads to adjust it (about 12k tokens). */
const PLAN_CODE_LIMIT = 48_000;

export type BuilderDeps = {
  dataDir: string;
  plans: Plans;
  queue: Queue;
  graph: Graph;
  contracts: Contracts;
  /** Routes ("auto"), checks and enqueues an ask; throws when no AI can take it. */
  enqueueAsk: (
    payload: AskPayload,
    opts: { maxMs: number; maxAttempts: number },
  ) => Promise<string>;
  cancelJob: (id: string) => boolean;
  /** The provider the Router would pick, and its windows for the Guard. */
  routeFor: (
    mode: 'text' | 'agent',
    kind: string,
  ) => Promise<{
    provider: string | null;
    windows: GuardWindow[];
  }>;
  emit: (type: string, data: object) => void;
};

export class BuildError extends Error {}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export class Builder {
  private d: BuilderDeps;

  constructor(deps: BuilderDeps) {
    this.d = deps;
  }

  private changed(id: string) {
    this.d.emit('plan.changed', { plan: id });
  }

  /** The neurons as the planner sees them: names, roles and the shape of their data. */
  private summaries(): NeuronSummary[] {
    return this.d.graph.view().neurons.map((n) => ({
      id: n.id,
      name: n.name,
      role: n.role,
      collections: this.d.contracts
        .contract(n.id)
        .collections.map((c) => ({ name: c.name, fields: c.fields.map((f) => f.name) })),
    }));
  }

  /** A neuron whose name the request mentions: maybe it already does this (code, no AI). */
  private similar(request: string, neurons: NeuronSummary[]): string | null {
    const text = ` ${normalize(request).replace(/[^a-z0-9]+/g, ' ')} `;
    const hit = neurons.find((n) =>
      normalize(n.name)
        .split(/[^a-z0-9]+/)
        .some((w) => w.length >= 4 && text.includes(` ${w} `)),
    );
    return hit?.id ?? null;
  }

  async start(input: Record<string, unknown>): Promise<string> {
    const request = typeof input.request === 'string' ? input.request.trim() : '';
    if (!request || request.length > MAX_REQUEST) throw new BuildError('invalid request');
    const locale = input.locale === 'pt-BR' ? 'pt-BR' : 'en';
    let target: string | null = null;
    if (input.target !== undefined && input.target !== null) {
      if (typeof input.target !== 'string' || !this.d.graph.neuron(input.target))
        throw new BuildError('unknown neuron');
      target = input.target;
    }
    const id = this.d.plans.create(request, locale, target);
    const neurons = this.summaries();
    const steps: Step[] = [
      { kind: 'read', words: words(request) },
      {
        kind: 'memory',
        neurons: neurons.length,
        similar: target ? null : this.similar(request, neurons),
      },
    ];
    this.d.plans.update(id, { steps });
    await this.think(id);
    return id;
  }

  /** Asks for the plan (again, after answers or changes). */
  private async think(id: string) {
    const row = this.d.plans.get(id)!;
    const neurons = this.summaries();
    let target:
      (NeuronSummary & { files: string[]; code: { path: string; text: string }[] }) | undefined;
    if (row.target) {
      const t = neurons.find((n) => n.id === row.target);
      if (t) {
        const dir = appDir(this.d.dataDir, t.id);
        const files = await listFiles(dir).catch(() => []);
        // The code goes with the request (text mode reads it cheaply), up to a limit.
        const code: { path: string; text: string }[] = [];
        let size = 0;
        for (const path of files.filter((f) => /\.(html|css|js|json)$/.test(f))) {
          const text = await readText(dir, path).catch(() => '');
          if (size + text.length > PLAN_CODE_LIMIT) break;
          size += text.length;
          code.push({ path, text });
        }
        target = { ...t, files, code };
      }
    }
    const steps = [
      ...row.steps.filter((s) => s.kind !== 'think'),
      { kind: 'think', done: false } as Step,
    ];
    try {
      const job = await this.d.enqueueAsk(
        {
          provider: 'auto',
          role: 'balanced',
          mode: 'text',
          kind: 'think',
          system: PLAN_SYSTEM,
          prompt: planPrompt({
            request: row.request,
            locale: row.locale,
            exchanges: row.exchanges,
            neurons: neurons.filter((n) => n.id !== row.target),
            target,
          }),
        },
        { maxMs: THINK_MAX_MS, maxAttempts: 2 },
      );
      this.d.plans.update(id, {
        status: 'thinking',
        thinkJob: job,
        steps,
        error: null,
        startedAt: nowMs(),
      });
    } catch (e) {
      this.d.plans.update(id, { status: 'failed', error: (e as Error).message, steps });
    }
    this.changed(id);
  }

  /** What building should cost and whether it fits, by the Guard. */
  private async estimate(): Promise<Estimate> {
    const r = await this.d.routeFor('agent', 'build');
    const none: Estimate = {
      provider: r.provider,
      costUsd: null,
      verdict: r.provider ? 'unknown' : 'none-ready',
      share: null,
      window: null,
      until: null,
      basis: 0,
      durationMs: null,
    };
    if (!r.provider) return none;
    const past = this.d.queue
      .asks(r.provider, nowMs() - 90 * DAY)
      .filter((a) => a.kind === 'build' && a.status === 'done');
    const cost = buildEstimate(past.map((a) => a.costUsd ?? 0));
    const durations = past.map((a) => a.elapsedMs ?? 0).filter((ms) => ms > 0);
    const v = guard(cost, r.windows, nowMs());
    const needed = 'needed' in v ? v.needed : {};
    const top = Object.entries(needed).sort((a, b) => b[1] - a[1])[0];
    return {
      ...none,
      costUsd: cost,
      verdict: v.verdict,
      share: top ? top[1] : null,
      window: 'window' in v ? v.window : (top?.[0] ?? null),
      until: v.verdict === 'wait' ? v.until : null,
      basis: past.length,
      durationMs: durations.length ? median(durations) : null,
    };
  }

  async answer(id: string, body: { text?: unknown }) {
    const row = this.mustGet(id);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > MAX_REQUEST) throw new BuildError('invalid text');
    if (row.status !== 'questions' && row.status !== 'ready') throw new BuildError('not waiting');
    const kind = row.status === 'questions' ? 'answer' : 'change';
    this.d.plans.update(id, { exchanges: [...row.exchanges, { kind, text }] });
    await this.think(id);
  }

  async accept(id: string) {
    const row = this.mustGet(id);
    if (row.status !== 'ready' || !row.plan?.ready) throw new BuildError('no plan to build');
    const target = row.target ? this.d.graph.neuron(row.target) : null;
    if (row.target && !target) throw new BuildError('unknown neuron');
    const color = target?.color ?? colorOf(this.d.graph.suggestHue());
    // Adjusting only when there is an application to change; otherwise its first one is built.
    const hasApp =
      !!target && !!(await listFiles(appDir(this.d.dataDir, target.id)).catch(() => [])).length;
    const draft = await makeDraft(this.d.dataDir, id, hasApp ? row.target! : undefined);
    try {
      const job = await this.d.enqueueAsk(
        {
          provider: 'auto',
          role: 'balanced',
          mode: 'agent',
          access: 'files',
          cwd: draft,
          kind: 'build',
          system: BUILD_SYSTEM,
          prompt: buildPrompt({
            locale: row.locale,
            color,
            plan: target ? { ...row.plan, name: target.name } : row.plan,
            request: row.request,
            adjusting: hasApp,
          }),
        },
        { maxMs: BUILD_MAX_MS, maxAttempts: 2 },
      );
      this.d.plans.update(id, {
        status: 'building',
        buildJob: job,
        adjusting: hasApp,
        color,
        steps: [],
        error: null,
        startedAt: nowMs(),
      });
    } catch (e) {
      await dropDraft(this.d.dataDir, id);
      throw new BuildError((e as Error).message);
    }
    this.changed(id);
  }

  /** Takes back the last adjustment of a neuron: its previous application returns. */
  async undo(id: string) {
    const row = this.mustGet(id);
    if (row.status !== 'built' || !row.adjusting || !row.neuron)
      throw new BuildError('nothing to undo');
    const [latest] = this.d.plans.recentBuilt(row.neuron);
    if (latest?.id !== id) throw new BuildError('only the last adjustment can be undone');
    try {
      await undo(this.d.dataDir, row.neuron);
    } catch (e) {
      throw new BuildError((e as Error).message);
    }
    this.d.plans.update(id, { status: 'undone' });
    this.changed(id);
  }

  reject(id: string) {
    const row = this.mustGet(id);
    if (row.status !== 'questions' && row.status !== 'ready' && row.status !== 'failed')
      throw new BuildError('nothing to reject');
    this.d.plans.update(id, { status: 'rejected' });
    this.changed(id);
  }

  cancel(id: string) {
    const row = this.mustGet(id);
    const job =
      row.status === 'thinking' ? row.thinkJob : row.status === 'building' ? row.buildJob : null;
    if (!job) throw new BuildError('nothing running');
    // The job's end (canceled) settles the plan; if the job was already gone, settle it here.
    if (!this.d.cancelJob(job)) void this.settled(job, 'canceled', {});
  }

  private mustGet(id: string): PlanRow {
    const row = this.d.plans.get(id);
    if (!row) throw new BuildError('unknown plan');
    return row;
  }

  /** Progress of a plan's job: each file the builder writes becomes a step. */
  progress(job: string, e: AskEvent) {
    if (e.type !== 'tool' || e.action !== 'write' || !e.target) return;
    const row = this.d.plans.byJob(job);
    if (!row || row.status !== 'building') return;
    const steps = row.steps.map((s) =>
      s.kind === 'file' && s.path !== e.target ? { ...s, done: true } : s,
    );
    if (!steps.some((s) => s.kind === 'file' && s.path === e.target))
      steps.push({ kind: 'file', path: e.target, done: false });
    this.d.plans.update(row.id, { steps });
    this.changed(row.id);
  }

  waiting(job: string, until: number) {
    const row = this.d.plans.byJob(job);
    if (!row) return;
    this.d.plans.update(row.id, {
      steps: [...row.steps.filter((s) => s.kind !== 'wait'), { kind: 'wait', until }],
    });
    this.changed(row.id);
  }

  /** A plan's job ended: the plan moves on. */
  async settled(
    job: string,
    status: 'done' | 'failed' | 'canceled',
    data: { result?: unknown; error?: string },
  ) {
    const row = this.d.plans.byJob(job);
    if (!row || !ACTIVE.includes(row.status)) return;
    const result = data.result as { text?: string; costUsd?: number | null } | undefined;
    if (row.thinkJob === job && row.status === 'thinking')
      await this.thought(row, status, result, data.error);
    else if (row.buildJob === job && row.status === 'building')
      await this.built(row, status, result, data.error);
    this.changed(row.id);
  }

  private async thought(
    row: PlanRow,
    status: 'done' | 'failed' | 'canceled',
    result: { text?: string; costUsd?: number | null } | undefined,
    error?: string,
  ) {
    const cost = result?.costUsd ?? 0;
    const steps = row.steps.map((s) =>
      s.kind === 'think' ? { kind: 'think', done: true, costUsd: result?.costUsd ?? null } : s,
    ) as Step[];
    if (status !== 'done') {
      this.d.plans.update(row.id, {
        status: status === 'canceled' ? 'canceled' : 'failed',
        error: error ?? null,
        steps,
      });
      return;
    }
    const known = new Set(this.d.graph.view().neurons.map((n) => n.id));
    if (row.target) known.delete(row.target);
    try {
      const plan = parsePlan(result?.text ?? '', known);
      const target = row.target ? this.d.graph.neuron(row.target) : null;
      if (target) {
        plan.name = target.name;
        plan.role = target.role;
        plan.existing = null;
      }
      this.d.plans.update(row.id, {
        status: plan.ready ? 'ready' : 'questions',
        plan,
        color: target?.color ?? colorOf(this.d.graph.suggestHue()),
        estimate: plan.ready ? await this.estimate() : null,
        steps,
        addThinkCost: cost,
      });
    } catch (e) {
      const why = e instanceof PlanError ? `bad-plan: ${e.message}` : (e as Error).message;
      this.d.plans.update(row.id, { status: 'failed', error: why, steps, addThinkCost: cost });
    }
  }

  private async built(
    row: PlanRow,
    status: 'done' | 'failed' | 'canceled',
    result: { costUsd?: number | null } | undefined,
    error?: string,
  ) {
    const files = row.steps.map((s) => (s.kind === 'file' ? { ...s, done: true } : s));
    if (status !== 'done') {
      await dropDraft(this.d.dataDir, row.id);
      this.d.plans.update(row.id, {
        status: status === 'canceled' ? 'canceled' : 'failed',
        error: error ?? null,
        steps: files,
        buildCostUsd: result?.costUsd ?? null,
      });
      return;
    }
    const draft = draftDir(this.d.dataDir, row.id);
    try {
      const check = await checkDraft(draft);
      const plan = row.plan!;
      const hue = Number(row.color?.match(/ (\d{1,3})\)$/)?.[1]);
      // Only now, with an application that passed, does the neuron join the graph.
      const id =
        row.target ??
        this.d.graph.addNeuron({
          name: plan.name,
          role: plan.role,
          hue: Number.isFinite(hue) ? hue : undefined,
        });
      await install(this.d.dataDir, id, draft, !!row.target);
      // The owner accepted the links with the plan: each one may read what it said.
      for (const l of plan.links) {
        if (!this.d.graph.neuron(l.neuron)) continue;
        const now = this.d.contracts
          .permissions(l.neuron)
          .find((p) => p.caller === id && p.collection === l.collection);
        const grants = [...new Set([...(now?.grants ?? []), 'view' as const])];
        this.d.contracts.setPermission(l.neuron, id, l.collection, grants);
        this.d.graph.addLink(id, l.neuron);
      }
      // The Dominus built it: their first conversation.
      this.d.graph.recordConversation(DOMINUS_ID, id);
      this.d.plans.update(row.id, {
        status: 'built',
        neuron: id,
        steps: [...files, { kind: 'check', files: check.files, bytes: check.bytes }],
        buildCostUsd: result?.costUsd ?? null,
      });
      this.d.emit('graph.changed', {});
    } catch (e) {
      await dropDraft(this.d.dataDir, row.id);
      const why = e instanceof BuildCheckError ? `bad-build: ${e.message}` : (e as Error).message;
      this.d.plans.update(row.id, {
        status: 'failed',
        error: why,
        steps: files,
        buildCostUsd: result?.costUsd ?? null,
      });
    }
  }

  /** On start: a plan whose job ended while the core was away moves on now. */
  async reconcile() {
    for (const row of this.d.plans.active()) {
      const job =
        row.status === 'thinking' ? row.thinkJob : row.status === 'building' ? row.buildJob : null;
      if (!job) continue;
      const j = this.d.queue.get(job);
      if (!j) await this.settled(job, 'failed', { error: 'job lost' });
      else if (j.status === 'done' || j.status === 'failed' || j.status === 'canceled')
        await this.settled(job, j.status, {
          result: j.result ? JSON.parse(j.result) : undefined,
          error: j.error ?? undefined,
        });
    }
  }

  /** A plan for the screen: as stored, plus how long its job has been running. */
  view(row: PlanRow) {
    const running = row.status === 'thinking' || row.status === 'building';
    const kind = row.status === 'building' ? 'build' : 'think';
    let expectMs: number | null = null;
    if (running) {
      const job = this.d.queue.get((kind === 'build' ? row.buildJob : row.thinkJob) ?? '');
      const provider = job ? (JSON.parse(job.payload) as AskPayload).provider : null;
      const past = provider
        ? this.d.queue
            .asks(provider, nowMs() - 90 * DAY)
            .filter((a) => a.kind === kind && a.status === 'done' && (a.elapsedMs ?? 0) > 0)
        : [];
      expectMs = past.length ? median(past.map((a) => a.elapsedMs!)) : null;
    }
    return {
      ...row,
      elapsedMs: running && row.startedAt ? Math.max(0, nowMs() - row.startedAt) : null,
      expectMs,
    };
  }

  get(id: string) {
    const row = this.d.plans.get(id);
    return row ? this.view(row) : null;
  }

  /** The newest plan still open, for the Memória (no target) or for one neuron's screen. */
  current(target: string | null) {
    const [row] = this.d.plans.active(target);
    return row ? this.view(row) : null;
  }
}
