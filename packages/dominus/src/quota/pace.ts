// The pace of a quota window: how much of it should be used by now if the use were spread
// evenly until it resets, and how much the rest of today may take. Generic: any provider's
// window (a plan's week, an API's month), given its length and when it resets. No AI.

export type Pace = {
  /** 0..1: the share of the window that has passed, the even-spread target for now. */
  expected: number;
  /** 0..1: the share already used. */
  used: number;
  /** Used more than the pace allows. */
  ahead: boolean;
  /** 0..1 of the window: what is left, divided by the days until it resets (at least one). */
  perDay: number;
};

const DAY_MS = 86_400_000;

export function windowPace(
  w: { used: number; resetsAt: number; lengthMs: number },
  now: number,
): Pace | null {
  // The window already reset: the stored use says nothing about the new one.
  if (w.resetsAt <= now || w.lengthMs <= 0) return null;
  const left = w.resetsAt - now;
  const expected = Math.min(1, Math.max(0, 1 - left / w.lengthMs));
  const used = Math.min(1, Math.max(0, w.used));
  return {
    expected,
    used,
    ahead: used > expected,
    perDay: (1 - used) / Math.max(1, left / DAY_MS),
  };
}
