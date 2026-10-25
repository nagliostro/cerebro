import { percentile75 } from './meter.ts';

// The Guard says, before a big job starts, whether it fits in what is left of each window of a
// connection, and during it, whether the next step still fits. Pure calculation, no AI.
//
// Before (E2): nothing known up front predicts a build's cost (it varied 18x), so the estimate
// is the 75th percentile of past builds: it covered 2 of 3 and reserved only ~30% too much.
// During: the next step is estimated by the 75th percentile of the steps so far.

export type GuardWindow = {
  name: string;
  /** 0..1 already used. */
  used: number;
  /** Real time it resets, when known. */
  resetsAt: number | null;
  /** Share of this window per US$ (the meter's rate); null while unknown. */
  perUsd: number | null;
};

export type GuardVerdict =
  /** Uses at most 60% of what is left in every window. */
  | { verdict: 'fits'; needed: Record<string, number> }
  /** Fits, but close to the end of some window: it may stop near the end. */
  | { verdict: 'tight'; needed: Record<string, number>; window: string }
  /** Does not fit now: wait for this window to reset (or use another connection). */
  | { verdict: 'wait'; needed: Record<string, number>; window: string; until: number | null }
  /** Not enough history or readings to say. */
  | { verdict: 'unknown' };

const COMFORT = 0.6;

export function guard(costUsd: number | null, windows: GuardWindow[], now: number): GuardVerdict {
  if (costUsd === null) return { verdict: 'unknown' };
  const known = windows.filter((w) => w.perUsd !== null);
  if (!known.length) return { verdict: 'unknown' };
  const needed: Record<string, number> = {};
  let tight: string | null = null;
  for (const w of known) {
    // A reading from before its reset says nothing about the window now.
    const used = w.resetsAt !== null && w.resetsAt <= now ? 0 : w.used;
    const left = Math.max(0, 1 - used);
    const need = costUsd * w.perUsd!;
    needed[w.name] = need;
    if (need > left) return { verdict: 'wait', needed, window: w.name, until: w.resetsAt };
    if (need > left * COMFORT) tight ??= w.name;
  }
  return tight ? { verdict: 'tight', needed, window: tight } : { verdict: 'fits', needed };
}

/** What a build should cost before it starts, from the past ones; null with fewer than 3. */
export const buildEstimate = (pastBuildsUsd: number[]) => percentile75(pastBuildsUsd);

/** During a job: does the next step fit in what is left? Unknown (true) before 2 steps. */
export function nextStepFits(stepsUsd: number[], window: GuardWindow, now: number): boolean {
  const next = percentile75(stepsUsd, 2);
  if (next === null || window.perUsd === null) return true;
  const used = window.resetsAt !== null && window.resetsAt <= now ? 0 : window.used;
  return next * window.perUsd <= 1 - used;
}
