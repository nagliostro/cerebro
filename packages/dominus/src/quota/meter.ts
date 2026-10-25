// The meter: how much of a window each US$ the Dominus spends takes. Plans report their use only
// as a share of a window (moving in 1% steps), so the Dominus learns the exchange rate from its
// own history: between two readings of the same window, the use went up by d while the Dominus
// spent u dollars; the median of d/u over many such pairs is the rate. Use outside the Cerebro
// (the owner in the provider's own chat) adds noise, which the median absorbs.

export type Reading = { used: number; resetsAt: string | null; measuredAt: number };
export type Spend = { finishedAt: number; costUsd: number | null };

/** Pairs below this spend move the window by less than its 1% step and say nothing. */
const MIN_PAIR_USD = 0.25;
const MIN_PAIRS = 4;

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[s.length >> 1]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

/** The share of the window per US$, or null without enough history. */
export function windowPerUsd(readings: Reading[], spends: Spend[]): number | null {
  const ratios: number[] = [];
  let from = readings[0];
  for (const to of readings.slice(1)) {
    if (!from) break;
    // A reset between the two readings breaks the pair: start again from this one.
    if (to.resetsAt !== from.resetsAt || to.used < from.used) {
      from = to;
      continue;
    }
    const usd = spends
      .filter((s) => s.finishedAt > from!.measuredAt && s.finishedAt <= to.measuredAt)
      .reduce((sum, s) => sum + (s.costUsd ?? 0), 0);
    if (usd < MIN_PAIR_USD) continue; // keep `from`, so small spends add up to a usable pair
    const delta = to.used - from.used;
    if (delta > 0 && delta < 1) ratios.push(delta / usd);
    from = to;
  }
  return ratios.length >= MIN_PAIRS ? median(ratios) : null;
}

/** The 75th percentile of a list, or null when it is too short to say anything. */
export function percentile75(values: number[], min = 3): number | null {
  const s = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (s.length < min) return null;
  const i = (s.length - 1) * 0.75;
  const lo = Math.floor(i);
  return s[lo]! + (s[Math.ceil(i)]! - s[lo]!) * (i - lo);
}
