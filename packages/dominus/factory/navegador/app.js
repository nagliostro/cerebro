// The Navegador, a craft neuron that comes with the Cerebro: the researches it did for copies,
// newest first, as the Dominus recorded them (the feature, where from, what was found).
const pt = navigator.language.toLowerCase().startsWith('pt');
const t = pt
  ? {
      lead: 'As pesquisas que fiz para copiar funções, numa janela própria, sem as suas contas.',
      none: 'Nenhuma pesquisa ainda. Peça ao Dominus para copiar uma função de um site.',
      found: (c, r, s) =>
        `${c} ${c === 1 ? 'caso' : 'casos'} no gabarito · ${r} ${r === 1 ? 'regra' : 'regras'} · ${s} ${s === 1 ? 'site' : 'sites'}`,
    }
  : {
      lead: 'The researches I did to copy features, in a window of my own, without your accounts.',
      none: 'No research yet. Ask the Dominus to copy a feature from a site.',
      found: (c, r, s) =>
        `${c} answer key ${c === 1 ? 'case' : 'cases'} · ${r} ${r === 1 ? 'rule' : 'rules'} · ${s} ${s === 1 ? 'site' : 'sites'}`,
    };

const list = document.getElementById('list');
document.getElementById('lead').textContent = t.lead;

const line = (text, strong) => {
  const p = document.createElement('p');
  p.textContent = text;
  if (strong) p.className = 'cb-forte';
  return p;
};

async function show() {
  const items = await cerebro.data('researches').list();
  if (!items.length) {
    list.replaceChildren(line(t.none));
    return;
  }
  list.replaceChildren(
    ...items.map(({ data }) => {
      const li = document.createElement('li');
      const date = new Date(`${data.date}T12:00:00`).toLocaleDateString(navigator.language);
      li.append(
        line(data.feature, true),
        line(`${data.target} · ${date}`),
        line(t.found(data.cases, data.rules, data.sites.length)),
        line(data.sites.join(', ')),
      );
      return li;
    }),
  );
}
show();
