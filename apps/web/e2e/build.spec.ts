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

test('two screens of the owner follow the same plan at once', async ({ page, context }) => {
  // The computer and the phone: what one asks, builds or stops, the other shows without a reload.
  const other = await context.newPage();
  await page.goto('/');
  await other.goto('/');
  await ask(page, 'Diário: as notas do dia');
  await expect(plan(other)).toContainText('Diário');
  await plan(other).getByRole('button', { name: 'Construir' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Construindo' })).toBeVisible();
  await page.getByRole('button', { name: 'Parar' }).click();
  await expect(other.getByText('Construção cancelada. Nada foi criado.')).toBeVisible();
  await other.close();
});

test('a neuron without an application gets its first one from its own screen', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'build-desktop', 'one neuron, one build');
  await page.goto('/neuron/pesquisa');
  await expect(page.getByText('A aplicação de Pesquisa ainda não foi construída.')).toBeVisible();
  // The pencil opens its adjustments, as in the Cerebro before; no box at the foot.
  await expect(page.getByRole('textbox', { name: 'Fale com Pesquisa' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ajustar Pesquisa' }).click();
  const adjustments = page.getByRole('region', { name: 'Conversa com Pesquisa' });
  await expect(adjustments).toContainText('Oi, eu sou Pesquisa.');
  await ask(page, 'uma lista de fontes para consultar', 'Fale com Pesquisa');
  await expect(plan(page)).toContainText('Pesquisa');
  await plan(page).getByRole('button', { name: 'Ajustar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Pesquisa · ajustado' })).toBeVisible({
    timeout: 20_000,
  });
  const asked = page.frameLocator('iframe').locator('#asked');
  await expect(asked).toHaveText('uma lista de fontes para consultar');
  // A first application has nothing to go back to; an adjustment of it does.
  await expect(page.getByRole('button', { name: 'Desfazer' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  // A question is answered in the conversation, with no plan.
  await ask(page, 'De onde vêm as fontes?', 'Fale com Pesquisa');
  await expect(adjustments).toContainText('Pesquisa answers (cheap): De onde vêm as fontes?');
  await expect(adjustments).toContainText('resposta direta');
  await expect(plan(page)).toHaveCount(0);
  // A change is a plan, inside the conversation, decided there.
  await ask(page, 'com uma nota em cada fonte', 'Fale com Pesquisa');
  await expect(adjustments.getByRole('region', { name: 'Plano' })).toBeVisible();
  await plan(page).getByRole('button', { name: 'Ajustar' }).click();
  await expect(asked).toHaveText('com uma nota em cada fonte', { timeout: 20_000 });
  // Both requests are in its conversation, the newest last, with Undo on it.
  await expect(adjustments).toContainText('uma lista de fontes para consultar');
  await adjustments.getByRole('button', { name: 'Desfazer' }).click();
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

test('a copy is researched: the answer key, rules with their sources, then checked when built', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'build-desktop', 'one copy, one build');
  await page.goto('/');
  await ask(page, 'copie o simulador de https://invest.example.com/sim');
  await expect(plan(page)).toContainText('Gabarito · 2 casos', { timeout: 20_000 });
  await expect(plan(page)).toContainText('2 observados no original');
  await expect(plan(page)).toContainText('The rate is 10.65% a year · help.example.com');
  await expect(plan(page)).toContainText('The rate changes every day');
  await expect(plan(page)).toContainText('invest.example.com');
  await expect(plan(page)).toContainText('Pesquisar e planejar custou US$ 0,00');
  await expect(page.getByRole('link', { name: 'help.example.com' })).toHaveAttribute(
    'href',
    'https://help.example.com/rate',
  );
  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  await plan(page)
    .getByRole('checkbox', { name: /Compare with savings/ })
    .check();
  await plan(page).getByRole('button', { name: 'Construir' }).click();
  await expect(page.getByText('2 de 2 casos do gabarito batem')).toBeVisible({ timeout: 50_000 });
  await page.getByRole('button', { name: 'Fechar' }).click();
});

test('a vague copy asks which feature, as a choice, and goes on with it', async ({ page }) => {
  await page.goto('/');
  await ask(page, 'copie esse app https://invest.example.com [ask-which]');
  await expect(plan(page)).toContainText('Qual função copiar?', { timeout: 20_000 });
  const options = plan(page).getByRole('radio');
  await expect(options).toHaveCount(2);
  // A long option is a choice box: all its words in view, none cut.
  await expect(options.nth(1)).toContainText('after taxes and fees');
  const cut = await options
    .nth(1)
    .evaluate((el) => [...el.querySelectorAll('span')].some((s) => s.scrollWidth > s.clientWidth));
  expect(cut).toBe(false);
  await expect(options.first()).toHaveAttribute('aria-checked', 'true');
  await options.first().press('ArrowRight');
  await expect(options.nth(1)).toHaveAttribute('aria-checked', 'true');
  await options.first().click();
  await plan(page).getByRole('button', { name: 'Pesquisar esta' }).click();
  // The research goes on with the answer, then the plan comes.
  await expect(plan(page)).toContainText('Gabarito · 2 casos', { timeout: 20_000 });
  await expect(plan(page)).toContainText('Você disse: Yield simulator');
  await plan(page).getByRole('button', { name: 'Rejeitar' }).click();
});

test('a crowded research spreads its steps: no label touches another; the plan wraps its text', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'build-desktop', 'labels show from 820px');
  await page.goto('/');
  // Many long searches, and a long link with no space in it.
  const link = `https://app.example.com/${'categorias-de-despesas-'.repeat(6)}fim`;
  await ask(page, `copie as categorias de ${link} [searches:12]`);
  const labels = page.locator('span[title]');
  const measure = async () => {
    const boxes = await labels.evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    for (const [i, a] of boxes.entries())
      for (const b of boxes.slice(i + 1))
        expect(
          a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h,
          `${JSON.stringify(a)} and ${JSON.stringify(b)} overlap`,
        ).toBe(false);
    return boxes.length;
  };
  await expect.poll(() => labels.count(), { timeout: 20_000 }).toBeGreaterThan(8);
  expect(await measure()).toBeGreaterThan(8);
  await expect(plan(page)).toContainText('Gabarito', { timeout: 30_000 });
  await measure();
  // The plan's text fits its panel: only the vertical scroll, never a sideways one.
  const fits = await plan(page)
    .locator('> div')
    .first()
    .evaluate((el) => el.scrollWidth <= el.clientWidth);
  expect(fits).toBe(true);
  await plan(page).getByRole('button', { name: 'Rejeitar' }).click();
});

test('a neuron that reads the internet shows the globe: its sites, and the owner takes one away', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'build-desktop', 'one neuron, one build');
  await page.goto('/');
  await ask(page, 'Cotação: a do dólar no dia [net:api.example.com]');
  await expect(plan(page)).toContainText('Internet');
  await expect(plan(page)).toContainText('api.example.com');
  await plan(page).getByRole('button', { name: 'Construir' }).click();
  await page.getByRole('link', { name: /^Abrir / }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Internet de Cotação' }).click();
  const globe = page.getByRole('region', { name: 'Internet de Cotação' });
  await expect(globe).toContainText('api.example.com');
  await expect(globe).toContainText('Liberado · ainda não acessado');
  // The screen with the globe and the adjustments open passes WCAG 2.2 AA.
  await page.getByRole('button', { name: 'Ajustar Cotação' }).click();
  await expect(page.getByRole('region', { name: 'Conversa com Cotação' })).toContainText(
    'Cotação: a do dólar no dia',
  );
  await page.getByRole('button', { name: 'Internet de Cotação' }).click();
  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  await globe.getByRole('button', { name: 'Tirar: api.example.com' }).click();
  // No site left: no globe.
  await expect(page.getByRole('button', { name: 'Internet de Cotação' })).toHaveCount(0);
});

test('passes WCAG 2.2 AA with the plan open', async ({ page }) => {
  await page.goto('/');
  await ask(page, 'Música: as aulas da semana');
  await expect(plan(page)).toContainText('Música');
  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  await plan(page).getByRole('button', { name: 'Rejeitar' }).click();
});
