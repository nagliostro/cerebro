import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Settings, as it reads: the menu leads there, every section opens with its title, and each one
// passes WCAG 2.2 AA at every width. What changes things is in settings-build.spec.ts.

test.use({ locale: 'pt-BR', extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9' } });

const SECTIONS = [
  ['Geral', '/settings'],
  ['Conexões', '/settings/connections'],
  ['Uso', '/settings/usage'],
  ['Processos', '/settings/processes'],
  ['Execuções', '/settings/runs'],
  ['Neurônios', '/settings/neurons'],
  ['Aparelhos', '/settings/devices'],
] as const;
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('the menu leads to Settings, and every section opens and passes WCAG 2.2 AA', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('link', { name: 'Configurações' }).click();
  await expect(page).toHaveURL('/settings');
  const nav = page.getByRole('navigation', { name: 'Seções de Configurações' });
  for (const [name, url] of SECTIONS) {
    await nav.getByRole('link', { name }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(nav.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations, name).toEqual([]);
  }
});

test('the neurons are listed with their role, and the Dominus is not among them', async ({
  page,
}) => {
  await page.goto('/settings/neurons');
  await expect(page.getByRole('link', { name: 'Finanças' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Papel: Pesquisa' })).toContainText('ofício');
  await expect(page.getByRole('link', { name: 'Dominus' })).toHaveCount(0);
});

test('Connections shows the subscription; no key is ever on the page', async ({ page }) => {
  await page.goto('/settings/connections');
  await expect(page.getByRole('region', { name: 'Assinatura' })).toContainText('Claude Code');
  expect(await page.content()).not.toMatch(/sk-[A-Za-z0-9]{10,}/);
});
