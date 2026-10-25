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
    menu: {
      nav: 'Principal',
      open: 'Abrir menu',
      close: 'Fechar menu',
      memory: 'Memória',
      devices: 'Aparelhos',
      settings: 'Configurações',
    },
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
        guide: (lessons: number) =>
          `Guia de clonar lido${lessons ? ` · ${lessons} ${lessons === 1 ? 'lição' : 'lições'} desta instalação` : ''}`,
        browse: (host: string, pages: number, done: boolean) =>
          done
            ? `${host} · ${pages} ${pages === 1 ? 'página' : 'páginas'}`
            : `Navegador · abrindo ${host}`,
        search: (query: string, done: boolean) =>
          done ? `Buscou: ${query}` : `Buscando: ${query}`,
        cases: (count: number, done: boolean) =>
          done
            ? `${count} ${count === 1 ? 'caso guardado' : 'casos guardados'}`
            : `Montando o gabarito · ${count} ${count === 1 ? 'caso' : 'casos'}`,
        rules: (count: number) => `${count} ${count === 1 ? 'regra' : 'regras'} com fonte`,
        findings: (count: number) =>
          `${count} ${count === 1 ? 'achado' : 'achados'} (melhorias, defeitos, lacunas)`,
        libraries: (count: number) =>
          `${count} ${count === 1 ? 'biblioteca livre conferida' : 'bibliotecas livres conferidas'}`,
        verify: (passed: number, total: number, done: boolean) =>
          done ? `${passed} de ${total} casos batem` : 'Conferindo com o gabarito',
        researching: 'Pesquisando',
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
      adjustExisting: (name: string) => `Ajustar ${name}`,
      createAnyway: 'Criar um novo',
      createAnywayText: (name: string) => `Quero um neurônio novo, separado de ${name}.`,
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
      chooseTitle: 'Qual função copiar?',
      chooseLead: (n: number) => `O app tem ${n} ${n === 1 ? 'função' : 'funções'}`,
      chooseNote: 'Copiar uma só sai melhor e mais barato. As outras podem virar neurônios depois.',
      researchThis: 'Pesquisar esta',
      observed: 'O que observei',
      shot: 'A tela do original',
      fields: 'campos',
      outputs: 'saídas',
      server: 'servidor',
      answerKey: (n: number) => `Gabarito · ${n} ${n === 1 ? 'caso' : 'casos'}`,
      answerKeyNote: (observed: number, written: number) =>
        `${observed} ${observed === 1 ? 'observado' : 'observados'} no original${written ? `, ${written} de exemplos escritos` : ''}. A aplicação só fica pronta quando der o mesmo resultado em todos.`,
      showCases: (n: number) => `Ver os ${n} casos`,
      rulesFound: 'Regras encontradas',
      improvements: 'Melhorias que os usuários pedem',
      defect: 'Defeito do original, que o clone não copia:',
      gaps: 'Lacunas',
      sites: 'Sites visitados',
      pages: (n: number) => `${n} ${n === 1 ? 'página' : 'páginas'}`,
      sitesNote:
        'Numa janela própria do Navegador, sem as suas contas e sem acesso aos seus arquivos.',
      observedSource: 'observado',
      researchCost: (cost: string) => `Pesquisar e planejar custou ${cost}`,
      libraries: 'Bibliotecas livres que vão dentro dele',
      library: (version: string, license: string, weekly: string) =>
        `${version} · ${license} · ${weekly} downloads por semana`,
      librariesNote:
        'Conferidas no registro do npm. Vão na pasta do neurônio: funcionam sem internet, sem custo.',
      verified: (passed: number, total: number) => `${passed} de ${total} casos do gabarito batem`,
    },
    settings: {
      title: 'Configurações',
      nav: 'Seções de Configurações',
      sections: {
        general: 'Geral',
        connections: 'Conexões',
        usage: 'Uso',
        processes: 'Processos',
        runs: 'Execuções',
        neurons: 'Neurônios',
        devices: 'Aparelhos',
      },
      general: {
        lead: 'As opções do Cerebro. Cada uma muda algo de verdade.',
        depth: 'Profundidade da pesquisa',
        depthLead:
          'Quanto o Navegador lê antes de planejar uma cópia. Mais fundo acha mais regras e casos, e gasta mais.',
        depths: {
          shallow: 'Rasa · até 10 páginas',
          medium: 'Média · até 25 páginas',
          deep: 'Funda · até 60 páginas',
        },
        saved: 'Salvo.',
        about: 'Sobre',
        version: 'versão',
        data: 'seus dados',
        language: 'idioma',
        languageValue: 'o do navegador',
      },
      connections: {
        lead: 'As IAs que o Dominus usa. A assinatura entra pelo programa oficial; as APIs, por uma chave que fica no cofre do sistema.',
        subscription: 'Assinatura',
        apis: 'APIs',
        none: 'Nenhuma API conectada. O Dominus usa só o Claude Code.',
        ok: (version: string) => `pronto · ${version}`,
        problem: {
          'not-installed': 'não instalado',
          'not-logged-in': 'sem login: rode o programa e entre na sua conta',
          'no-key': 'sem chave',
          'bad-key': 'a chave foi recusada',
          unreachable: 'não respondeu',
        },
        check: 'Testar',
        checking: 'Testando…',
        remove: 'Remover',
        confirmRemove: (name: string) => `Remover ${name}? A chave sai do cofre.`,
        add: 'Conectar uma API',
        preset: 'Provedor',
        name: 'Nome',
        address: 'Endereço',
        key: 'Chave da API',
        keyKept: 'A chave guardada continua; escreva só para trocar.',
        models: 'Modelos',
        roles: { cheap: 'barato', balanced: 'equilibrado', strong: 'forte' },
        modelsNote: 'Confira os nomes no site do provedor; eles mudam com o tempo.',
        cap: 'Teto por mês (US$, opcional)',
        save: 'Salvar',
        cancel: 'Cancelar',
        edit: 'Editar',
        noVault:
          'Este computador não tem um cofre de senhas que o Cerebro possa usar, então a chave não foi guardada.',
        local: 'local, sem custo',
        capOf: (cap: string) => `teto de ${cap} por mês`,
      },
      usage: {
        lead: 'Quanto de cada limite já foi usado e o que cada IA custou. Lido do que o Dominus mede; nada gasta tokens.',
        none: 'Ainda sem leituras.',
        used: (share: string) => `${share} usado`,
        resets: (when: string) => `renova ${when}`,
        blocked: 'esgotado',
        spent: (cost: string, calls: number) =>
          `${cost} nos últimos 7 dias · ${calls} ${calls === 1 ? 'chamada' : 'chamadas'}`,
        windows: { session: 'sessão', day: 'dia', week: 'semana', month: 'mês', balance: 'saldo' },
        estimated: 'estimado',
      },
      processes: {
        lead: 'Cada pedido seu, do começo ao fim, nas etapas do Cerebro. Lido do que o Cerebro guarda; nada gasta tokens.',
        none: 'Nenhum pedido ainda.',
        stages: {
          request: 'Pedido',
          research: 'Pesquisa',
          plan: 'Plano',
          build: 'Construção',
          out: 'Saída',
        },
        said: (text: string) => `Você disse: ${text}`,
        researched: (sites: number, pages: number, cases: number, rules: number) =>
          `${pages} ${pages === 1 ? 'página' : 'páginas'} em ${sites} ${sites === 1 ? 'site' : 'sites'} · ${cases} ${cases === 1 ? 'caso' : 'casos'} no gabarito · ${rules} ${rules === 1 ? 'regra' : 'regras'}`,
        gaps: (n: number) => `${n} ${n === 1 ? 'lacuna' : 'lacunas'}`,
        libraries: (list: string) => `bibliotecas: ${list}`,
        parts: (n: number) => `${n} ${n === 1 ? 'parte' : 'partes'}`,
        files: (n: number) => `${n} ${n === 1 ? 'arquivo' : 'arquivos'}`,
        verified: (passed: number, total: number) => `${passed} de ${total} casos do gabarito`,
        outcome: {
          built: 'Neurônio criado',
          adjusted: 'Neurônio ajustado',
          undone: 'Ajuste desfeito',
          rejected: 'Rejeitado',
          canceled: 'Cancelado',
          failed: 'Parou',
          open: 'Esperando você',
          running: 'Em andamento',
        },
        cost: (cost: string) => `custou ${cost}`,
        open: (name: string) => `Abrir ${name}`,
      },
      runs: {
        lead: 'Os últimos trabalhos do Dominus: o que foi, como terminou, quanto levou e custou.',
        none: 'Nenhum trabalho ainda.',
        kinds: {
          research: 'Pesquisar',
          think: 'Planejar',
          build: 'Construir',
          checks: 'Conferir o gabarito',
          other: 'Outro',
        },
        status: {
          queued: 'na fila',
          running: 'rodando',
          waiting: 'esperando a cota',
          done: 'concluído',
          failed: 'falhou',
          canceled: 'cancelado',
        },
        stop: 'Parar',
      },
      neurons: {
        lead: 'Cada neurônio, o papel dele e o que dá para mudar. Excluir apaga a aplicação e os dados.',
        none: 'Nenhum neurônio ainda.',
        open: 'Abrir',
        rename: 'Renomear',
        name: 'Nome',
        save: 'Salvar',
        cancel: 'Cancelar',
        role: 'Papel',
        weight: (w: number) => `peso ${w.toLocaleString('pt-BR')}`,
        noApp: 'sem aplicação',
        remove: 'Excluir',
        confirmTitle: (name: string) => `Excluir ${name}?`,
        confirmText:
          'Apaga a aplicação, os dados, as permissões e as ligações dele. Não dá para desfazer.',
        confirm: 'Excluir de vez',
        removed: (name: string) => `${name} foi excluído.`,
      },
      failed: (why: string) => `Não deu certo: ${why}`,
    },
    devices: {
      title: 'Aparelhos',
      lead: 'Quem entra no Cerebro. Cada aparelho tem a sua chave; revogar tira na hora.',
      unknown: 'Aparelho de antes desta versão',
      kind: { phone: 'Celular', tablet: 'Tablet', computer: 'Computador' },
      thisOne: 'este',
      revoke: 'Revogar',
      seen: (when: string) => `visto ${when}`,
      now: 'agora',
      pair: 'Parear um celular',
      pairTitle: 'Aponte a câmera do celular para o código',
      pairOnce: 'Vale uma vez',
      pairCode: 'Código de pareamento',
      pairDone: 'Celular pareado.',
      pairExpired: 'O código venceu. Gere outro quando o celular estiver à mão.',
      cancel: 'Cancelar',
      needRemote: 'Para parear um celular, ligue antes o acesso de fora de casa.',
      onlyHere: 'O pareamento e o acesso remoto se mudam no próprio computador do Cerebro.',
      remoteTitle: 'Acesso de fora de casa',
      remote: {
        'not-installed':
          'Para abrir o Cerebro no celular fora de casa, instale o Tailscale neste computador e no celular e entre com a mesma conta nos dois. Ele cria uma rede só sua: nada fica aberto na internet.',
        'signed-out':
          'O Tailscale está instalado, mas sem login neste computador. Entre nele e volte aqui.',
        ready: (host: string) => `Tailscale pronto neste computador (${host}).`,
        notRunning: (why: string) =>
          `O Tailscale deste computador não está conectado${why ? ` (${why})` : ''}. Reconecte-o pelo ícone dele, perto do relógio, e volte aqui.`,
        serving: (url: string) => `Ligado: ${url}, só para os seus aparelhos.`,
      },
      download: 'Baixar o Tailscale',
      turnOn: 'Ligar o acesso remoto',
      enableFirst:
        'Falta uma vez só: permitir o Serve na sua rede do Tailscale. Depois, toque de novo em Ligar.',
      enable: 'Permitir no Tailscale',
      turnOff: 'Desligar',
      failed: (detail: string) => `Não deu para ligar: ${detail}`,
      welcome: 'Este aparelho entrou no Cerebro',
      installIos:
        'Para usar como aplicativo, toque em Compartilhar e depois em Adicionar à Tela de Início.',
      installOther: 'Para usar como aplicativo, instale pelo menu do navegador.',
      install: 'Instalar o Cerebro',
      openMemory: 'Abrir a Memória',
    },
    locked:
      'Para entrar, abra o link que apareceu no terminal onde o Cerebro foi iniciado. No celular, pareie pelo computador, em Aparelhos.',
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
    menu: {
      nav: 'Main',
      open: 'Open menu',
      close: 'Close menu',
      memory: 'Memória',
      devices: 'Devices',
      settings: 'Settings',
    },
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
        guide: (lessons: number) =>
          `Copying guide read${lessons ? ` · ${lessons} ${lessons === 1 ? 'lesson' : 'lessons'} of this install` : ''}`,
        browse: (host: string, pages: number, done: boolean) =>
          done
            ? `${host} · ${pages} ${pages === 1 ? 'page' : 'pages'}`
            : `Navegador · opening ${host}`,
        search: (query: string, done: boolean) =>
          done ? `Searched: ${query}` : `Searching: ${query}`,
        cases: (count: number, done: boolean) =>
          done
            ? `${count} ${count === 1 ? 'case kept' : 'cases kept'}`
            : `Building the answer key · ${count} ${count === 1 ? 'case' : 'cases'}`,
        rules: (count: number) => `${count} ${count === 1 ? 'rule' : 'rules'} with a source`,
        findings: (count: number) =>
          `${count} ${count === 1 ? 'finding' : 'findings'} (improvements, defects, gaps)`,
        libraries: (count: number) =>
          `${count} free ${count === 1 ? 'library' : 'libraries'} checked`,
        verify: (passed: number, total: number, done: boolean) =>
          done ? `${passed} of ${total} cases match` : 'Checking against the answer key',
        researching: 'Researching',
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
      adjustExisting: (name: string) => `Adjust ${name}`,
      createAnyway: 'Make a new one',
      createAnywayText: (name: string) => `I want a new neuron, apart from ${name}.`,
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
      chooseTitle: 'Which feature to copy?',
      chooseLead: (n: number) => `The app has ${n} ${n === 1 ? 'feature' : 'features'}`,
      chooseNote: 'Copying one comes out better and cheaper. The others can become neurons later.',
      researchThis: 'Research this one',
      observed: 'What I observed',
      shot: 'The screen of the original',
      fields: 'fields',
      outputs: 'outputs',
      server: 'server',
      answerKey: (n: number) => `Answer key · ${n} ${n === 1 ? 'case' : 'cases'}`,
      answerKeyNote: (observed: number, written: number) =>
        `${observed} observed on the original${written ? `, ${written} from written examples` : ''}. The application is ready only when it gives the same result in all of them.`,
      showCases: (n: number) => `See the ${n} cases`,
      rulesFound: 'Rules found',
      improvements: 'Improvements users ask for',
      defect: 'A defect of the original, which the copy does not repeat:',
      gaps: 'Gaps',
      sites: 'Sites visited',
      pages: (n: number) => `${n} ${n === 1 ? 'page' : 'pages'}`,
      sitesNote:
        "In the Navegador's own window, without your accounts and without access to your files.",
      observedSource: 'observed',
      researchCost: (cost: string) => `Researching and planning cost ${cost}`,
      libraries: 'Free libraries it will carry',
      library: (version: string, license: string, weekly: string) =>
        `${version} · ${license} · ${weekly} downloads a week`,
      librariesNote:
        "Checked on the npm registry. They go in the neuron's folder: they work with no internet, at no cost.",
      verified: (passed: number, total: number) => `${passed} of ${total} answer key cases match`,
    },
    settings: {
      title: 'Settings',
      nav: 'Settings sections',
      sections: {
        general: 'General',
        connections: 'Connections',
        usage: 'Usage',
        processes: 'Processes',
        runs: 'Runs',
        neurons: 'Neurons',
        devices: 'Devices',
      },
      general: {
        lead: "The Cerebro's options. Each one changes something real.",
        depth: 'Research depth',
        depthLead:
          'How much the Navegador reads before planning a copy. Deeper finds more rules and cases, and costs more.',
        depths: {
          shallow: 'Shallow · up to 10 pages',
          medium: 'Medium · up to 25 pages',
          deep: 'Deep · up to 60 pages',
        },
        saved: 'Saved.',
        about: 'About',
        version: 'version',
        data: 'your data',
        language: 'language',
        languageValue: "the browser's",
      },
      connections: {
        lead: "The AIs the Dominus uses. A subscription comes in through its official program; an API, through a key kept in the system's vault.",
        subscription: 'Subscription',
        apis: 'APIs',
        none: 'No API connected. The Dominus uses only Claude Code.',
        ok: (version: string) => `ready · ${version}`,
        problem: {
          'not-installed': 'not installed',
          'not-logged-in': 'not signed in: run the program and sign in',
          'no-key': 'no key',
          'bad-key': 'the key was refused',
          unreachable: 'did not answer',
        },
        check: 'Test',
        checking: 'Testing…',
        remove: 'Remove',
        confirmRemove: (name: string) => `Remove ${name}? Its key leaves the vault.`,
        add: 'Connect an API',
        preset: 'Provider',
        name: 'Name',
        address: 'Address',
        key: 'API key',
        keyKept: 'The saved key stays; type only to change it.',
        models: 'Models',
        roles: { cheap: 'cheap', balanced: 'balanced', strong: 'strong' },
        modelsNote: "Check the names on the provider's site; they change over time.",
        cap: 'Monthly cap (US$, optional)',
        save: 'Save',
        cancel: 'Cancel',
        edit: 'Edit',
        noVault:
          'This computer has no password vault the Cerebro can use, so the key was not saved.',
        local: 'local, free',
        capOf: (cap: string) => `cap of ${cap} a month`,
      },
      usage: {
        lead: 'How much of each limit is used and what each AI cost. Read from what the Dominus measures; nothing spends tokens.',
        none: 'No readings yet.',
        used: (share: string) => `${share} used`,
        resets: (when: string) => `resets ${when}`,
        blocked: 'ran out',
        spent: (cost: string, calls: number) =>
          `${cost} in the last 7 days · ${calls} ${calls === 1 ? 'call' : 'calls'}`,
        windows: {
          session: 'session',
          day: 'day',
          week: 'week',
          month: 'month',
          balance: 'balance',
        },
        estimated: 'estimated',
      },
      processes: {
        lead: "Each of your requests, from start to end, through the Cerebro's stages. Read from what the Cerebro keeps; nothing spends tokens.",
        none: 'No requests yet.',
        stages: {
          request: 'Request',
          research: 'Research',
          plan: 'Plan',
          build: 'Build',
          out: 'Outcome',
        },
        said: (text: string) => `You said: ${text}`,
        researched: (sites: number, pages: number, cases: number, rules: number) =>
          `${pages} ${pages === 1 ? 'page' : 'pages'} on ${sites} ${sites === 1 ? 'site' : 'sites'} · ${cases} answer key ${cases === 1 ? 'case' : 'cases'} · ${rules} ${rules === 1 ? 'rule' : 'rules'}`,
        gaps: (n: number) => `${n} ${n === 1 ? 'gap' : 'gaps'}`,
        libraries: (list: string) => `libraries: ${list}`,
        parts: (n: number) => `${n} ${n === 1 ? 'part' : 'parts'}`,
        files: (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`,
        verified: (passed: number, total: number) => `${passed} of ${total} answer key cases`,
        outcome: {
          built: 'Neuron created',
          adjusted: 'Neuron adjusted',
          undone: 'Adjustment undone',
          rejected: 'Rejected',
          canceled: 'Canceled',
          failed: 'Stopped',
          open: 'Waiting for you',
          running: 'Running',
        },
        cost: (cost: string) => `cost ${cost}`,
        open: (name: string) => `Open ${name}`,
      },
      runs: {
        lead: "The Dominus's latest jobs: what each was, how it ended, how long it took and cost.",
        none: 'No jobs yet.',
        kinds: {
          research: 'Research',
          think: 'Plan',
          build: 'Build',
          checks: 'Check the answer key',
          other: 'Other',
        },
        status: {
          queued: 'queued',
          running: 'running',
          waiting: 'waiting for quota',
          done: 'done',
          failed: 'failed',
          canceled: 'canceled',
        },
        stop: 'Stop',
      },
      neurons: {
        lead: 'Each neuron, its role and what you can change. Removing deletes its application and data.',
        none: 'No neurons yet.',
        open: 'Open',
        rename: 'Rename',
        name: 'Name',
        save: 'Save',
        cancel: 'Cancel',
        role: 'Role',
        weight: (w: number) => `weight ${w.toLocaleString('en')}`,
        noApp: 'no application',
        remove: 'Remove',
        confirmTitle: (name: string) => `Remove ${name}?`,
        confirmText: 'Deletes its application, data, permissions and links. This cannot be undone.',
        confirm: 'Remove for good',
        removed: (name: string) => `${name} was removed.`,
      },
      failed: (why: string) => `It did not work: ${why}`,
    },
    devices: {
      title: 'Devices',
      lead: 'Who can enter the Cerebro. Each device has its own key; revoking takes it out at once.',
      unknown: 'Device from before this version',
      kind: { phone: 'Phone', tablet: 'Tablet', computer: 'Computer' },
      thisOne: 'this one',
      revoke: 'Revoke',
      seen: (when: string) => `seen ${when}`,
      now: 'now',
      pair: 'Pair a phone',
      pairTitle: "Point the phone's camera at the code",
      pairOnce: 'Works once',
      pairCode: 'Pairing code',
      pairDone: 'Phone paired.',
      pairExpired: 'The code expired. Make another when the phone is at hand.',
      cancel: 'Cancel',
      needRemote: 'To pair a phone, first turn on access from outside home.',
      onlyHere: 'Pairing and remote access are changed on the Cerebro computer itself.',
      remoteTitle: 'Access from outside home',
      remote: {
        'not-installed':
          'To open the Cerebro on your phone outside home, install Tailscale on this computer and on the phone, and sign in with the same account on both. It makes a network of your own: nothing is open on the internet.',
        'signed-out':
          'Tailscale is installed, but not signed in on this computer. Sign in and come back.',
        ready: (host: string) => `Tailscale ready on this computer (${host}).`,
        notRunning: (why: string) =>
          `Tailscale on this computer is not connected${why ? ` (${why})` : ''}. Reconnect it from its icon near the clock and come back.`,
        serving: (url: string) => `On: ${url}, only for your devices.`,
      },
      download: 'Download Tailscale',
      turnOn: 'Turn on remote access',
      enableFirst:
        'One thing first, only once: allow Serve in your Tailscale network. Then tap Turn on again.',
      enable: 'Allow in Tailscale',
      turnOff: 'Turn off',
      failed: (detail: string) => `Could not turn it on: ${detail}`,
      welcome: 'This device entered the Cerebro',
      installIos: 'To use it as an app, tap Share and then Add to Home Screen.',
      installOther: "To use it as an app, install it from the browser's menu.",
      install: 'Install the Cerebro',
      openMemory: 'Open the Memória',
    },
    locked:
      'To enter, open the link shown in the terminal where the Cerebro was started. On a phone, pair it from the computer, in Devices.',
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
