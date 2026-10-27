import { DatabaseSync } from 'node:sqlite';

import { median, nowMs } from '../clock.ts';
import type { ModelRole } from '../providers/types.ts';

// The tuning of the Dominus: the values of how it thinks and builds (which model, how hard it
// thinks, how much code it reads), a little different for some new neurons, and what each set of
// values got: the tokens it spent, the owner's yes or no, an undo, a rating. Pure code, no AI, so
// tuning never costs a token. A set that solves as well with fewer tokens, or better with the
// same, takes the champion's place; one that does worse is retired. Every step runs on an event
// (a request for a new neuron, a plan that moves, a rating), never on a timer.

export type Effort = 'low' | 'medium' | 'high';
export type Rating = 'bad' | 'fair' | 'good';
export const RATINGS: readonly Rating[] = ['bad', 'fair', 'good'];

type Choice<T> = { kind: 'choice'; options: readonly T[]; initial: T };
type Amount = { kind: 'amount'; min: number; max: number; initial: number; factor: number };
/** live: used today, so it is varied; the rest wait for the phase that will use them. */
type Knob = (Choice<ModelRole> | Choice<Effort> | Amount) & { live: boolean; about: string };

const EFFORTS = ['low', 'medium', 'high'] as const;

/** The values the tuning varies, each within limits it never leaves. */
export const KNOBS = {
  // A cheap model that thinks more cost up to 6x more (E4): planning starts at balanced too.
  thinkRole: {
    kind: 'choice',
    options: ['balanced', 'strong'],
    initial: 'balanced',
    live: true,
    about: 'model that plans',
  },
  thinkEffort: {
    kind: 'choice',
    options: EFFORTS,
    initial: 'medium',
    live: true,
    about: 'how hard the planner thinks',
  },
  planCode: {
    kind: 'amount',
    min: 16_000,
    max: 96_000,
    initial: 48_000,
    factor: 1.25,
    live: true,
    about: "characters of a neuron's code the planner reads to adjust it",
  },
  // A cheap model builds badly: building starts at balanced.
  buildRole: {
    kind: 'choice',
    options: ['balanced', 'strong'],
    initial: 'balanced',
    live: true,
    about: 'model that builds',
  },
  buildEffort: {
    kind: 'choice',
    options: EFFORTS,
    initial: 'medium',
    live: true,
    about: 'how hard the builder thinks',
  },
  // The neuron's own conversation (phases 2 to 4): kept here, varied once they are used.
  mapTokens: {
    kind: 'amount',
    min: 1_500,
    max: 6_000,
    initial: 3_000,
    factor: 1.25,
    live: false,
    about: "size of the neuron's map",
  },
  recentTurns: {
    kind: 'amount',
    min: 2,
    max: 12,
    initial: 6,
    factor: 1.34,
    live: false,
    about: 'turns of the conversation kept word for word',
  },
  readsReader: {
    kind: 'amount',
    min: 3,
    max: 20,
    initial: 8,
    factor: 1.34,
    live: false,
    about: 'files the reader step may open',
  },
  readsDeep: {
    kind: 'amount',
    min: 8,
    max: 40,
    initial: 20,
    factor: 1.34,
    live: false,
    about: 'files the deep step may open',
  },
} satisfies Record<string, Knob>;

export type KnobName = keyof typeof KNOBS;
export type Knobs = {
  thinkRole: ModelRole;
  thinkEffort: Effort;
  planCode: number;
  buildRole: ModelRole;
  buildEffort: Effort;
  mapTokens: number;
  recentTurns: number;
  readsReader: number;
  readsDeep: number;
};

const INITIAL = Object.fromEntries(
  Object.entries(KNOBS).map(([k, v]) => [k, v.initial]),
) as Knobs;

/** Stored values, with any knob added since then at its initial value and every one in limits. */
function complete(raw: Partial<Record<string, unknown>>): Knobs {
  const out = { ...INITIAL } as Record<string, unknown>;
  for (const [name, knob] of Object.entries(KNOBS) as [KnobName, Knob][]) {
    const v = raw[name];
    if (knob.kind === 'choice' && (knob.options as readonly unknown[]).includes(v)) out[name] = v;
    else if (knob.kind === 'amount' && typeof v === 'number' && v >= knob.min && v <= knob.max)
      out[name] = v;
  }
  return out as Knobs;
}

/** One step of one live knob, up or down, never past its limits. */
export function mutate(from: Knobs, random: () => number): { knobs: Knobs; changed: KnobName } {
  const live = (Object.keys(KNOBS) as KnobName[]).filter((k) => KNOBS[k].live);
  const changed = live[Math.floor(random() * live.length)]!;
  const knob = KNOBS[changed] as Knob;
  const up = random() < 0.5;
  const next = { ...from } as Record<string, unknown>;
  if (knob.kind === 'choice') {
    const options = knob.options as readonly string[];
    const at = options.indexOf(from[changed] as string);
    // At an end, the only step there is.
    const to = at <= 0 ? 1 : at >= options.length - 1 ? at - 1 : up ? at + 1 : at - 1;
    next[changed] = options[to];
  } else {
    const v = from[changed] as number;
    const stepped = up ? v * knob.factor : v / knob.factor;
    let to = Math.round(Math.min(knob.max, Math.max(knob.min, stepped)));
    if (to === v) to = Math.round(up ? v / knob.factor : v * knob.factor);
    next[changed] = Math.min(knob.max, Math.max(knob.min, to));
  }
  return { knobs: next as Knobs, changed };
}

// ---- The score: quality first, tokens second. ----

/** What the owner said, in a number; their rating, when there is one, is worth more than the rest. */
const RATED: Record<Rating, number> = { bad: 0, fair: 0.6, good: 1 };
const OUTCOME: Record<string, number> = { built: 0.75, undone: 0.2, rejected: 0.2, failed: 0 };
/** Each owner answer or change past the first costs a little: the plan should have understood. */
const ROUND_COST = 0.05;
/** Half the spending for the same result is worth this much (and twice the spending costs it). */
const SPEND_WEIGHT = 0.1;

export type Outcome = 'built' | 'undone' | 'rejected' | 'failed';

/**
 * spent: what the request cost, in the measure of `reference` (US$ when the provider says it,
 * otherwise tokens with the cached ones at a tenth).
 */
export function score(
  r: { outcome: Outcome; rating: Rating | null; rounds: number; checks: number | null; spent: number },
  reference: number | null,
): number {
  let quality = r.rating ? RATED[r.rating] : OUTCOME[r.outcome]!;
  // A copy that matched only part of its answer key was only partly right.
  if (!r.rating && r.outcome === 'built' && r.checks !== null) quality *= 0.5 + 0.5 * r.checks;
  quality -= Math.min(0.2, ROUND_COST * Math.max(0, r.rounds - 1));
  if (!reference || !r.spent) return quality;
  return quality + Math.max(-0.3, Math.min(0.3, -SPEND_WEIGHT * Math.log2(r.spent / reference)));
}

// ---- The tables and the events. ----

/**
 * Results a trial needs before it is judged, and the most it gets to prove itself. Five, because
 * one hard request weighs more than the difference between two variants.
 */
const MIN_RESULTS = 5;
const MAX_RESULTS = 10;
/** Results of the champion of the same kind (new, adjust) a comparison needs. */
const MIN_COMPARED = 2;
/** How much better (or worse) a trial must be to replace the champion (or to be retired). */
const MARGIN = 0.05;
/** Trials running at once, and the share of new neurons that try one. */
const MAX_TRIALS = 2;
const EXPLORE = 0.5;
/** The champion's latest results that it is compared by. */
const CHAMPION_WINDOW = 20;

type VariantRow = {
  id: number;
  knobs: string;
  parent: number | null;
  changed: string | null;
  status: 'champion' | 'trial' | 'retired';
  createdAt: number;
};
type ResultRow = {
  plan: string;
  variant: number;
  neuron: string | null;
  kind: 'new' | 'adjust';
  tokens: number;
  costUsd: number;
  outcome: Outcome | null;
  rounds: number;
  checks: number | null;
  rating: Rating | null;
  score: number | null;
};

const RESULT = `plan, variant, neuron, kind, tokens, cost AS costUsd, outcome, rounds, checks, rating,
  score`;

export class Tuner {
  private db: DatabaseSync;
  private random: () => number;

  constructor(path: string, random: () => number = Math.random) {
    this.random = random;
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 2000;
      CREATE TABLE IF NOT EXISTS tuning_variants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        knobs TEXT NOT NULL,
        parent INTEGER,
        changed TEXT,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tuning_results (
        plan TEXT PRIMARY KEY,
        variant INTEGER NOT NULL,
        neuron TEXT,
        kind TEXT NOT NULL,
        tokens INTEGER NOT NULL DEFAULT 0,
        cost REAL NOT NULL DEFAULT 0,
        outcome TEXT,
        rounds INTEGER NOT NULL DEFAULT 0,
        checks REAL,
        rating TEXT,
        score REAL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS tuning_results_variant ON tuning_results (variant, updated_at);
      CREATE TABLE IF NOT EXISTS tuning_neurons (
        neuron TEXT PRIMARY KEY,
        variant INTEGER NOT NULL
      );
    `);
    if (!this.champion())
      this.db
        .prepare(
          `INSERT INTO tuning_variants (knobs, status, created_at) VALUES (?, 'champion', ?)`,
        )
        .run(JSON.stringify(INITIAL), nowMs());
  }

  close() {
    this.db.close();
  }

  private variant(id: number): VariantRow | null {
    return (
      (this.db
        .prepare(
          `SELECT id, knobs, parent, changed, status, created_at AS createdAt
           FROM tuning_variants WHERE id = ?`,
        )
        .get(id) as VariantRow | undefined) ?? null
    );
  }

  private champion(): VariantRow | null {
    return (
      (this.db
        .prepare(
          `SELECT id, knobs, parent, changed, status, created_at AS createdAt
           FROM tuning_variants WHERE status = 'champion'`,
        )
        .get() as VariantRow | undefined) ?? null
    );
  }

  private trials(): VariantRow[] {
    return this.db
      .prepare(
        `SELECT id, knobs, parent, changed, status, created_at AS createdAt
         FROM tuning_variants WHERE status = 'trial' ORDER BY id`,
      )
      .all() as VariantRow[];
  }

  private result(plan: string): ResultRow | null {
    return (
      (this.db.prepare(`SELECT ${RESULT} FROM tuning_results WHERE plan = ?`).get(plan) as
        | ResultRow
        | undefined) ?? null
    );
  }

  private scored(variant: number, limit = 1000): ResultRow[] {
    return this.db
      .prepare(
        `SELECT ${RESULT} FROM tuning_results WHERE variant = ? AND score IS NOT NULL
         ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(variant, limit) as ResultRow[];
  }

  /**
   * Event: a request entered. A new neuron sometimes tries a variant (half of them, while there is
   * room); an adjustment keeps the values its neuron was born with, while they are still in play.
   */
  assign(plan: string, target: string | null) {
    const champion = this.champion()!;
    let variant = champion.id;
    if (target) {
      const born = this.db
        .prepare(`SELECT variant FROM tuning_neurons WHERE neuron = ?`)
        .get(target) as { variant: number } | undefined;
      const still = born && this.variant(born.variant);
      if (still && still.status !== 'retired') variant = still.id;
    } else if (this.random() < EXPLORE) {
      // The trial that has the fewest results first, so each one is judged sooner.
      const open = this.trials()
        .map((t) => ({ t, n: this.scored(t.id).length }))
        .sort((a, b) => a.n - b.n);
      if (open.length && (open.length >= MAX_TRIALS || open[0]!.n < MIN_RESULTS))
        variant = open[0]!.t.id;
      else {
        const { knobs, changed } = mutate(complete(JSON.parse(champion.knobs)), this.random);
        variant = Number(
          this.db
            .prepare(
              `INSERT INTO tuning_variants (knobs, parent, changed, status, created_at)
               VALUES (?, ?, ?, 'trial', ?)`,
            )
            .run(JSON.stringify(knobs), champion.id, changed, nowMs()).lastInsertRowid,
        );
      }
    }
    const now = nowMs();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO tuning_results (plan, variant, kind, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(plan, variant, target ? 'adjust' : 'new', now, now);
  }

  /** The values a plan runs with: its variant's, or the champion's (a plan the tuning skipped). */
  knobs(plan: string): Knobs {
    const r = this.result(plan);
    const v = (r && this.variant(r.variant)) ?? this.champion()!;
    return complete(JSON.parse(v.knobs));
  }

  /** Event: a job of the plan ended. What it spent adds up. */
  spent(plan: string, tokens: number, costUsd: number) {
    if (!tokens && !costUsd) return;
    this.db
      .prepare(
        `UPDATE tuning_results SET tokens = tokens + ?, cost = cost + ?, updated_at = ?
         WHERE plan = ?`,
      )
      .run(Math.max(0, Math.round(tokens)), Math.max(0, costUsd), nowMs(), plan);
  }

  /**
   * Event: the plan moved. Once it ends (built, rejected, failed, undone), it gets its score and
   * its variant is judged. A new neuron keeps the variant it was born with.
   */
  observe(plan: {
    id: string;
    status: string;
    neuron: string | null;
    rounds: number;
    checks: number | null;
  }) {
    const r = this.result(plan.id);
    if (!r) return;
    if (plan.neuron && r.kind === 'new' && !r.neuron)
      this.db
        .prepare(`INSERT OR REPLACE INTO tuning_neurons (neuron, variant) VALUES (?, ?)`)
        .run(plan.neuron, r.variant);
    const outcome = (['built', 'undone', 'rejected', 'failed'] as const).find(
      (s) => s === plan.status,
    );
    // Canceled is the owner's choice, not the values': it counts for nothing.
    if (!outcome) return;
    this.settle({ ...r, neuron: plan.neuron, outcome, rounds: plan.rounds, checks: plan.checks });
  }

  /** Event: the owner rated what was built or adjusted. */
  rate(plan: string, rating: Rating) {
    const r = this.result(plan);
    if (r?.outcome !== 'built' && r?.outcome !== 'undone') throw new TuningError('nothing to rate');
    this.settle({ ...r, outcome: r.outcome, rating });
  }

  /** A neuron removed: it no longer holds its variant. */
  forget(neuron: string) {
    this.db.prepare(`DELETE FROM tuning_neurons WHERE neuron = ?`).run(neuron);
  }

  private settle(r: ResultRow & { outcome: Outcome }) {
    // In US$ when the provider says it (cached tokens already cheaper), otherwise in tokens.
    const inUsd = r.costUsd > 0;
    const s = score(
      { ...r, spent: inUsd ? r.costUsd : r.tokens },
      this.reference(r.kind, inUsd),
    );
    this.db
      .prepare(
        `UPDATE tuning_results SET neuron = ?, outcome = ?, rounds = ?, checks = ?, rating = ?,
         score = ?, updated_at = ? WHERE plan = ?`,
      )
      .run(r.neuron, r.outcome, r.rounds, r.checks, r.rating, s, nowMs(), r.plan);
    this.judge(r.variant);
  }

  /** What the champion usually spends on this kind of request: what "little" is measured by. */
  private reference(kind: 'new' | 'adjust', inUsd: boolean): number | null {
    const spent = this.scored(this.champion()!.id, CHAMPION_WINDOW)
      .filter((r) => r.kind === kind)
      .map((r) => (inUsd ? r.costUsd : r.tokens))
      .filter((v) => v > 0);
    return spent.length ? median(spent) : null;
  }

  /** A trial with enough results replaces the champion, is retired, or goes on. */
  private judge(id: number) {
    const v = this.variant(id);
    if (v?.status !== 'trial') return;
    const results = this.scored(id);
    // Two "bad" ratings end a trial at once: the owner should not meet it a third time.
    if (results.filter((r) => r.rating === 'bad').length >= 2) return this.retire(id);
    if (results.length < MIN_RESULTS) return;
    const champion = this.champion()!;
    const theirs = this.scored(champion.id, CHAMPION_WINDOW);
    const mean = (rs: ResultRow[]) => rs.reduce((n, r) => n + r.score!, 0) / rs.length;
    // New neurons and adjustments compared each with their own kind, weighed by how many there
    // are: a trial that met only adjustments is not compared with the champion's new neurons.
    let weighed = 0;
    let counted = 0;
    for (const kind of ['new', 'adjust'] as const) {
      const mine = results.filter((r) => r.kind === kind);
      const champ = theirs.filter((r) => r.kind === kind);
      if (!mine.length || champ.length < MIN_COMPARED) continue;
      weighed += (mean(mine) - mean(champ)) * mine.length;
      counted += mine.length;
    }
    if (counted < MIN_RESULTS) {
      if (results.length >= MAX_RESULTS) this.retire(id);
      return;
    }
    const diff = weighed / counted;
    if (diff > MARGIN) {
      this.db.prepare(`UPDATE tuning_variants SET status = 'retired' WHERE id = ?`).run(champion.id);
      this.db.prepare(`UPDATE tuning_variants SET status = 'champion' WHERE id = ?`).run(id);
    } else if (diff < -MARGIN || results.length >= MAX_RESULTS) this.retire(id);
  }

  private retire(id: number) {
    this.db.prepare(`UPDATE tuning_variants SET status = 'retired' WHERE id = ?`).run(id);
  }

  /** The tuning table, for the screen: the knobs, then each variant and how it went. */
  table() {
    const variants = this.db
      .prepare(
        `SELECT v.id, v.knobs, v.parent, v.changed, v.status, v.created_at AS createdAt,
           COUNT(r.score) AS results, AVG(r.score) AS score, AVG(r.tokens) AS tokens, AVG(r.cost) AS costUsd,
           SUM(r.rating = 'good') AS good, SUM(r.rating = 'fair') AS fair,
           SUM(r.rating = 'bad') AS bad
         FROM tuning_variants v LEFT JOIN tuning_results r ON r.variant = v.id
           AND r.score IS NOT NULL
         GROUP BY v.id ORDER BY v.id DESC LIMIT 50`,
      )
      .all() as (VariantRow & {
      results: number;
      score: number | null;
      tokens: number | null;
      costUsd: number | null;
      good: number | null;
      fair: number | null;
      bad: number | null;
    })[];
    return {
      knobs: KNOBS,
      variants: variants.map((v) => ({
        ...v,
        knobs: complete(JSON.parse(v.knobs)),
        good: v.good ?? 0,
        fair: v.fair ?? 0,
        bad: v.bad ?? 0,
      })),
    };
  }

  /** The rating a plan got, if any, for the screen. */
  rating(plan: string): Rating | null {
    return this.result(plan)?.rating ?? null;
  }
}

export class TuningError extends Error {}
