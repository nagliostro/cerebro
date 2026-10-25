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
    window: { session: 'sessão', day: 'dia', week: 'semana', month: 'mês', balance: 'saldo' },
    pace: (pct: string) => `ritmo ${pct}`,
    stale: 'leitura antiga',
    weight: (w: string) => `peso ${w}`,
    neuronCount: (all: number, craft: number) =>
      all === 0
        ? 'Nenhum neurônio ainda'
        : `${all} ${all === 1 ? 'neurônio' : 'neurônios'}${craft ? ` · ${craft} de ofício` : ''}`,
    number: (x: number) => x.toLocaleString('pt-BR'),
    menu: { nav: 'Principal', open: 'Abrir menu', close: 'Fechar menu', memory: 'Memória' },
    appTitle: (name: string) => `Aplicação ${name}`,
    appMissing: (name: string) => `A aplicação de ${name} ainda não foi construída.`,
    permissions: (name: string) => ({
      button: `Permissões: quem pode pedir coisas a ${name}`,
      title: `Quem pode pedir coisas a ${name}`,
      note: 'Só você muda isto. Nada usa IA: cada pedido é conferido e gravado direto.',
      grants: { view: 'Visualizar', create: 'Incluir', update: 'Alterar', delete: 'Remover' },
      allowAnother: 'Liberar outro neurônio',
      choose: 'Qual neurônio?',
      revokeAll: 'Revogar tudo',
      nobody: `Nenhum neurônio pode pedir coisas a ${name} ainda.`,
      noData: `${name} ainda não tem dados para oferecer.`,
      failed: 'Não deu para salvar; tente de novo.',
    }),
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
    window: { session: 'session', day: 'day', week: 'week', month: 'month', balance: 'balance' },
    pace: (pct: string) => `pace ${pct}`,
    stale: 'old reading',
    weight: (w: string) => `weight ${w}`,
    neuronCount: (all: number, craft: number) =>
      all === 0
        ? 'No neurons yet'
        : `${all} ${all === 1 ? 'neuron' : 'neurons'}${craft ? ` · ${craft} craft` : ''}`,
    number: (x: number) => x.toLocaleString('en'),
    menu: { nav: 'Main', open: 'Open menu', close: 'Close menu', memory: 'Memória' },
    appTitle: (name: string) => `${name} application`,
    appMissing: (name: string) => `The ${name} application has not been built yet.`,
    permissions: (name: string) => ({
      button: `Permissions: who may ask ${name} for things`,
      title: `Who may ask ${name} for things`,
      note: 'Only you change this. No AI involved: each request is checked and saved directly.',
      grants: { view: 'View', create: 'Add', update: 'Change', delete: 'Remove' },
      allowAnother: 'Allow another neuron',
      choose: 'Which neuron?',
      revokeAll: 'Revoke all',
      nobody: `No neuron may ask ${name} for things yet.`,
      noData: `${name} has no data to offer yet.`,
      failed: 'Could not save; try again.',
    }),
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
