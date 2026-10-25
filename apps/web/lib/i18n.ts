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
    aiReady: (name: string, version: string) =>
      name === version ? `IA conectada: ${name}` : `IA conectada: ${name} ${version}`,
    aiProblem: {
      'not-installed': (name: string) => `${name} não está instalado neste computador`,
      'not-logged-in': (name: string) => `${name} está instalado, mas sem login`,
      'no-key': (name: string) => `${name}: falta a chave da API`,
      'bad-key': (name: string) => `${name}: a chave da API foi recusada`,
      unreachable: (name: string) => `${name} não respondeu`,
    },
    coreDown: 'O Dominus não respondeu; reinicie o Cerebro',
    locked: 'Para entrar, abra o link que apareceu no terminal onde o Cerebro foi iniciado.',
  },
  en: {
    description: "Your brain's helper: the areas and goals of your life, connected.",
    dominus: 'Dominus',
    version: (v: string) => `Cerebro ${v}`,
    dataAt: (dir: string) => `Your data lives in ${dir}`,
    noAi: 'No AI connected yet',
    aiReady: (name: string, version: string) =>
      name === version ? `AI connected: ${name}` : `AI connected: ${name} ${version}`,
    aiProblem: {
      'not-installed': (name: string) => `${name} is not installed on this computer`,
      'not-logged-in': (name: string) => `${name} is installed, but not logged in`,
      'no-key': (name: string) => `${name}: the API key is missing`,
      'bad-key': (name: string) => `${name}: the API key was refused`,
      unreachable: (name: string) => `${name} did not answer`,
    },
    coreDown: 'The Dominus did not answer; restart the Cerebro',
    locked: 'To enter, open the link shown in the terminal where the Cerebro was started.',
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
