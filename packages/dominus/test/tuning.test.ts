import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { KNOBS, mutate, score, Tuner, type Knobs } from '../src/tuning/tuner.ts';

// The tuning, with no AI and no core: a database, a die that says what it is told, and the events
// a plan sends (it entered, it spent, it ended, it was rated).

let dir: string;
let tuner: Tuner;
/** The die: the next values it rolls; 0.9 (no trial) once they run out. */
let rolls: number[];

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'cerebro-tuning-'));
  rolls = [];
  tuner = new Tuner(path.join(dir, 'dominus.db'), () => rolls.shift() ?? 0.9);
});

afterEach(async () => {
  tuner.close();
  await rm(dir, { recursive: true, force: true });
});

let n = 0;
/** A request that ends as said: spent `tokens`, rated if given. Returns its plan id. */
function run(
  opts: { target?: string; tokens?: number; end?: string; rating?: 'bad' | 'fair' | 'good' } = {},
) {
  const plan = `p${++n}`;
  tuner.assign(plan, opts.target ?? null);
  // What it cost follows its tokens, as with a provider that says it.
  tuner.spent(plan, opts.tokens ?? 1000, (opts.tokens ?? 1000) / 100_000);
  tuner.observe({
    id: plan,
    status: opts.end ?? 'built',
    neuron: opts.target ?? `n${n}`,
    rounds: 1,
    checks: null,
  });
  if (opts.rating) tuner.rate(plan, opts.rating);
  return plan;
}

const variants = () => tuner.table().variants;
const champion = () => variants().find((v) => v.status === 'champion')!;

describe('the knobs', () => {
  it('a step changes one live knob and never leaves its limits', () => {
    let k = tuner.knobs('none');
    for (let i = 0; i < 300; i++) {
      const { knobs, changed } = mutate(k, Math.random);
      expect(KNOBS[changed].live).toBe(true);
      const differ = (Object.keys(KNOBS) as (keyof Knobs)[]).filter((x) => knobs[x] !== k[x]);
      expect(differ).toEqual([changed]);
      for (const [name, knob] of Object.entries(KNOBS)) {
        const v = knobs[name as keyof Knobs];
        if (knob.kind === 'amount') {
          expect(v).toBeGreaterThanOrEqual(knob.min);
          expect(v).toBeLessThanOrEqual(knob.max);
        } else expect(knob.options as readonly unknown[]).toContain(v);
      }
      k = knobs;
    }
  });

  it('starts from the values the Dominus used before the tuning', () => {
    expect(tuner.knobs('none')).toMatchObject({
      thinkRole: 'balanced',
      buildRole: 'balanced',
      planCode: 48_000,
    });
  });
});

describe('the score', () => {
  const base = { outcome: 'built' as const, rating: null, rounds: 1, checks: null, spent: 1000 };

  it('puts the owner first: good beats fair even at twice the tokens', () => {
    const good = score({ ...base, rating: 'good', spent: 2000 }, 1000);
    const fair = score({ ...base, rating: 'fair', spent: 500 }, 1000);
    expect(good).toBeGreaterThan(fair);
  });

  it('for the same result, spending less scores more; extra rounds and an undo score less', () => {
    expect(score({ ...base, spent: 500 }, 1000)).toBeGreaterThan(score(base, 1000));
    expect(score({ ...base, rounds: 3 }, 1000)).toBeLessThan(score(base, 1000));
    expect(score({ ...base, outcome: 'undone' }, 1000)).toBeLessThan(score(base, 1000));
    expect(score({ ...base, checks: 0.5 }, 1000)).toBeLessThan(score(base, 1000));
  });
});

describe('the tuning', () => {
  it('a variant that solves better for less becomes the champion, after five results', () => {
    const first = champion().id;
    for (let i = 0; i < 5; i++) run({ tokens: 1000, rating: 'fair' });
    // The die: try a variant (0.1), step the first live knob (0.0) up (0.1).
    rolls = [0.1, 0.0, 0.1];
    run({ tokens: 600, rating: 'good' });
    const trial = variants().find((v) => v.status === 'trial')!;
    expect(trial).toMatchObject({ parent: first, changed: 'thinkRole' });
    expect(trial.knobs.thinkRole).toBe('strong');
    for (let i = 0; i < 3; i++) {
      rolls = [0.1];
      run({ tokens: 600, rating: 'good' });
    }
    expect(champion().id).toBe(first);
    rolls = [0.1];
    run({ tokens: 600, rating: 'good' });
    expect(champion().id).toBe(trial.id);
    expect(variants().find((v) => v.id === first)!.status).toBe('retired');
  });

  it('two bad ratings retire a variant at once', () => {
    rolls = [0.1, 0.0, 0.1];
    run({ rating: 'bad' });
    rolls = [0.1];
    run({ rating: 'bad' });
    expect(variants().find((v) => v.parent)!.status).toBe('retired');
  });

  it('a neuron is adjusted with the values it was born with, while they are in play', () => {
    rolls = [0.1, 0.0, 0.1];
    run();
    const born = variants().find((v) => v.status === 'trial')!;
    const adjust = run({ target: `n${n}` });
    expect(tuner.knobs(adjust).thinkRole).toBe(born.knobs.thinkRole);
    // Another neuron, never in a trial, adjusts with the champion's.
    const plain = run();
    expect(tuner.knobs(run({ target: `n${n}` })).thinkRole).toBe('balanced');
    expect(plain).toBeTruthy();
  });

  it('compares a trial only with what the champion did of the same kind', () => {
    // The champion has only new neurons; the trial meets only adjustments: never judged.
    for (let i = 0; i < 5; i++) run({ rating: 'fair' });
    rolls = [0.1, 0.0, 0.1];
    run();
    const born = `n${n}`;
    for (let i = 0; i < 6; i++) run({ target: born, rating: 'good' });
    expect(variants().find((v) => v.parent)!.status).toBe('trial');
  });

  it('never plans with the cheap model: it cost more when it thought more (E4)', () => {
    expect(KNOBS.thinkRole.options).not.toContain('cheap');
    expect(KNOBS.buildRole.options).not.toContain('cheap');
  });

  it('counts nothing for a canceled plan, and rates only what was built', () => {
    const canceled = run({ end: 'canceled' });
    expect(() => tuner.rate(canceled, 'good')).toThrow(/nothing to rate/);
    const rejected = run({ end: 'rejected' });
    expect(() => tuner.rate(rejected, 'good')).toThrow(/nothing to rate/);
    const built = run();
    tuner.rate(built, 'good');
    expect(tuner.rating(built)).toBe('good');
    expect(champion()).toMatchObject({ results: 2, good: 1 });
  });

  it('two cores started at once leave one champion: the one with the most results', () => {
    run();
    run();
    const kept = champion().id;
    tuner.close();
    // A second champion, as a second core once made.
    const db = new DatabaseSync(path.join(dir, 'dominus.db'));
    db.exec(`DROP INDEX IF EXISTS tuning_one_champion`);
    db.prepare(
      `INSERT INTO tuning_variants (knobs, status, created_at) VALUES ('{}', 'champion', 1)`,
    ).run();
    db.close();
    tuner = new Tuner(path.join(dir, 'dominus.db'), () => 0.9);
    expect(
      variants()
        .filter((v) => v.status === 'champion')
        .map((v) => v.id),
    ).toEqual([kept]);
    // And no second one is made by another start.
    const again = new Tuner(path.join(dir, 'dominus.db'), () => 0.9);
    again.close();
    expect(variants().filter((v) => v.status === 'champion')).toHaveLength(1);
  });

  it('keeps every value of a variant within limits after a restart', () => {
    rolls = [0.1, 0.4, 0.9];
    run();
    tuner.close();
    tuner = new Tuner(path.join(dir, 'dominus.db'), () => 0.9);
    expect(variants()).toHaveLength(2);
    expect(variants().filter((v) => v.status === 'champion')).toHaveLength(1);
  });
});
