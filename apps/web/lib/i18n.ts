// Screen text in the two languages of the Cerebro. The language follows the browser
// (Accept-Language); anything that is not Portuguese gets English.

export type Locale = 'pt-BR' | 'en';

const messages = {
  'pt-BR': {
    description: 'O ajudante do seu cérebro: as áreas e os objetivos da sua vida, conectados.',
    dominus: 'Dominus',
    version: (v: string) => `Cerebro ${v}`,
    dataAt: (dir: string) => `Seus dados ficam em ${dir}`,
    noAi: 'Nenhuma IA conectada ainda',
  },
  en: {
    description: "Your brain's helper: the areas and goals of your life, connected.",
    dominus: 'Dominus',
    version: (v: string) => `Cerebro ${v}`,
    dataAt: (dir: string) => `Your data lives in ${dir}`,
    noAi: 'No AI connected yet',
  },
} satisfies Record<Locale, Record<string, unknown>>;

export type Messages = (typeof messages)[Locale];

/** The first language in Accept-Language that the Cerebro speaks, by the browser's order. */
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
    if (tag.startsWith('pt')) return 'pt-BR';
    if (tag.startsWith('en')) return 'en';
  }
  return 'en';
}

export const t = (locale: Locale): Messages => messages[locale];
