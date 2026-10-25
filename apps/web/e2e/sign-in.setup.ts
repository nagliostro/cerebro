import { coreRequest } from '@cerebro/dominus/client';
import { corePaths } from '@cerebro/dominus/paths';
import { expect, test as setup } from '@playwright/test';

import { issueLaunchKey } from '../lib/server/session';
import { E2E_DATA_DIR, SIGNED_IN } from '../playwright.config';

// Before every screen test: a small graph in the Memória, made through the core's own API
// (only once; the data folder lasts between runs), and a signed-in browser.

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
});

setup('sign in with the key from the terminal', async ({ page }) => {
  await page.goto(`/?key=${await issueLaunchKey()}`);
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Dominus' })).toBeVisible();
  await page.context().storageState({ path: SIGNED_IN });
});
