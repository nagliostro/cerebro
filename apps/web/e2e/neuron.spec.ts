import AxeBuilder from '@axe-core/playwright';
import { coreRequest } from '@cerebro/dominus/client';
import { corePaths } from '@cerebro/dominus/paths';
import { expect, test } from '@playwright/test';

import { E2E_DATA_DIR } from '../playwright.config';

// A neuron's screen, with the sample application of sign-in.setup.ts: isolated, talking only
// through the bridge, and the permissions that only the owner changes.

test.use({ locale: 'pt-BR', extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9' } });

const core = <T>(method: 'GET' | 'POST', path: string, body?: unknown) =>
  coreRequest<T>(method, path, body, corePaths(E2E_DATA_DIR));

test('only its dot and name on top, the application below, and the way back', async ({ page }) => {
  await page.goto('/neuron/financas');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Finanças');
  const app = page.frameLocator('iframe[title="Aplicação Finanças"]');
  await expect(app.getByRole('button', { name: 'Novo gasto' })).toBeVisible();
  // The kit's icons are drawn inside it, with no network.
  await expect(app.getByRole('button', { name: 'Novo gasto' }).locator('svg path')).toHaveCount(2);
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('link', { name: 'Memória' }).click();
  await expect(page).toHaveURL('/');
});

test('the application keeps its data through the bridge, and says so at the foot', async ({
  page,
}, info) => {
  const desc = `Padaria ${info.project.name} ${Date.now()}`;
  await page.goto('/neuron/financas');
  const app = page.frameLocator('iframe[title="Aplicação Finanças"]');
  await app.getByRole('button', { name: 'Novo gasto' }).click();
  await app.getByLabel('Descrição').fill(desc);
  await app.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Gasto salvo' })).toBeVisible();
  await expect(app.getByText(desc)).toBeVisible();
  await page.reload();
  await expect(page.frameLocator('iframe').getByText(desc)).toBeVisible();
});

test('the application reaches nothing on its own: not the page, storage, cookies or network', async ({
  page,
}) => {
  await page.goto('/neuron/financas');
  await expect(page.frameLocator('iframe').locator('#probe')).toHaveText('reached: nothing');
});

test('its files come only with a valid signed link, sandboxed', async ({ page, request }) => {
  await page.goto('/neuron/financas');
  await expect(page.locator('iframe')).toHaveAttribute('src', /^\/apps\/financas\//);
  const src = (await page.locator('iframe').getAttribute('src'))!;
  const res = await request.get(src);
  expect(res.status()).toBe(200);
  const csp = res.headers()['content-security-policy']!;
  expect(csp).toContain('sandbox allow-scripts allow-forms allow-downloads');
  expect(csp).toContain("connect-src 'none'");
  expect((await request.get('/apps/financas/forged.token/')).status()).toBe(404);
  const folder = src.replace(/index\.html$/, '');
  expect((await request.get(`${folder}..%2F..%2Fsessions.json`)).status()).toBe(404);
  // Another neuron's link does not open this one.
  expect((await request.get(src.replace('/financas/', '/agenda/'))).status()).toBe(404);
  // The kit reaches the isolated application, its font included (fonts load only with CORS).
  const font = await request.get('/neuron-kit/geist-mono-500.woff2');
  expect(font.headers()['access-control-allow-origin']).toBe('*');
  // And so do its libraries (PDFs, ZIPs): the application has no network of its own.
  for (const lib of ['pdf-lib', 'jszip'])
    expect((await request.get(`/neuron-kit/lib/${lib}.min.js`)).status()).toBe(200);
});

test('the key: the owner allows another neuron, operation by operation, and revokes', async ({
  page,
}) => {
  test.skip(test.info().project.name !== 'chromium-desktop', 'changes shared state; one engine');
  await core('POST', '/neurons/financas/permissions', { revokeAll: true });
  await page.goto('/neuron/financas');
  await page.getByRole('button', { name: /Permissões/ }).click();
  const panel = page.getByRole('region', { name: 'Quem pode pedir coisas a Finanças' });
  await expect(panel).toContainText('Nenhum neurônio pode pedir coisas a Finanças ainda.');
  await panel.getByRole('button', { name: 'Liberar outro neurônio' }).click();
  await panel.getByRole('button', { name: 'Agenda' }).click();
  const view = panel.getByRole('group', { name: 'Agenda: gastos' }).getByRole('button', {
    name: 'Visualizar',
  });
  await view.click();
  await expect(view).toHaveAttribute('aria-pressed', 'true');
  expect(await core('GET', '/neurons/financas/permissions')).toEqual([
    { caller: 'agenda', collection: 'gastos', grants: ['view'] },
  ]);
  // Now Agenda may read the expenses, and only read them.
  await core('POST', '/neurons/agenda/call', { target: 'financas', operation: 'gastos.list' });
  await expect(
    core('POST', '/neurons/agenda/call', { target: 'financas', operation: 'gastos.create' }),
  ).rejects.toThrow(/403/);
  await panel.getByRole('button', { name: 'Revogar tudo' }).click();
  await expect(panel).toContainText('Nenhum neurônio pode pedir coisas a Finanças ainda.');
  expect(await core('GET', '/neurons/financas/permissions')).toEqual([]);
});

test('a neuron not built yet says so; an unknown one does not exist', async ({ page }) => {
  await page.goto('/neuron/pesquisa');
  await expect(page.getByText('A aplicação de Pesquisa ainda não foi construída.')).toBeVisible();
  expect((await page.goto('/neuron/ghost'))!.status()).toBe(404);
});

test('passes WCAG 2.2 AA, with the permissions open', async ({ page }) => {
  await page.goto('/neuron/financas');
  await page.getByRole('button', { name: /Permissões/ }).click();
  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
  const result = await new AxeBuilder({ page }).withTags(tags).exclude('iframe').analyze();
  expect(result.violations).toEqual([]);
});
