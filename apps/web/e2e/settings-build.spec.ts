import { coreRequest } from '@cerebro/dominus/client';
import { corePaths } from '@cerebro/dominus/paths';
import { expect, test } from '@playwright/test';

import { E2E_DATA_DIR } from '../playwright.config';

// What Settings changes: a neuron renamed, moved to craft and removed for good; the research
// depth; an API connection added and removed. They run with the build tests, after the screens
// that count neurons.

test.use({ locale: 'pt-BR', extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9' } });

const core = <T>(method: 'GET' | 'POST', path: string, body?: unknown) =>
  coreRequest<T>(method, path, body, corePaths(E2E_DATA_DIR));

test('a neuron is renamed, becomes craft, and is removed after a confirmation', async ({
  page,
}, info) => {
  const name = `Rascunho ${info.project.name.split('-')[1]}`;
  const { id } = await core<{ id: string }>('POST', '/graph/neurons', { name });
  await page.goto('/settings/neurons');
  await page.getByRole('button', { name: `Renomear: ${name}` }).click();
  await page.getByLabel('Nome', { exact: true }).fill(`${name} novo`);
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('link', { name: `${name} novo` })).toBeVisible();

  const roles = page.getByRole('radiogroup', { name: `Papel: ${name} novo` });
  await roles.getByRole('radio', { name: 'ofício' }).click();
  await expect(roles.getByRole('radio', { name: 'ofício' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect((await core<{ role: string }>('GET', `/neurons/${id}`)).role).toBe('craft');

  // Removing asks first, and says what goes away; canceling keeps it.
  await page.getByRole('button', { name: `Excluir: ${name} novo` }).click();
  const dialog = page.getByRole('dialog', { name: `Excluir ${name} novo?` });
  await expect(dialog).toContainText('Não dá para desfazer.');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('link', { name: `${name} novo` })).toBeVisible();
  await page.getByRole('button', { name: `Excluir: ${name} novo` }).click();
  await dialog.getByRole('button', { name: 'Excluir de vez' }).click();
  await expect(page.getByRole('status').first()).toHaveText(`${name} novo foi excluído.`);
  await expect(page.getByRole('link', { name: `${name} novo` })).toHaveCount(0);
  // And the Memória no longer has it.
  await page.goto('/');
  await expect(page.locator(`[data-neuron="${id}"]`)).toHaveCount(0);
});

test('the research depth is saved and stays after a reload', async ({ page }) => {
  await page.goto('/settings');
  const depth = page.getByRole('radiogroup', { name: 'Profundidade da pesquisa' });
  // Its own status: the page has others (how to install the app, on a browser that asks).
  const saved = page.getByRole('region', { name: 'Profundidade da pesquisa' }).getByRole('status');
  await depth.getByRole('radio', { name: /Funda/ }).click();
  await expect(saved).toHaveText('Salvo.');
  await page.reload();
  await expect(depth.getByRole('radio', { name: /Funda/ })).toHaveAttribute('aria-checked', 'true');
  expect(await core('GET', '/settings')).toEqual({ depth: 'deep' });
  await depth.getByRole('radio', { name: /Média/ }).click();
  await expect(saved).toHaveText('Salvo.');
});

test('an API connection is added from a preset and removed', async ({ page }) => {
  await page.goto('/settings/connections');
  await page.getByRole('button', { name: 'Conectar uma API' }).click();
  await page.getByLabel('Provedor').selectOption('ollama');
  await expect(page.getByLabel('Endereço')).toHaveValue('http://localhost:11434/v1');
  // A local server needs no key: no key field, nothing for the vault.
  await expect(page.getByLabel('Chave da API')).toHaveCount(0);
  await page.getByRole('button', { name: 'Salvar' }).click();
  const apis = page.getByRole('region', { name: 'APIs' });
  await expect(apis).toContainText('Ollama');
  await expect(apis).toContainText('local, sem custo');
  await apis.getByRole('button', { name: 'Remover: Ollama' }).click();
  await apis.getByRole('button', { name: 'Remover', exact: true }).click();
  await expect(apis).toContainText('Nenhuma API conectada.');
});

test('Processes: each request through its stages, newest first; one built opens its neuron', async ({
  page,
}) => {
  await page.goto('/settings/processes');
  // The garden of build.spec.ts: asked, answered, planned, built.
  // Each request is a <details>; opened here without toggling (the newest is open already).
  const entry = (text: string) => page.locator('details').filter({ hasText: text }).first();
  const garden = entry('regar toda semana');
  await garden.evaluate((d) => ((d as HTMLDetailsElement).open = true));
  await expect(garden).toContainText('Neurônio criado');
  for (const stage of ['Pedido', 'Plano', 'Construção', 'Saída'])
    await expect(garden).toContainText(stage);
  await expect(garden).toContainText('Você disse: regar toda semana');
  // A copy shows its research.
  const copy = entry('invest.example.com [ask-which]');
  await copy.evaluate((d) => ((d as HTMLDetailsElement).open = true));
  await expect(copy).toContainText('casos no gabarito');
  // A rejected one says so.
  await expect(entry('Rejeitado')).toBeAttached();
  await garden.getByRole('link', { name: /^Abrir / }).click();
  await expect(page).toHaveURL(/\/neuron\//);
});

test('the screens language is chosen per device, and back to the browser one', async ({ page }) => {
  await page.goto('/settings');
  const language = page.getByRole('radiogroup', { name: 'Idioma' });
  await language.getByRole('radio', { name: 'English' }).click();
  // The page comes back in English, though the browser asks for Portuguese.
  await expect(page.getByRole('heading', { level: 1, name: 'General' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Ask the Dominus' })).toBeVisible();
  await page.goto('/settings');
  await page
    .getByRole('radiogroup', { name: 'Language' })
    .getByRole('radio', { name: /Automatic/ })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Geral' })).toBeVisible();
});
