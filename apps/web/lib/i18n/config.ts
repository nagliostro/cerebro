// The languages of the Cerebro, in one place. To add or remove one, see README.md in this folder.

export const LOCALES = ['en', 'pt-BR'] as const;
export type Locale = (typeof LOCALES)[number];

/** What a browser that asks for no language we speak gets. */
export const DEFAULT_LOCALE: Locale = 'en';

/** Each language written in itself: the one text that is never translated. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  'pt-BR': 'Português (Brasil)',
};

/** The screens' language this browser chose in Settings; without it, the browser's own. */
export const LOCALE_COOKIE = 'cerebro_locale';

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value);

/**
 * The first language in Accept-Language that the Cerebro speaks, by the browser's order. An exact
 * match wins ("pt-BR"); otherwise the same base language ("pt-PT" → "pt-BR").
 */
export function pickLocale(acceptLanguage: string | null | undefined): Locale {
  const tags = (acceptLanguage ?? '')
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { tag: tag.toLowerCase(), q: q ? Number(q.split('=')[1]) : 1 };
    })
    .filter((t) => t.tag && t.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of tags) {
    const exact = LOCALES.find((l) => l.toLowerCase() === tag);
    if (exact) return exact;
    const base = tag.split('-')[0];
    const near = LOCALES.find((l) => l.toLowerCase().split('-')[0] === base);
    if (near) return near;
  }
  return DEFAULT_LOCALE;
}
