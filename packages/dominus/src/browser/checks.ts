// The functions given to page.evaluate run inside the page: they need the browser's types.
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
import path from 'node:path';

import { chromium, type Browser } from 'playwright-core';

import { readText } from '../providers/file-tools.ts';
import type { Case } from '../research/record.ts';

// The answer key, run against a build: the scripts the Builder listed in checks.json, loaded into
// an empty page with no network at all, and window.cerebroCheck(input) called for each case. The
// expected outputs come from the research, never from the Builder.

export type CheckResult = {
  passed: number;
  total: number;
  /** The cases that did not match: their number (from 1), what was expected and what came. */
  failed: {
    n: number;
    input: Record<string, string>;
    expected: Record<string, string>;
    got: string;
  }[];
  /** Why nothing could be checked (no checks.json, a script that does not load). */
  error?: string;
};

const CASE_TIMEOUT = 3000;

/**
 * A number as written in any language: "R$ 1.006,56", "1,006.56", "10.65%" → 1006.56, 1006.56,
 * 10.65. The last separator is the decimal one when 1 or 2 digits follow it; null when not a number.
 */
export function numberOf(text: string): number | null {
  const s = text.replace(/\s/g, '');
  if (!/\d/.test(s) || /[a-z]{2,}/i.test(s.replace(/R\$|US\$|€|£/g, ''))) return null;
  const negative = /^[^\d]*-/.test(s);
  const m = s.match(/[\d.,]+/);
  if (!m) return null;
  const raw = m[0];
  const last = Math.max(raw.lastIndexOf(','), raw.lastIndexOf('.'));
  const decimals = last >= 0 ? raw.length - last - 1 : 0;
  const n =
    last >= 0 && decimals > 0 && decimals <= 2
      ? Number(`${raw.slice(0, last).replace(/[.,]/g, '')}.${raw.slice(last + 1)}`)
      : Number(raw.replace(/[.,]/g, ''));
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

/** Same value: as numbers to the cent when both are numbers, else as plain text. */
export function sameValue(expected: string, got: unknown): boolean {
  const g = typeof got === 'number' ? String(got) : typeof got === 'string' ? got : '';
  const a = numberOf(expected);
  // A number the code returned is already a number (1006.564 is not "a thousand and six").
  const b = typeof got === 'number' && Number.isFinite(got) ? got : numberOf(g);
  if (a !== null && b !== null) return Math.abs(a - b) < 0.005;
  const plain = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return plain(expected) === plain(g);
}

async function launch(): Promise<Browser> {
  for (const channel of ['msedge', 'chrome', undefined]) {
    try {
      // A browser slow to start (a busy computer) gives way to the next one, never hangs the check.
      return await chromium.launch({ channel, headless: true, timeout: 30_000 });
    } catch {
      // The next one.
    }
  }
  throw new Error('no browser available');
}

export async function runChecks(dir: string, cases: Case[]): Promise<CheckResult> {
  const total = cases.length;
  let scripts: string[];
  try {
    const listed = JSON.parse(await readText(dir, 'checks.json')) as { scripts?: unknown };
    scripts = (Array.isArray(listed.scripts) ? listed.scripts : [])
      .filter((s): s is string => typeof s === 'string' && s.endsWith('.js'))
      .slice(0, 10);
    if (!scripts.length) throw new Error('checks.json lists no scripts');
  } catch (e) {
    return { passed: 0, total, failed: [], error: `no checks: ${(e as Error).message}` };
  }
  const browser = await launch();
  try {
    // No network at all: the page may only run what is given to it here.
    const context = await browser.newContext({ offline: true, serviceWorkers: 'block' });
    await context.route('**/*', (r) => r.abort('blockedbyclient'));
    const page = await context.newPage();
    await page.setContent('<!doctype html><meta charset="utf-8"><title>checks</title>');
    for (const file of scripts) {
      try {
        // readText keeps every path inside the draft.
        await page.addScriptTag({ content: await readText(dir, file.split(path.sep).join('/')) });
      } catch (e) {
        return {
          passed: 0,
          total,
          failed: [],
          error: `${file} did not load: ${(e as Error).message.split('\n')[0]}`,
        };
      }
    }
    if (
      !(await page.evaluate(
        () => typeof (window as { cerebroCheck?: unknown }).cerebroCheck === 'function',
      ))
    )
      return {
        passed: 0,
        total,
        failed: [],
        error: 'checks.js does not define window.cerebroCheck',
      };
    const failed: CheckResult['failed'] = [];
    for (const [i, c] of cases.entries()) {
      let got: unknown;
      try {
        got = await page.evaluate(
          ({ input, ms }) =>
            Promise.race([
              Promise.resolve(
                (window as unknown as { cerebroCheck: (i: object) => unknown }).cerebroCheck(input),
              ),
              new Promise((_, no) => setTimeout(() => no(new Error('took too long')), ms)),
            ]),
          { input: c.input, ms: CASE_TIMEOUT },
        );
      } catch (e) {
        got = { error: (e as Error).message.split('\n')[0] };
      }
      const out = (got && typeof got === 'object' ? got : {}) as Record<string, unknown>;
      const ok = Object.entries(c.output).every(([k, v]) => sameValue(v, out[k]));
      if (!ok)
        failed.push({
          n: i + 1,
          input: c.input,
          expected: c.output,
          got: JSON.stringify(got)?.slice(0, 300) ?? 'nothing',
        });
    }
    return { passed: total - failed.length, total, failed };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
