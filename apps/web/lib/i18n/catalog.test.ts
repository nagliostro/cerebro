import { describe, expect, it } from 'vitest';

import { LOCALES, LOCALE_NAMES, pickLocale, t } from './index';

// The same keys, in the same shape, in every language (and functions that take the same
// arguments): what `pnpm i18n:check` runs. TypeScript already refuses most gaps; this catches
// the rest and says which language lacks what.

function shape(value: unknown, prefix = ''): string[] {
  if (typeof value === 'function') return [`${prefix}(${value.length})`];
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) => shape(v, prefix ? `${prefix}.${k}` : k));
  return [prefix];
}

describe('languages', () => {
  const reference = shape(t(LOCALES[0]!)).sort();

  for (const locale of LOCALES)
    it(`${locale} has the same keys as ${LOCALES[0]}`, () => {
      expect(shape(t(locale)).sort()).toEqual(reference);
    });

  it('every language has a name, written in itself', () => {
    for (const locale of LOCALES) expect(LOCALE_NAMES[locale]).toBeTruthy();
  });

  it('no text is empty', () => {
    const empty = (v: unknown, p = ''): string[] =>
      typeof v === 'string'
        ? v.trim()
          ? []
          : [p]
        : v && typeof v === 'object'
          ? Object.entries(v).flatMap(([k, x]) => empty(x, `${p}.${k}`))
          : [];
    for (const locale of LOCALES) expect(empty(t(locale))).toEqual([]);
  });

  it('picks an exact match, then the same base language', () => {
    expect(pickLocale('pt-BR')).toBe('pt-BR');
    expect(pickLocale('pt-PT')).toBe('pt-BR');
    expect(pickLocale('en-GB')).toBe('en');
  });
});
