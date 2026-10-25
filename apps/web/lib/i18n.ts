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
    build: {
      ask: 'Peça ao Dominus',
      askAdjust: (name: string) => `Peça um ajuste a ${name}`,
      send: 'Enviar',
      stop: 'Parar',
      plan: 'Plano',
      step: {
        read: (words: number) => `Pedido lido · ${words} ${words === 1 ? 'palavra' : 'palavras'}`,
        memory: (count: number, similar: string | null) =>
          count === 0
            ? 'Memória vazia: será o primeiro neurônio'
            : similar
              ? `${count} ${count === 1 ? 'neurônio' : 'neurônios'}; ${similar} parece próximo`
              : `${count} ${count === 1 ? 'neurônio' : 'neurônios'}; nenhum cuida disso ainda`,
        thinking: 'Pensando no plano',
        thought: (cost: string) => `Plano pronto · ${cost}`,
        writing: (file: string) => `Criando ${file}`,
        written: (file: string) => `${file} criado`,
        checked: (files: number, size: string) =>
          `Conferido: ${files} ${files === 1 ? 'arquivo' : 'arquivos'}, ${size}`,
        waiting: (time: string) => `Esperando a cota renovar às ${time}`,
      },
      role: { life: 'vida', craft: 'ofício' },
      questionsTitle: 'Faltam detalhes',
      questionsLead: 'Antes de planejar, preciso saber',
      answers: 'Suas respostas',
      reply: 'Responder',
      reject: 'Rejeitar',
      accept: 'Construir',
      acceptAdjust: 'Ajustar',
      change: 'Alterar',
      changes: 'O que mudar no plano',
      redo: 'Refazer o plano',
      back: 'Voltar',
      said: (text: string) => `Você disse: ${text}`,
      understood: 'Como entendi',
      creates: 'O que será criado',
      changesList: 'O que vai mudar',
      data: 'Dados',
      links: 'Ligações',
      reads: (name: string) => `Lê ${name}`,
      linksNote: (name: string) =>
        `Ao construir, ${name} ganha permissão para visualizar isso. Você muda pela chave.`,
      checks: 'Como saber que ficou pronto',
      limits: 'Fica para depois',
      existing: (name: string) => `${name} já parece cuidar disso.`,
      open: (name: string) => `Abrir ${name}`,
      usd: (x: number) =>
        `US$ ${x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: x > 0 && x < 0.01 ? 4 : 2 })}`,
      percent: (x: number) =>
        `${(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: x < 0.1 ? 1 : 0 })}%`,
      thinkCost: (cost: string) => `Pensar custou ${cost}`,
      estimate: {
        fits: (cost: string, window: string, share: string) =>
          `Construir: até ${cost} · cabe na ${window} (cerca de ${share})`,
        tight: (cost: string, window: string, share: string) =>
          `Construir: até ${cost} · justo na ${window} (cerca de ${share}); pode parar perto do fim`,
        wait: (cost: string, window: string, time: string) =>
          `Construir: até ${cost} · não cabe na ${window} agora; ela renova às ${time}`,
        cost: (cost: string) => `Construir: até ${cost}`,
        basis: (n: number) => `pelas últimas ${n} construções`,
        unknown: 'Construir: sem estimativa ainda; ela vem depois de 3 construções medidas',
        noAi: 'Nenhuma IA pronta para construir agora',
      },
      building: (name: string, files: number) =>
        `Construindo ${name} · ${files} ${files === 1 ? 'arquivo' : 'arquivos'}`,
      adjusting: (name: string, files: number) =>
        `Ajustando ${name} · ${files} ${files === 1 ? 'arquivo' : 'arquivos'}`,
      left: (min: number, sec: number) =>
        `≈ ${min ? `${min} min ` : ''}${String(sec).padStart(2, '0')} s para concluir`,
      late: 'Passou da previsão; quase lá',
      firstTime: 'Sem previsão ainda: medindo esta primeira vez',
      built: (name: string) => `${name} · neurônio criado`,
      adjusted: (name: string) => `${name} · ajustado`,
      buildCost: (cost: string | null) =>
        cost ? `Construir custou ${cost}` : 'Construir: a IA não informou o custo',
      adjustCost: (cost: string | null) =>
        cost ? `Ajustar custou ${cost}` : 'Ajustar: a IA não informou o custo',
      failed: {
        'none-ready': 'Nenhuma IA pronta. Conecte uma IA e tente de novo.',
        'all-out-of-quota': 'Todas as IAs estão sem cota agora.',
        'bad-plan': 'O plano veio num formato que não deu para ler.',
        'bad-build': 'A construção não deixou uma aplicação que funcione. Nada foi criado.',
        other: (why: string) => `Parou: ${why}`,
      },
      retry: 'Tentar de novo',
      close: 'Fechar',
      undo: 'Desfazer',
      undone: (name: string) => `${name} · ajuste desfeito, a versão anterior voltou`,
      canceled: 'Cancelado.',
      buildCanceled: 'Construção cancelada. Nada foi criado.',
    },
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
    build: {
      ask: 'Ask the Dominus',
      askAdjust: (name: string) => `Ask for a change to ${name}`,
      send: 'Send',
      stop: 'Stop',
      plan: 'Plan',
      step: {
        read: (words: number) => `Request read · ${words} ${words === 1 ? 'word' : 'words'}`,
        memory: (count: number, similar: string | null) =>
          count === 0
            ? 'Empty memory: this will be the first neuron'
            : similar
              ? `${count} ${count === 1 ? 'neuron' : 'neurons'}; ${similar} looks close`
              : `${count} ${count === 1 ? 'neuron' : 'neurons'}; none does this yet`,
        thinking: 'Thinking of the plan',
        thought: (cost: string) => `Plan ready · ${cost}`,
        writing: (file: string) => `Writing ${file}`,
        written: (file: string) => `${file} written`,
        checked: (files: number, size: string) =>
          `Checked: ${files} ${files === 1 ? 'file' : 'files'}, ${size}`,
        waiting: (time: string) => `Waiting for the quota to reset at ${time}`,
      },
      role: { life: 'life', craft: 'craft' },
      questionsTitle: 'Details missing',
      questionsLead: 'Before planning, I need to know',
      answers: 'Your answers',
      reply: 'Answer',
      reject: 'Reject',
      accept: 'Build',
      acceptAdjust: 'Adjust',
      change: 'Change',
      changes: 'What to change in the plan',
      redo: 'Plan again',
      back: 'Back',
      said: (text: string) => `You said: ${text}`,
      understood: 'How I understood it',
      creates: 'What will be made',
      changesList: 'What will change',
      data: 'Data',
      links: 'Links',
      reads: (name: string) => `Reads ${name}`,
      linksNote: (name: string) =>
        `When built, ${name} gets permission to view this. You change it with the key.`,
      checks: 'How to tell it is ready',
      limits: 'Left for later',
      existing: (name: string) => `${name} seems to do this already.`,
      open: (name: string) => `Open ${name}`,
      usd: (x: number) =>
        `US$ ${x.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: x > 0 && x < 0.01 ? 4 : 2 })}`,
      percent: (x: number) =>
        `${(x * 100).toLocaleString('en', { maximumFractionDigits: x < 0.1 ? 1 : 0 })}%`,
      thinkCost: (cost: string) => `Thinking cost ${cost}`,
      estimate: {
        fits: (cost: string, window: string, share: string) =>
          `Building: up to ${cost} · fits in the ${window} (about ${share})`,
        tight: (cost: string, window: string, share: string) =>
          `Building: up to ${cost} · tight in the ${window} (about ${share}); it may stop near the end`,
        wait: (cost: string, window: string, time: string) =>
          `Building: up to ${cost} · does not fit in the ${window} now; it resets at ${time}`,
        cost: (cost: string) => `Building: up to ${cost}`,
        basis: (n: number) => `from the last ${n} builds`,
        unknown: 'Building: no estimate yet; it comes after 3 measured builds',
        noAi: 'No AI ready to build right now',
      },
      building: (name: string, files: number) =>
        `Building ${name} · ${files} ${files === 1 ? 'file' : 'files'}`,
      adjusting: (name: string, files: number) =>
        `Adjusting ${name} · ${files} ${files === 1 ? 'file' : 'files'}`,
      left: (min: number, sec: number) =>
        `≈ ${min ? `${min} min ` : ''}${String(sec).padStart(2, '0')} s to finish`,
      late: 'Past the estimate; almost there',
      firstTime: 'No estimate yet: measuring this first time',
      built: (name: string) => `${name} · neuron created`,
      adjusted: (name: string) => `${name} · adjusted`,
      buildCost: (cost: string | null) =>
        cost ? `Building cost ${cost}` : 'Building: the AI did not report the cost',
      adjustCost: (cost: string | null) =>
        cost ? `Adjusting cost ${cost}` : 'Adjusting: the AI did not report the cost',
      failed: {
        'none-ready': 'No AI ready. Connect an AI and try again.',
        'all-out-of-quota': 'Every AI is out of quota right now.',
        'bad-plan': 'The plan came in a form that could not be read.',
        'bad-build': 'The build did not leave a working application. Nothing was created.',
        other: (why: string) => `It stopped: ${why}`,
      },
      retry: 'Try again',
      close: 'Close',
      undo: 'Undo',
      undone: (name: string) => `${name} · adjustment undone, the previous version is back`,
      canceled: 'Canceled.',
      buildCanceled: 'Build canceled. Nothing was created.',
    },
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
