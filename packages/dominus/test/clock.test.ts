import { afterEach, describe, expect, it } from 'vitest';

import { median, nowMs, setOffset } from '../src/clock.ts';

afterEach(() => setOffset(0));

describe('clock', () => {
  it('corrects the computer clock by the measured offset', () => {
    setOffset(-90 * 60_000);
    expect(Math.abs(nowMs() - (Date.now() - 90 * 60_000))).toBeLessThan(50);
  });

  it('takes the median of the sources, so one wrong server does not move it', () => {
    expect(median([-212, -205, 50_000])).toBe(-205);
    expect(median([10, 20])).toBe(15);
  });
});
