import { existsSync } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { median, nowMs } from '../clock.ts';
import type { Contracts } from '../contract.ts';
import { colorOf, DOMINUS_ID, type Graph } from '../graph.ts';
import { listFiles, readText } from '../providers/file-tools.ts';
import type { AskEvent } from '../providers/types.ts';
import { buildEstimate, guard, type GuardWindow } from '../quota/guard.ts';
import type { Queue } from '../queue.ts';
import { readGuide, researchDir } from '../research/guide.ts';
import { checkLibrary, vendorLibrary, vendorPath, type Library } from '../research/libraries.ts';
import { readResearch, writeResearch, type Research } from '../research/record.ts';
import { DEPTH_PAGES, readSettings } from '../settings.ts';
import type { CheckResult } from '../browser/checks.ts';
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
  fixLines,
  PLAN_SYSTEM,
  planPrompt,
  researchPrompt,
  researchSystem,
  type NeuronSummary,
} from './prompts.ts';

// The Builder: a request becomes a plan (text mode, cheap), an accepted plan becomes a neuron
// (agent mode, files only, in a draft folder). A request to copy a feature (it has a link) is
// researched first (agent mode, research tools only): the original, what is written about it,
// and an answer key that goes with the plan. The core never waits for either: it enqueues the
// job and reacts to its events. Every point the screen shows comes from a step recorded here.

const BUILD_MAX_MS = 45 * 60_000;
const THINK_MAX_MS = 5 * 60_000;
const RESEARCH_MAX_MS = 20 * 60_000;
const CHECK_MAX_MS = 3 * 60_000;
/** The Navegador, a craft neuron that comes with the Cerebro: born with the first research. */
export const NAVEGADOR = 'navegador';
const NAVEGADOR_APP = path.join(import.meta.dirname, '..', '..', 'factory', 'navegador');
const NAVEGADOR_HUE = 235;
/** Rounds of fixing a build whose answer key fails, before it is installed with its gaps. */
const FIX_ROUNDS = 2;

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
  /** A job that is not an ask (the answer key check). */
  enqueueJob: (
    type: string,
    payload: unknown,
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
/** The link of what to copy, if the request has one. */
export const cloneSource = (request: string) => request.match(/https?:\/\/[^\s<>"']+/)?.[0] ?? null;
/** A plan that asks, with nothing else in it yet (the research's question). */
const asking = (question: { text: string; options: string[] }) => ({
  libraries: [],
  ready: false,
  questions: [question.text],
  options: question.options,
  name: '',
  role: 'life' as const,
  understood: '',
  creates: [],
  collections: [],
  links: [],
  checks: [],
  limits: [],
  existing: null,
});
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
      built: existsSync(path.join(appDir(this.d.dataDir, n.id), 'index.html')),
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
    // A copy (a link to the original), new or into an existing neuron: researched first.
    if (cloneSource(request)) {
      await this.ensureNavegador();
      const guide = await readGuide(this.d.dataDir);
      this.d.plans.update(id, { steps: [...steps, { kind: 'guide', lessons: guide.lessons }] });
      await this.research(id, guide.text);
      return id;
    }
    this.d.plans.update(id, { steps });
    await this.think(id);
    return id;
  }

  /** The Navegador joins the Memória the first time a research needs it, with its application. */
  private async ensureNavegador() {
    if (this.d.graph.neuron(NAVEGADOR)) return;
    const id = this.d.graph.addNeuron({ name: 'Navegador', role: 'craft', hue: NAVEGADOR_HUE });
    await cp(NAVEGADOR_APP, appDir(this.d.dataDir, id), { recursive: true });
    this.d.graph.recordConversation(DOMINUS_ID, id);
    this.d.emit('graph.changed', {});
  }

  /** Looks at the original and what is written about it (again, after the owner answered). */
  private async research(id: string, guide?: string) {
    const row = this.d.plans.get(id)!;
    const dir = researchDir(this.d.dataDir, id);
    await mkdir(dir, { recursive: true });
    // The question answered: the research goes on from what it had, without the question.
    const before = await readResearch(dir);
    if (before.question) await writeResearch(dir, { ...before, question: null });
    try {
      const job = await this.d.enqueueAsk(
        {
          provider: 'auto',
          role: 'balanced',
          mode: 'agent',
          access: 'research',
          cwd: dir,
          kind: 'research',
          locale: row.locale === 'pt-BR' ? 'pt-BR' : 'en-US',
          // As far as the owner's depth (Settings → General) lets it go.
          maxPages: DEPTH_PAGES[readSettings(this.d.dataDir).depth],
          system: researchSystem(guide ?? (await readGuide(this.d.dataDir)).text),
          prompt: researchPrompt({
            request: row.request,
            locale: row.locale,
            exchanges: row.exchanges,
          }),
        },
        { maxMs: RESEARCH_MAX_MS, maxAttempts: 1 },
      );
      this.d.plans.update(id, {
        status: 'researching',
        researchJob: job,
        error: null,
        startedAt: nowMs(),
      });
    } catch (e) {
      this.d.plans.update(id, { status: 'failed', error: (e as Error).message });
    }
    this.changed(id);
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
            research: row.research,
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
    // The research asked (which feature): it goes on with the answer before any plan.
    if (row.status === 'questions' && row.research?.question) await this.research(id);
    else await this.think(id);
  }

  async accept(id: string, body: { improvements?: unknown } = {}) {
    const row = this.mustGet(id);
    // Which of the improvements the research found the owner chose (by their order).
    const found = row.research?.improvements.length ?? 0;
    const improvements = (Array.isArray(body.improvements) ? body.improvements : []).filter(
      (i): i is number => Number.isInteger(i) && i >= 0 && i < found,
    );
    if (row.status !== 'ready' || !row.plan?.ready) throw new BuildError('no plan to build');
    const target = row.target ? this.d.graph.neuron(row.target) : null;
    if (row.target && !target) throw new BuildError('unknown neuron');
    const color = target?.color ?? colorOf(this.d.graph.suggestHue());
    // Adjusting only when there is an application to change; otherwise its first one is built.
    const hasApp =
      !!target && !!(await listFiles(appDir(this.d.dataDir, target.id)).catch(() => [])).length;
    const draft = await makeDraft(this.d.dataDir, id, hasApp ? row.target! : undefined);
    // The free libraries go into the folder before the Builder starts: downloaded from the
    // registry and checked against its integrity hash. One that fails is left out.
    const libraries: {
      name: string;
      version: string;
      license: string;
      path: string;
      why: string;
    }[] = [];
    for (const lib of row.plan.libraries ?? [])
      try {
        libraries.push({ ...lib, path: await vendorLibrary(draft, lib) });
      } catch {
        // Not carried; the Builder works without it.
      }
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
            research: row.research,
            improvements,
            libraries,
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
      row.status === 'researching'
        ? row.researchJob
        : row.status === 'thinking'
          ? row.thinkJob
          : row.status === 'building'
            ? row.buildJob
            : null;
    if (!job) {
      if (row.status !== 'researching' && row.status !== 'thinking' && row.status !== 'building')
        throw new BuildError('nothing running');
      // Running without a job (it never reached the queue): stopping just closes it.
      this.d.plans.update(id, { status: 'canceled' });
      this.changed(id);
      return;
    }
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
    if (e.type !== 'tool') return;
    const row = this.d.plans.byJob(job);
    if (row?.status === 'researching' && row.researchJob === job)
      return this.researchProgress(row, e);
    if (e.action !== 'write' || !e.target) return;
    if (!row || row.status !== 'building') return;
    const steps = row.steps.map((s) =>
      s.kind === 'file' && s.path !== e.target ? { ...s, done: true } : s,
    );
    if (!steps.some((s) => s.kind === 'file' && s.path === e.target))
      steps.push({ kind: 'file', path: e.target, done: false });
    this.d.plans.update(row.id, { steps });
    this.changed(row.id);
  }

  /** A research's steps: each site the Navegador is on, each search, and the counts recorded. */
  private researchProgress(row: PlanRow, e: Extract<AskEvent, { type: 'tool' }>) {
    const RECORDED = {
      case: 'cases',
      rule: 'rules',
      finding: 'findings',
      library: 'libraries',
    } as const;
    let steps = row.steps;
    // Only one thing at a time is going on: what came before is done.
    const rest = () =>
      steps.map((s) => (s.kind === 'browse' || s.kind === 'search' ? { ...s, done: true } : s));
    if (e.action === 'browse' && e.target) {
      const host = e.target;
      const on = steps.find((s) => s.kind === 'browse' && s.host === host);
      steps = on
        ? rest().map((s) =>
            s.kind === 'browse' && s.host === host ? { ...s, pages: s.pages + 1, done: false } : s,
          )
        : [...rest(), { kind: 'browse', host, pages: 1, done: false }];
    } else if (e.action === 'search' && e.target)
      steps = [...rest(), { kind: 'search', query: e.target, done: false }];
    else if (e.action === 'record' && e.target && e.target in RECORDED) {
      const kind = RECORDED[e.target as keyof typeof RECORDED];
      steps = steps.some((s) => s.kind === kind)
        ? steps.map((s) => (s.kind === kind ? { ...s, count: s.count + 1 } : s))
        : [...steps, { kind, count: 1, done: false }];
    } else return;
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
    if (row.researchJob === job && row.status === 'researching')
      await this.researched(row, status, result, data.error);
    else if (row.thinkJob === job && row.status === 'thinking')
      await this.thought(row, status, result, data.error);
    else if (row.buildJob === job && row.status === 'building') {
      const last = row.steps.at(-1);
      if (last?.kind === 'verify' && !last.done) await this.checked(row, status, data);
      else await this.built(row, status, result, data.error);
    }
    this.changed(row.id);
  }

  private async researched(
    row: PlanRow,
    status: 'done' | 'failed' | 'canceled',
    result: { costUsd?: number | null } | undefined,
    error?: string,
  ) {
    const cost = result?.costUsd ?? 0;
    const steps = row.steps.map((s) => ('done' in s ? { ...s, done: true } : s)) as Step[];
    if (status !== 'done') {
      this.d.plans.update(row.id, {
        status: status === 'canceled' ? 'canceled' : 'failed',
        error: error ?? null,
        steps,
        addThinkCost: cost,
      });
      return;
    }
    const research: Research = await readResearch(researchDir(this.d.dataDir, row.id));
    if (research.question) {
      this.d.plans.update(row.id, {
        status: 'questions',
        research,
        plan: asking(research.question),
        steps,
        addThinkCost: cost,
      });
      return;
    }
    this.d.plans.update(row.id, { research, steps, addThinkCost: cost });
    // The Navegador keeps what it did (its application lists it); it and the Dominus talked.
    if (this.d.graph.neuron(NAVEGADOR)) {
      this.d.contracts.run(NAVEGADOR, 'researches', 'create', {
        data: {
          feature: research.feature || row.request.slice(0, 80),
          target: research.target || cloneSource(row.request) || '',
          cases: research.cases.length,
          rules: research.rules.length,
          sites: research.sites.map((site) => site.host).slice(0, 20),
          plan: row.id,
          date: new Date(nowMs()).toISOString().slice(0, 10),
        },
      });
      this.d.graph.recordConversation(DOMINUS_ID, NAVEGADOR);
    }
    await this.think(row.id);
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
      // A plan for a neuron that is already in the Memória with no application yet (pointed
      // at, or with the same name) builds that one's first application, never a twin.
      if (!row.target && plan.ready && plan.creates.length) {
        const sameName = this.d.graph
          .view()
          .neurons.find((n) => normalize(n.name) === normalize(plan.name))?.id;
        const place = [plan.existing, sameName].find(
          (id): id is string =>
            !!id && !existsSync(path.join(appDir(this.d.dataDir, id), 'index.html')),
        );
        if (place) {
          row.target = place;
          this.d.plans.update(row.id, { target: place });
        }
      }
      const target = row.target ? this.d.graph.neuron(row.target) : null;
      if (target) {
        plan.name = target.name;
        plan.role = target.role;
        plan.existing = null;
      }
      plan.libraries = await this.libraries(plan.wanted ?? [], row.research?.libraries ?? []);
      delete plan.wanted;
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
    // Each round of a copy adds its cost.
    const cost =
      result?.costUsd === null || result?.costUsd === undefined
        ? row.buildCostUsd
        : (row.buildCostUsd ?? 0) + result.costUsd;
    // A copy is checked against its answer key before it can become a neuron.
    if (row.research?.cases.length) {
      const draft = draftDir(this.d.dataDir, row.id);
      try {
        const job = await this.d.enqueueJob(
          'checks',
          { dir: draft, cases: row.research.cases },
          { maxMs: CHECK_MAX_MS, maxAttempts: 1 },
        );
        this.d.plans.update(row.id, {
          buildJob: job,
          buildCostUsd: cost,
          steps: [
            ...files,
            { kind: 'verify', passed: 0, total: row.research.cases.length, done: false },
          ],
        });
        return;
      } catch {
        // No check could start: it is installed, and the plan says it was not checked.
      }
    }
    await this.install(row, files, cost);
  }

  /**
   * The libraries a plan carries: the research's (already checked) and the planner's, each one
   * checked on the registry now. One that does not pass is dropped, never carried unchecked.
   */
  private async libraries(wanted: { name: string; why: string }[], found: Library[]) {
    const out = [...found];
    const checked = await Promise.all(
      wanted
        .filter((w) => !out.some((l) => l.name === w.name.toLowerCase()))
        .map((w) => checkLibrary(w.name, w.why).catch(() => null)),
    );
    for (const l of checked) if (l && !out.some((x) => x.name === l.name)) out.push(l);
    return out.slice(0, 5);
  }

  /**
   * Removes a neuron for good (Settings → Neurons): its open plans close, and it leaves the graph
   * with its conversations and links, its data and permissions, and its application's folder.
   */
  async remove(id: string) {
    if (id === DOMINUS_ID || !this.d.graph.neuron(id)) throw new BuildError('unknown neuron');
    for (const row of this.d.plans.active(id)) {
      const job =
        row.status === 'researching'
          ? row.researchJob
          : row.status === 'thinking'
            ? row.thinkJob
            : row.status === 'building'
              ? row.buildJob
              : null;
      if (job) this.d.cancelJob(job);
      this.d.plans.update(row.id, { status: 'rejected' });
      this.changed(row.id);
    }
    this.d.graph.removeNeuron(id);
    this.d.contracts.forget(id);
    await rm(path.join(this.d.dataDir, 'neurons', id), { recursive: true, force: true });
    this.d.emit('graph.changed', {});
  }

  /** The answer key ran: all match, or another round for the Builder, or installed with gaps. */
  private async checked(
    row: PlanRow,
    status: 'done' | 'failed' | 'canceled',
    data: { result?: unknown; error?: string },
  ) {
    if (status === 'canceled') {
      await dropDraft(this.d.dataDir, row.id);
      this.d.plans.update(row.id, { status: 'canceled', error: data.error ?? null });
      return;
    }
    const r: CheckResult =
      status === 'done' && data.result
        ? (data.result as CheckResult)
        : {
            passed: 0,
            total: row.research!.cases.length,
            failed: [],
            error: data.error ?? 'the check failed',
          };
    const steps = row.steps.map((s, i) =>
      i === row.steps.length - 1 && s.kind === 'verify'
        ? { ...s, passed: r.passed, done: true }
        : s,
    ) as Step[];
    const rounds = steps.filter((s) => s.kind === 'verify').length;
    if ((r.failed.length || r.error) && rounds <= FIX_ROUNDS) {
      const target = row.target ? this.d.graph.neuron(row.target) : null;
      try {
        const job = await this.d.enqueueAsk(
          {
            provider: 'auto',
            role: 'balanced',
            mode: 'agent',
            access: 'files',
            cwd: draftDir(this.d.dataDir, row.id),
            kind: 'build',
            system: BUILD_SYSTEM,
            prompt: [
              buildPrompt({
                locale: row.locale,
                color: row.color ?? 'white',
                plan: target ? { ...row.plan!, name: target.name } : row.plan!,
                request: row.request,
                adjusting: true,
                research: row.research,
                libraries: (row.plan!.libraries ?? []).map((l) => ({ ...l, path: vendorPath(l) })),
              }),
              ...fixLines(r),
            ].join('\n'),
          },
          { maxMs: BUILD_MAX_MS, maxAttempts: 1 },
        );
        this.d.plans.update(row.id, { buildJob: job, steps });
        return;
      } catch {
        // No AI for another round: installed as it is, with what still fails said.
      }
    }
    await this.install(row, steps, row.buildCostUsd, r);
  }

  /** The draft passed (or ran out of rounds): it becomes the neuron. */
  private async install(row: PlanRow, files: Step[], cost: number | null, check?: CheckResult) {
    const draft = draftDir(this.d.dataDir, row.id);
    try {
      const check_ = await checkDraft(draft);
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
      // A copy keeps its research and answer key (every adjustment is checked again), with what
      // still did not match said as gaps.
      let research = row.research;
      if (research) {
        const still = (check?.failed ?? []).map(
          (f) =>
            `case ${f.n}: ${JSON.stringify(f.input)} → ${JSON.stringify(f.expected)}, gave ${f.got}`,
        );
        if (check?.error) still.push(`not checked: ${check.error}`);
        research = { ...research, gaps: [...research.gaps, ...still] };
        await writeResearch(path.join(this.d.dataDir, 'neurons', id), research);
      }
      this.d.plans.update(row.id, {
        status: 'built',
        neuron: id,
        steps: [...files, { kind: 'check', files: check_.files, bytes: check_.bytes }],
        buildCostUsd: cost,
        ...(research ? { research } : {}),
      });
      this.d.emit('graph.changed', {});
    } catch (e) {
      await dropDraft(this.d.dataDir, row.id);
      const why = e instanceof BuildCheckError ? `bad-build: ${e.message}` : (e as Error).message;
      this.d.plans.update(row.id, {
        status: 'failed',
        error: why,
        steps: files,
        buildCostUsd: cost,
      });
    }
  }

  /** On start: a plan whose job ended while the core was away moves on now. */
  async reconcile() {
    for (const row of this.d.plans.active()) {
      if (row.status !== 'researching' && row.status !== 'thinking' && row.status !== 'building')
        continue;
      const job =
        row.status === 'researching'
          ? row.researchJob
          : row.status === 'thinking'
            ? row.thinkJob
            : row.buildJob;
      if (!job) {
        // Its job never made it to the queue (the core failed in between): it cannot go on.
        this.d.plans.update(row.id, { status: 'failed', error: 'job lost' });
        continue;
      }
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
    const running =
      row.status === 'researching' || row.status === 'thinking' || row.status === 'building';
    const kind =
      row.status === 'building' ? 'build' : row.status === 'researching' ? 'research' : 'think';
    let expectMs: number | null = null;
    if (running) {
      const job = this.d.queue.get(
        (kind === 'build' ? row.buildJob : kind === 'research' ? row.researchJob : row.thinkJob) ??
          '',
      );
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

  /**
   * The history of requests, each as its way through the stages: what was asked and answered,
   * the research, the plan, the build and how it ended. Counts and names, never the prompts.
   */
  history(limit = 100) {
    return this.d.plans.recent(limit).map((row) => {
      const r = row.research;
      const files = row.steps.filter((s) => s.kind === 'file').length;
      const verify = row.steps.findLast((s) => s.kind === 'verify');
      return {
        id: row.id,
        request: row.request,
        status: row.status,
        target: row.target,
        neuron: row.neuron,
        adjusting: row.adjusting,
        exchanges: row.exchanges,
        error: row.error,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        thinkCostUsd: row.thinkCostUsd,
        buildCostUsd: row.buildCostUsd,
        research: r
          ? {
              feature: r.feature,
              target: r.target,
              sites: r.sites.length,
              pages: r.sites.reduce((n, s) => n + s.pages, 0),
              cases: r.cases.length,
              rules: r.rules.length,
              libraries: r.libraries.map((l) => l.name),
              gaps: r.gaps.length,
            }
          : null,
        plan: row.plan?.ready
          ? {
              name: row.plan.name,
              role: row.plan.role,
              understood: row.plan.understood,
              creates: row.plan.creates.map((c) => c.name),
              libraries: (row.plan.libraries ?? []).map((l) => l.name),
            }
          : null,
        build:
          row.buildJob || files
            ? {
                files,
                verified:
                  verify && 'passed' in verify
                    ? { passed: verify.passed, total: verify.total }
                    : null,
              }
            : null,
      };
    });
  }

  /** The newest plan still open: any, for the Memória; that neuron's, for its screen. */
  current(target: string | null) {
    // The Memória is where the Dominus speaks of everything: any open plan shows there.
    const [row] = this.d.plans.active(target ?? undefined);
    return row ? this.view(row) : null;
  }
}
