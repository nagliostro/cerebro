import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Building neurons with the simulated AI (it plans, asks when a request is too short, and writes a
// small application with the kit): from the Dominus box to the new neuron's application, and the
// ways out (reject, stop). These run after every other screen test, since they change the graph.

test.use({ locale: 'pt-BR', extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9' } });

const ask = async (page: Page, text: string, box = 'Peça ao Dominus') => {
  const field = page.getByRole('textbox', { name: box });
  await field.fill(text);
  await expect(page.getByRole('button', { name: 'Enviar' })).toBeVisible();
  await field.press('Enter');
};
const plan = (page: Page) => page.getByRole('region', { name: 'Plano' });

test('a short request gets questions; answered, the plan is built into a neuron', async ({
  page,
}) => {
  await page.goto('/');
  await ask(page, 'horta');
  await expect(plan(page)).toContainText('Faltam detalhes');
  await expect(plan(page)).toContainText('What should it keep track of?');
  // The open plan survives a reload: it lives in the core, not in the page.
  await page.reload();
  await expect(plan(page)).toContainText('Faltam detalhes');
  await plan(page).getByLabel('Suas respostas').fill('regar toda semana');
  await plan(page).getByRole('button', { name: 'Responder' }).click();
  await expect(plan(page)).toContainText('Você disse: regar toda semana');

  // A ready plan can still be changed before building.
  await plan(page).getByRole('button', { name: 'Alterar' }).click();
  await plan(page).getByLabel('O que mudar no plano').fill('com fotos');
  await plan(page).getByRole('button', { name: 'Refazer o plano' }).click();
  await expect(plan(page)).toContainText('Você disse: com fotos');
  await expect(plan(page)).toContainText('Pensar custou US$ 0,00');
  await expect(plan(page)).toContainText('Construir: sem estimativa ainda');

  await plan(page).getByRole('button', { name: 'Construir' }).click();
  await expect(plan(page)).toBeHidden();
  const caption = page.getByRole('status').filter({ hasText: 'Construindo' });
  await expect(caption).toBeVisible();
  await expect(page.getByRole('button', { name: 'Parar' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'neurônio criado' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('Construir custou US$ 0,00')).toBeVisible();
  // The new neuron is in the Memória, and its application opens with the kit and the bridge.
  await page.getByRole('link', { name: /^Abrir / }).click();
  await expect(page).toHaveURL(/\/neuron\/horta/);
  const app = page.frameLocator('iframe');
  await app.getByLabel('Item').fill('tomate');
  await app.getByRole('button', { name: 'Add' }).click();
  await expect(app.getByText('tomate')).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('link', { name: /^Horta/ }).first()).toBeAttached();
});

test('a plan can be rejected, and a build stopped: nothing is created', async ({ page }) => {
  await page.goto('/');
  const before = await page.locator('[data-neuron]').count();
  await ask(page, 'Leitura: os livros do ano');
  await expect(plan(page)).toContainText('Leitura');
  await plan(page).getByRole('button', { name: 'Rejeitar' }).click();
  await expect(plan(page)).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Peça ao Dominus' })).toBeVisible();

  await ask(page, 'Parada: algo para cancelar');
  await plan(page).getByRole('button', { name: 'Construir' }).click();
  await page.getByRole('button', { name: 'Parar' }).click();
  await expect(page.getByText('Construção cancelada. Nada foi criado.')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-neuron]')).toHaveCount(before);
  // ↑ ↓ bring back what was asked, as in a terminal.
  const box = page.getByRole('textbox', { name: 'Peça ao Dominus' });
  await box.focus();
  await box.press('ArrowUp');
  await expect(box).toHaveValue('Parada: algo para cancelar');
  await box.press('ArrowUp');
  await expect(box).toHaveValue('Leitura: os livros do ano');
  await box.press('ArrowDown');
  await box.press('ArrowDown');
  await expect(box).toHaveValue('');
});

test('a neuron without an application gets its first one from its own screen', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'build-desktop', 'one neuron, one build');
  await page.goto('/neuron/pesquisa');
  await expect(page.getByText('A aplicação de Pesquisa ainda não foi construída.')).toBeVisible();
  await ask(page, 'uma lista de fontes para consultar', 'Peça um ajuste a Pesquisa');
  await expect(plan(page)).toContainText('Pesquisa');
  await plan(page).getByRole('button', { name: 'Ajustar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Pesquisa · ajustado' })).toBeVisible({
    timeout: 20_000,
  });
  const asked = page.frameLocator('iframe').locator('#asked');
  await expect(asked).toHaveText('uma lista de fontes para consultar');
  // A first application has nothing to go back to; an adjustment of it does.
  await expect(page.getByRole('button', { name: 'Desfazer' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Fechar' }).click();
  await ask(page, 'com uma nota em cada fonte', 'Peça um ajuste a Pesquisa');
  await plan(page).getByRole('button', { name: 'Ajustar' }).click();
  await expect(asked).toHaveText('com uma nota em cada fonte', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Desfazer' }).click();
  await expect(
    page.getByText('Pesquisa · ajuste desfeito, a versão anterior voltou'),
  ).toBeVisible();
  await expect(asked).toHaveText('uma lista de fontes para consultar');
});

test('when an existing neuron already does it, the plan offers to adjust that one', async ({
  page,
}) => {
  await page.goto('/');
  await ask(page, 'Compromissos: os do mês [existing:agenda]');
  await expect(plan(page)).toContainText('Agenda já parece cuidar disso.');
  await expect(plan(page).getByRole('button', { name: 'Construir' })).toHaveCount(0);
  await plan(page).getByRole('button', { name: 'Ajustar Agenda' }).click();
  await expect(page).toHaveURL('/neuron/agenda');
  await expect(plan(page).getByRole('button', { name: 'Ajustar' })).toBeVisible();
  await plan(page).getByRole('button', { name: 'Rejeitar' }).click();
  await expect(plan(page)).toBeHidden();
});

test('passes WCAG 2.2 AA with the plan open', async ({ page }) => {
  await page.goto('/');
  await ask(page, 'Música: as aulas da semana');
  await expect(plan(page)).toContainText('Música');
  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  await plan(page).getByRole('button', { name: 'Rejeitar' }).click();
});
