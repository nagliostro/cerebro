import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { coreRequest } from '@cerebro/dominus/client';
import { corePaths } from '@cerebro/dominus/paths';
import { expect, test as setup } from '@playwright/test';

import { issueLaunchKey } from '../lib/server/session';
import { E2E_DATA_DIR, SIGNED_IN } from '../playwright.config';

// Before every screen test: a small graph in the Memória, made through the core's own API
// (only once per run: each run starts from an empty data folder), an application for Finanças (as
// the Builder would write it, with the kit and the bridge), and a signed-in browser.

const APP = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="/neuron-kit/base.css" />
    <script src="/neuron-kit/cerebro.js"></script>
    <script src="/neuron-kit/icons.js"></script>
  </head>
  <body>
    <main>
      <div class="cb-linha">
        <p class="cb-forte">Gastos</p>
        <button class="cb-botao" id="novo"><i data-icon="plus"></i>Novo gasto</button>
      </div>
      <form id="form" hidden>
        <div class="cb-campo"><input id="desc" placeholder=" " required /><label for="desc">Descrição</label></div>
        <button class="cb-botao" type="submit">Salvar</button>
      </form>
      <ul class="cb-lista" id="lista"></ul>
      <p id="probe"></p>
    </main>
    <script>
      const gastos = cerebro.data('gastos');
      const lista = document.getElementById('lista');
      async function show() {
        lista.replaceChildren(...(await gastos.list()).map((g) => {
          const li = document.createElement('li');
          li.textContent = g.data.desc;
          return li;
        }));
      }
      document.getElementById('novo').onclick = () => (document.getElementById('form').hidden = false);
      document.getElementById('form').onsubmit = async (e) => {
        e.preventDefault();
        await gastos.create({ desc: document.getElementById('desc').value });
        e.target.reset();
        cerebro.notify('Gasto salvo');
        show();
      };
      // What an isolated application can reach on its own: nothing.
      const probe = [];
      try { parent.document.title; probe.push('page'); } catch {}
      try { localStorage.length; probe.push('storage'); } catch {}
      try { document.cookie; probe.push('cookie'); } catch {}
      fetch('/api/neurons/financas/permissions').then(() => probe.push('network'), () => {}).finally(() =>
        setTimeout(() => (document.getElementById('probe').textContent = 'reached: ' + (probe.join(',') || 'nothing')), 300));
      show();
    </script>
  </body>
</html>
`;

type Graph = { neurons: { id: string; name: string }[] };
const SAMPLE = [
  { name: 'Finanças', role: 'life' },
  { name: 'Agenda', role: 'life' },
  { name: 'Leituras', role: 'life' },
  { name: 'Pesquisa', role: 'craft' },
];

setup('a sample graph, made through the core', async () => {
  const paths = corePaths(E2E_DATA_DIR);
  const call = <T>(method: 'GET' | 'POST', path: string, body?: unknown) =>
    coreRequest<T>(method, path, body, paths);
  const have = new Set((await call<Graph>('GET', '/graph')).neurons.map((n) => n.name));
  for (const n of SAMPLE) if (!have.has(n.name)) await call('POST', '/graph/neurons', n);
  await call('POST', '/graph/conversations', { a: 'financas', b: 'agenda' });
  await call('POST', '/graph/conversations', { a: 'financas', b: 'dominus' });
  await call('POST', '/graph/links', { reader: 'financas', target: 'agenda' });
  const dir = path.join(E2E_DATA_DIR, 'neurons', 'financas', 'app');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), APP);
});

setup('sign in with the key from the terminal', async ({ page }) => {
  await page.goto(`/?key=${await issueLaunchKey()}`);
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Dominus' })).toBeVisible();
  await page.context().storageState({ path: SIGNED_IN });
});
