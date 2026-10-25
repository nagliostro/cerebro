import { expect, test, type Page } from '@playwright/test';

// The Memória's gestures, on the sample graph of sign-in.setup.ts.

test.use({ locale: 'pt-BR', extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9' } });

const center = async (page: Page, name: RegExp) => {
  const b = (await page.getByRole('link', { name }).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Each test starts from the first places, whatever an earlier one left in this browser.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('link', { name: /^Finanças/ })).toBeVisible();
});

test('a neuron says its weight, and touching it opens its application', async ({ page }) => {
  const financas = page.getByRole('link', { name: /^Finanças/ });
  await expect(financas).toHaveAccessibleName('Finanças, peso 2');
  await financas.click();
  await expect(page).toHaveURL('/neuron/financas');
});

test('dragging a neuron moves only that one, and it stays there', async ({ page }) => {
  const a0 = await center(page, /^Finanças/);
  const b0 = await center(page, /^Agenda/);
  await page.mouse.move(a0.x, a0.y);
  await page.mouse.down();
  await page.mouse.move(a0.x - 80, a0.y + 60, { steps: 8 });
  await page.mouse.up();
  const a1 = await center(page, /^Finanças/);
  expect(Math.hypot(a1.x - a0.x + 80, a1.y - a0.y - 60)).toBeLessThan(12);
  expect(await center(page, /^Agenda/)).toEqual(b0);
  // A drag is not a touch: it moved the neuron, it did not open it.
  await expect(page).toHaveURL('/');
  await page.reload();
  const a2 = await center(page, /^Finanças/);
  expect(Math.hypot(a2.x - a1.x, a2.y - a1.y)).toBeLessThan(2);
});

// On the empty sky at the top: the foot has the Dominus box.
test('dragging the sky turns everything; a double click goes back', async ({ page }) => {
  const a0 = await center(page, /^Finanças/);
  const vp = page.viewportSize()!;
  await page.mouse.move(vp.width / 2 + 5, 60);
  await page.mouse.down();
  await page.mouse.move(vp.width / 2 + 160, 60, { steps: 8 });
  await page.mouse.up();
  const a1 = await center(page, /^Finanças/);
  expect(Math.hypot(a1.x - a0.x, a1.y - a0.y)).toBeGreaterThan(10);
  await page.mouse.dblclick(vp.width / 2 + 5, 60);
  const a2 = await center(page, /^Finanças/);
  expect(Math.hypot(a2.x - a0.x, a2.y - a0.y)).toBeLessThan(2);
});

test('the keyboard turns the sky and moves a neuron closer', async ({ page }) => {
  const financas = page.getByRole('link', { name: /^Finanças/ });
  await financas.focus();
  const w0 = (await financas.boundingBox())!.width;
  await page.keyboard.press('PageUp');
  await page.keyboard.press('PageUp');
  expect((await financas.boundingBox())!.width).toBeGreaterThan(w0);
  const a0 = await center(page, /^Agenda/);
  await page.keyboard.press('ArrowRight');
  expect(await center(page, /^Agenda/)).not.toEqual(a0);
});
