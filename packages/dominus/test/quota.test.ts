import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { simulated } from '../src/providers/simulated.ts';
import type { AskMode, Capabilities } from '../src/providers/types.ts';
import { guard, nextStepFits, buildEstimate } from '../src/quota/guard.ts';
import { percentile75, windowPerUsd } from '../src/quota/meter.ts';
import { windowPace } from '../src/quota/pace.ts';
import { pickRole, route, type Candidate } from '../src/quota/router.ts';
import { windowStatus } from '../src/quota/status.ts';
import { Queue } from '../src/queue.ts';

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const now = Date.UTC(2026, 9, 24, 12);

describe('pace', () => {
  it('spreads the window evenly until it resets, and splits what is left by day', () => {
    // 3 days left of 7: 4/7 of the week should be used by now.
    const p = windowPace({ used: 0.77, resetsAt: now + 3 * DAY, lengthMs: WEEK }, now)!;
    expect(p.expected).toBeCloseTo(4 / 7);
    expect(p.ahead).toBe(true);
    expect(p.perDay).toBeCloseTo(0.23 / 3);
    expect(windowPace({ used: 0.2, resetsAt: now + 3 * DAY, lengthMs: WEEK }, now)!.ahead).toBe(
      false,
    );
  });

  it('says nothing about a window that already reset', () => {
    expect(windowPace({ used: 0.9, resetsAt: now - 1, lengthMs: WEEK }, now)).toBeNull();
  });

  it('gives the whole rest to today on the last day', () => {
    expect(windowPace({ used: 0.6, resetsAt: now + 2 * HOUR, lengthMs: WEEK }, now)!.perDay).toBe(
      0.4,
    );
  });
});

describe('meter', () => {
  const r = (used: number, at: number, resetsAt = 'w1') => ({ used, resetsAt, measuredAt: at });
  const spend = (usd: number, at: number) => ({ costUsd: usd, finishedAt: at });

  it('learns how much of the window each US$ takes, by the median', () => {
    const readings = [r(0.1, 0), r(0.17, 10), r(0.24, 20), r(0.38, 30), r(0.45, 40), r(0.6, 50)];
    // 1 US$ between each pair; one pair has use from outside the Cerebro (0.14).
    const spends = [10, 20, 30, 40, 50].map((at) => spend(1, at - 1));
    expect(windowPerUsd(readings, spends)).toBeCloseTo(0.07);
  });

  it('adds small spends until they move the window, and restarts after a reset', () => {
    const readings = [r(0.1, 0), r(0.1, 10), r(0.2, 20), r(0.05, 30, 'w2'), r(0.15, 40, 'w2')];
    const spends = [spend(0.1, 5), spend(0.9, 15), spend(1, 25), spend(1, 35)];
    // Pairs: 0→20 (0.1 for 1 US$), 30→40 (0.1 for 1 US$); the reset pair is skipped. Too few.
    expect(windowPerUsd(readings, spends)).toBeNull();
  });

  it('takes the 75th percentile, and nothing from too little history', () => {
    expect(percentile75([1, 2, 3, 4, 5])).toBe(4);
    expect(percentile75([1, 2])).toBeNull();
  });
});

describe('guard', () => {
  const session = { name: 'session', used: 0.5, resetsAt: now + 2 * HOUR, perUsd: 0.1 };
  const week = { name: 'week', used: 0.2, resetsAt: now + 3 * DAY, perUsd: 0.01 };

  it('fits, is tight or waits, by the window that limits', () => {
    expect(guard(2, [session, week], now).verdict).toBe('fits'); // 0.2 of 0.5 left
    expect(guard(4, [session, week], now)).toMatchObject({ verdict: 'tight', window: 'session' });
    expect(guard(6, [session, week], now)).toMatchObject({
      verdict: 'wait',
      window: 'session',
      until: now + 2 * HOUR,
    });
  });

  it('counts a window that already reset as empty', () => {
    expect(guard(6, [{ ...session, used: 0.95, resetsAt: now - 1 }], now).verdict).toBe('tight');
  });

  it('does not guess without an estimate or a rate', () => {
    expect(guard(null, [session], now).verdict).toBe('unknown');
    expect(guard(2, [{ ...session, perUsd: null }], now).verdict).toBe('unknown');
    expect(buildEstimate([1, 2])).toBeNull();
  });

  it('during the job, stops before a step that would not fit', () => {
    expect(nextStepFits([0.5, 1, 0.8], { ...session, used: 0.85 }, now)).toBe(true);
    expect(nextStepFits([0.5, 2, 1.8], { ...session, used: 0.85 }, now)).toBe(false);
    expect(nextStepFits([3], { ...session, used: 0.99 }, now)).toBe(true); // too early to say
  });
});

describe('router', () => {
  const caps = (
    billing: Capabilities['billing'],
    modes: readonly AskMode[] = ['text', 'agent'],
  ) => ({
    billing,
    modes,
    sessions: false,
    quotaSource: 'none' as const,
    windows: [],
  });
  const pace = (ahead: boolean) => ({ expected: 0.5, used: ahead ? 0.7 : 0.3, ahead, perDay: 0.1 });
  const c = (id: string, over: Partial<Candidate> = {}): Candidate => ({
    id,
    capabilities: caps('api'),
    healthy: true,
    windows: [],
    history: [],
    ...over,
  });

  it('prefers local, then a plan within its pace, then an API, then a plan above pace', () => {
    const plan = c('plan', {
      capabilities: caps('plan'),
      windows: [{ name: 'week', used: 0.3, blocked: false, pace: pace(false) }],
    });
    const hot = c('hot', {
      capabilities: caps('plan'),
      windows: [{ name: 'week', used: 0.7, blocked: false, pace: pace(true) }],
    });
    const api = c('api');
    const local = c('local', { capabilities: caps('local') });
    const pick = (list: Candidate[]) => {
      const r = route({ mode: 'text' }, list);
      return r.ok ? r.provider : r.why;
    };
    expect(pick([hot, api, plan, local])).toBe('local');
    expect(pick([hot, api, plan])).toBe('plan');
    expect(pick([hot, api])).toBe('api');
    expect(pick([hot])).toBe('hot');
  });

  it('skips what is not ready, cannot run the mode, or ran out', () => {
    const textOnly = c('text-only', { capabilities: caps('local', ['text']) });
    const out = c('out', {
      capabilities: caps('local'),
      windows: [{ name: 'month', used: 1, blocked: true, pace: null }],
    });
    const down = c('down', { capabilities: caps('local'), healthy: false });
    expect(route({ mode: 'agent' }, [textOnly, down])).toEqual({ ok: false, why: 'none-ready' });
    expect(route({ mode: 'agent' }, [textOnly, out])).toEqual({
      ok: false,
      why: 'all-out-of-quota',
    });
    expect(route({ mode: 'text' }, [textOnly, out])).toMatchObject({ provider: 'text-only' });
  });

  it('obeys a lock by hand, while that connection is usable', () => {
    const r = route({ mode: 'text', lock: { provider: 'b', role: 'strong' } }, [c('a'), c('b')]);
    expect(r).toMatchObject({ provider: 'b', role: 'strong', reasons: ['locked'] });
  });

  it('measures "cheap" instead of assuming it: balanced until history says otherwise', () => {
    expect(pickRole([])).toEqual({ role: 'balanced', reason: 'default-role' });
    const h = (role: string, costUsd: number, ok = true) => ({ role, costUsd, ok });
    // The cheap model cost more here (it thought longer), as in E4.
    const history = [
      ...[0.02, 0.03, 0.025].map((u) => h('cheap', u)),
      ...[0.005, 0.006, 0.004].map((u) => h('balanced', u)),
    ];
    expect(pickRole(history)).toEqual({ role: 'balanced', reason: 'measured-role' });
    const cheapWins = [...[0.001, 0.001, 0.002].map((u) => h('cheap', u)), ...history.slice(3)];
    expect(pickRole(cheapWins).role).toBe('cheap');
    // Cheap but wrong too often does not count.
    const cheapWrong = [h('cheap', 0.001), h('cheap', 0.001, false), h('cheap', 0.001)];
    expect(pickRole(cheapWrong).role).toBe('balanced');
  });
});

describe('window status', () => {
  it('reads the stored windows with pace, and turns a spending cap into a month window', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cerebro-status-'));
    const queue = new Queue(path.join(dir, 'q.db'));
    try {
      const plan = {
        ...simulated(),
        capabilities: {
          ...simulated().capabilities,
          windows: [{ name: 'week' as const, lengthMs: WEEK }],
        },
      };
      const resets = new Date(now + 3 * DAY).toISOString();
      queue.saveQuota(plan.id, [
        { name: 'week', used: 0.77, resetsAt: resets, source: 'official', blocked: false },
      ]);
      const [week] = windowStatus(queue, plan, now);
      expect(week).toMatchObject({ name: 'week', used: 0.77, resetsAt: now + 3 * DAY });
      expect(week!.pace!.ahead).toBe(true);

      const capped = { ...simulated(), id: 'capped', monthlyCapUsd: 20 };
      const month = windowStatus(queue, capped, now).find((w) => w.name === 'month')!;
      expect(month).toMatchObject({ used: 0, resetsAt: Date.UTC(2026, 10, 1), perUsd: 0.05 });
    } finally {
      queue.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
