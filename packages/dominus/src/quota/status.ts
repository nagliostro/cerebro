import type { AiProvider, QuotaWindow } from '../providers/types.ts';
import type { Queue } from '../queue.ts';
import { windowPerUsd } from './meter.ts';
import { windowPace, type Pace } from './pace.ts';

// Where each connection stands, window by window: the last reading (or the Dominus's own count
// for a spending cap), its pace and how much of it each US$ takes. Read from the database when
// asked; nothing runs in the background.

export type WindowStatus = {
  name: QuotaWindow['name'];
  used: number;
  /** Real time it resets, when known. */
  resetsAt: number | null;
  source: QuotaWindow['source'];
  blocked: boolean;
  measuredAt: number;
  /** The reading is older than half an hour: the real use may be higher (use outside). */
  stale: boolean;
  pace: Pace | null;
  perUsd: number | null;
};

const HISTORY_MS = 30 * 86_400_000;
const STALE_MS = 30 * 60_000;

/** The first instant of the next month, UTC, and the length of the current one. */
function monthBounds(now: number) {
  const d = new Date(now);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return { start, end };
}

export function windowStatus(queue: Queue, provider: AiProvider, now: number): WindowStatus[] {
  const asks = queue.asks(provider.id, now - HISTORY_MS);
  const out: WindowStatus[] = queue.quota(provider.id).map((w) => {
    const parsed = w.resetsAt ? Date.parse(w.resetsAt) : NaN;
    const resetsAt = Number.isFinite(parsed) ? parsed : null;
    // A reading from before its reset says nothing about the window now: it starts empty.
    const reset = resetsAt !== null && resetsAt <= now;
    const used = reset ? 0 : w.used;
    const lengthMs = provider.capabilities.windows.find((x) => x.name === w.name)?.lengthMs;
    return {
      name: w.name,
      used,
      resetsAt: reset ? null : resetsAt,
      source: w.source,
      blocked: w.blocked && !reset,
      measuredAt: w.measuredAt,
      stale: now - w.measuredAt > STALE_MS,
      pace: resetsAt !== null && lengthMs ? windowPace({ used, resetsAt, lengthMs }, now) : null,
      perUsd: windowPerUsd(queue.readings(provider.id, w.name, now - HISTORY_MS), asks),
    };
  });

  // A spending cap is a window the Dominus measures itself: what it spent this month.
  if (provider.monthlyCapUsd) {
    const { start, end } = monthBounds(now);
    const spent = queue.spent(provider.id, start).usd;
    const used = Math.min(1, spent / provider.monthlyCapUsd);
    out.push({
      name: 'month',
      used,
      resetsAt: end,
      source: 'estimated',
      blocked: used >= 1,
      measuredAt: now,
      stale: false,
      pace: windowPace({ used, resetsAt: end, lengthMs: end - start }, now),
      perUsd: 1 / provider.monthlyCapUsd,
    });
  }
  return out;
}
