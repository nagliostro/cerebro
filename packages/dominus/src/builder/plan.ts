import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { nowMs } from '../clock.ts';
import type { Library } from '../research/libraries.ts';
import type { Research } from '../research/record.ts';
import type { Exchange } from './prompts.ts';

// A request to build (or adjust) a neuron, from the first word to the finished neuron. The state
// lives here, not in memory: a core that restarts finds every plan where it was. The plan itself
// comes from an AI as JSON and is checked here, field by field, before the owner ever sees it.

export type PlanStatus =
  /** Looking at the original and what is written about it, before planning (a copy). */
  | 'researching'
  | 'thinking'
  | 'questions'
  | 'ready'
  | 'building'
  | 'built'
  | 'failed'
  | 'rejected'
  | 'canceled'
  /** An adjustment the owner took back: the previous application is in place again. */
  | 'undone';
export const ACTIVE: PlanStatus[] = ['researching', 'thinking', 'questions', 'ready', 'building'];

export type Plan = {
  ready: boolean;
  questions: string[];
  /** Choices for the question, when the research found them (which feature to copy). */
  options: string[];
  name: string;
  role: 'life' | 'craft';
  understood: string;
  creates: { name: string; what: string }[];
  collections: { name: string; fields: string[] }[];
  links: { neuron: string; collection: string; why: string }[];
  checks: string[];
  limits: string[];
  existing: string | null;
  /** Free libraries the neuron will carry, checked on the npm registry (filled by the code). */
  libraries: Library[];
  /** The ones the planner named, before the check. */
  wanted?: { name: string; why: string }[];
};

/** A real thing the Dominus did or is doing, shown as a point around it. Codes, not sentences. */
export type Step =
  | { kind: 'read'; words: number }
  | { kind: 'memory'; neurons: number; similar: string | null }
  | { kind: 'think'; done: boolean; costUsd?: number | null }
  | { kind: 'file'; path: string; done: boolean }
  | { kind: 'check'; files: number; bytes: number }
  | { kind: 'wait'; until: number }
  /** The guide to copying a feature was read, with this install's lessons. */
  | { kind: 'guide'; lessons: number }
  /** The Navegador on one site: how many pages of it so far. */
  | { kind: 'browse'; host: string; pages: number; done: boolean }
  | { kind: 'search'; query: string; done: boolean }
  /** What the research recorded so far. */
  | { kind: 'cases'; count: number; done: boolean }
  | { kind: 'rules'; count: number; done: boolean }
  | { kind: 'findings'; count: number; done: boolean }
  | { kind: 'libraries'; count: number; done: boolean }
  /** The answer key run against the build: how many cases matched. */
  | { kind: 'verify'; passed: number; total: number; done: boolean };

export type Estimate = {
  provider: string | null;
  /** What building should cost (p75 of past builds); null without history. */
  costUsd: number | null;
  verdict: 'fits' | 'tight' | 'wait' | 'unknown' | 'none-ready';
  /** Share of the shortest known window it would use. */
  share: number | null;
  window: string | null;
  until: number | null;
  /** How many past builds the estimate comes from. */
  basis: number;
  /** Typical duration of a build, ms; null without history. */
  durationMs: number | null;
};

export type PlanRow = {
  id: string;
  request: string;
  locale: string;
  target: string | null;
  status: PlanStatus;
  exchanges: Exchange[];
  plan: Plan | null;
  color: string | null;
  estimate: Estimate | null;
  steps: Step[];
  /** What the research found (a copy), for the plan and the build. */
  research: Research | null;
  researchJob: string | null;
  thinkJob: string | null;
  buildJob: string | null;
  thinkCostUsd: number;
  buildCostUsd: number | null;
  neuron: string | null;
  /** It changed an application that existed (so it can be undone), not built a first one. */
  adjusting: boolean;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  /** When the current job started, for the countdown. */
  startedAt: number | null;
};

const COLUMNS = `id, request, locale, target, status, exchanges, plan, color, estimate, steps,
  research, research_job AS researchJob, think_job AS thinkJob, build_job AS buildJob, think_cost AS thinkCostUsd,
  build_cost AS buildCostUsd, neuron, adjusting, error, created_at AS createdAt, updated_at AS updatedAt,
  started_at AS startedAt`;

type Raw = Omit<PlanRow, 'exchanges' | 'plan' | 'estimate' | 'steps' | 'adjusting' | 'research'> & {
  adjusting: number;
  exchanges: string;
  plan: string | null;
  estimate: string | null;
  steps: string;
  research: string | null;
};

const fromRaw = (r: Raw): PlanRow => ({
  ...r,
  exchanges: JSON.parse(r.exchanges),
  plan: r.plan ? { options: [], libraries: [], ...JSON.parse(r.plan) } : null,
  research: r.research ? JSON.parse(r.research) : null,
  estimate: r.estimate ? JSON.parse(r.estimate) : null,
  steps: JSON.parse(r.steps),
  adjusting: !!r.adjusting,
});

export class PlanError extends Error {}

export const MAX_REQUEST = 4000;

export class Plans {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 2000;
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        request TEXT NOT NULL,
        locale TEXT NOT NULL,
        target TEXT,
        status TEXT NOT NULL,
        exchanges TEXT NOT NULL DEFAULT '[]',
        plan TEXT,
        color TEXT,
        estimate TEXT,
        steps TEXT NOT NULL DEFAULT '[]',
        think_job TEXT,
        build_job TEXT,
        think_cost REAL NOT NULL DEFAULT 0,
        build_cost REAL,
        neuron TEXT,
        adjusting INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        started_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS plans_recent ON plans (updated_at);
    `);
    // Columns added after the first version: a database from before gets them here.
    const columns = this.db.prepare(`PRAGMA table_info(plans)`).all() as { name: string }[];
    if (!columns.some((c) => c.name === 'adjusting'))
      this.db.exec(`ALTER TABLE plans ADD COLUMN adjusting INTEGER NOT NULL DEFAULT 0`);
    if (!columns.some((c) => c.name === 'research'))
      this.db.exec(
        `ALTER TABLE plans ADD COLUMN research TEXT; ALTER TABLE plans ADD COLUMN research_job TEXT`,
      );
  }

  close() {
    this.db.close();
  }

  create(request: string, locale: string, target: string | null): string {
    const id = randomUUID();
    const now = nowMs();
    this.db
      .prepare(
        `INSERT INTO plans (id, request, locale, target, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'thinking', ?, ?)`,
      )
      .run(id, request, locale, target, now, now);
    return id;
  }

  get(id: string): PlanRow | null {
    const r = this.db.prepare(`SELECT ${COLUMNS} FROM plans WHERE id = ?`).get(id) as
      Raw | undefined;
    return r ? fromRaw(r) : null;
  }

  byJob(job: string): PlanRow | null {
    const r = this.db
      .prepare(
        `SELECT ${COLUMNS} FROM plans WHERE research_job = ? OR think_job = ? OR build_job = ?`,
      )
      .get(job, job, job) as Raw | undefined;
    return r ? fromRaw(r) : null;
  }

  /** The plans still in the owner's hands or at work, newest first; optionally of one target. */
  active(target?: string | null): PlanRow[] {
    const marks = ACTIVE.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT ${COLUMNS} FROM plans WHERE status IN (${marks})
         ${target === undefined ? '' : target === null ? 'AND target IS NULL' : 'AND target = ?'}
         ORDER BY updated_at DESC`,
      )
      .all(...ACTIVE, ...(typeof target === 'string' ? [target] : [])) as Raw[];
    return rows.map(fromRaw);
  }

  /** Every request, newest first: the history of what the owner did (Settings → Processes). */
  recent(limit = 100): PlanRow[] {
    return (
      this.db
        .prepare(`SELECT ${COLUMNS} FROM plans ORDER BY created_at DESC LIMIT ?`)
        .all(limit) as Raw[]
    ).map(fromRaw);
  }

  /** The plans that built (or adjusted) one neuron, newest first. */
  recentBuilt(neuron: string): PlanRow[] {
    return (
      this.db
        .prepare(
          `SELECT ${COLUMNS} FROM plans WHERE neuron = ? AND status IN ('built', 'undone')
           ORDER BY updated_at DESC LIMIT 5`,
        )
        .all(neuron) as Raw[]
    ).map(fromRaw);
  }

  /** Changes some columns; JSON ones are given as values. */
  update(
    id: string,
    changes: Partial<
      Pick<
        PlanRow,
        | 'status'
        | 'target'
        | 'exchanges'
        | 'plan'
        | 'color'
        | 'estimate'
        | 'steps'
        | 'research'
        | 'researchJob'
        | 'thinkJob'
        | 'buildJob'
        | 'buildCostUsd'
        | 'neuron'
        | 'adjusting'
        | 'error'
        | 'startedAt'
      >
    > & { addThinkCost?: number },
  ) {
    const column: Record<string, string> = {
      status: 'status',
      target: 'target',
      exchanges: 'exchanges',
      plan: 'plan',
      color: 'color',
      estimate: 'estimate',
      steps: 'steps',
      research: 'research',
      researchJob: 'research_job',
      thinkJob: 'think_job',
      buildJob: 'build_job',
      buildCostUsd: 'build_cost',
      neuron: 'neuron',
      adjusting: 'adjusting',
      error: 'error',
      startedAt: 'started_at',
    };
    const json = new Set(['exchanges', 'plan', 'estimate', 'steps', 'research']);
    const sets: string[] = [];
    const values: (string | number | null)[] = [];
    for (const [k, v] of Object.entries(changes)) {
      if (k === 'addThinkCost') {
        sets.push('think_cost = think_cost + ?');
        values.push(v as number);
      } else if (column[k]) {
        sets.push(`${column[k]} = ?`);
        values.push(
          json.has(k)
            ? v === null
              ? null
              : JSON.stringify(v)
            : typeof v === 'boolean'
              ? Number(v)
              : (v as never),
        );
      }
    }
    sets.push('updated_at = ?');
    values.push(nowMs());
    this.db.prepare(`UPDATE plans SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
  }
}

// ---- The plan from the AI: one JSON object, checked and trimmed. ----

const NAME = /^[a-z][a-z0-9_-]{0,31}$/;
const text = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '';
const texts = (v: unknown, max: number, each: number) =>
  (Array.isArray(v) ? v : [])
    .map((x) => text(x, each))
    .filter(Boolean)
    .slice(0, max);

/** The first JSON object in the answer (models sometimes wrap it in a code fence). */
export function extractJson(answer: string): unknown {
  const start = answer.indexOf('{');
  const end = answer.lastIndexOf('}');
  if (start < 0 || end <= start) throw new PlanError('no JSON in the answer');
  try {
    return JSON.parse(answer.slice(start, end + 1));
  } catch {
    throw new PlanError('the JSON does not parse');
  }
}

/**
 * Checks a plan against what exists: links only to existing neurons, "existing" only a real one.
 * Throws PlanError when it cannot be used at all.
 */
export function parsePlan(answer: string, known: Set<string>): Plan {
  const raw = extractJson(answer) as Record<string, unknown>;
  if (!raw || typeof raw !== 'object') throw new PlanError('not an object');
  const questions = texts(raw.questions, 3, 300);
  const ready = raw.ready !== false || !questions.length;
  const name = text(raw.name, 24);
  const plan: Plan = {
    ready,
    questions: ready ? [] : questions,
    options: [],
    name,
    role: raw.role === 'craft' ? 'craft' : 'life',
    understood: text(raw.understood, 600),
    creates: (Array.isArray(raw.creates) ? raw.creates : [])
      .map((c: { name?: unknown; what?: unknown }) => ({
        name: text(c?.name, 40),
        what: text(c?.what, 300),
      }))
      .filter((c) => c.name)
      .slice(0, 6),
    collections: (Array.isArray(raw.collections) ? raw.collections : [])
      .map((c: { name?: unknown; fields?: unknown }) => ({
        name: text(c?.name, 32).toLowerCase(),
        fields: texts(c?.fields, 16, 32),
      }))
      .filter((c) => NAME.test(c.name))
      .slice(0, 6),
    links: (Array.isArray(raw.links) ? raw.links : [])
      .map((l: { neuron?: unknown; collection?: unknown; why?: unknown }) => ({
        neuron: text(l?.neuron, 40),
        collection: text(l?.collection, 32),
        why: text(l?.why, 200),
      }))
      .filter((l) => known.has(l.neuron) && NAME.test(l.collection))
      .slice(0, 3),
    checks: texts(raw.checks, 5, 200),
    limits: texts(raw.limits, 3, 200),
    existing: typeof raw.existing === 'string' && known.has(raw.existing) ? raw.existing : null,
    libraries: [],
    wanted: (Array.isArray(raw.libraries) ? raw.libraries : [])
      .map((l: { name?: unknown; why?: unknown }) => ({
        name: text(l?.name, 214),
        why: text(l?.why, 200),
      }))
      .filter((l) => l.name)
      .slice(0, 5),
  };
  // "An existing neuron already does this" is an answer of its own: nothing new to create.
  if (ready && !plan.existing && (!plan.name || !plan.creates.length))
    throw new PlanError('a ready plan needs a name and what it creates');
  return plan;
}
