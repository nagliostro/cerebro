import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { SIGNED_IN } from '../playwright.config';

// The Memória of a signed-in browser (with the sample graph of sign-in.setup.ts): the Dominus at
// the center and the neurons around it, nothing scrolls sideways, and it passes WCAG 2.2 AA.

test.describe('memória', () => {
  test.use({ locale: 'pt-BR', extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9' } });

  test('shows the Dominus and the neurons; the Dominus reveals the status on touch', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Cerebro');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');

    const dominus = page.getByRole('button', { name: 'Dominus' });
    await expect(dominus).toBeVisible();
    // The Dominus and the four neurons, nothing else to touch.
    await expect(page.getByRole('button')).toHaveCount(5);

    const status = page.locator('#dominus-status');
    await expect(status).toBeHidden();
    await dominus.click();
    await expect(dominus).toHaveAttribute('aria-expanded', 'true');
    await expect(status).toContainText('Cerebro 0.1.0');
    await expect(status).toContainText('Seus dados ficam em');
    await expect(status).toContainText('Nenhuma IA conectada ainda');
    // The Dominus core answered: it checked the (absent, in the tests) Claude Code.
    await expect(status).toContainText('Claude Code não está instalado neste computador');
    await expect(status).toContainText('4 neurônios · 1 de ofício');

    await page.keyboard.press('Escape');
    await expect(status).toBeHidden();
  });

  test('the Dominus is at least 44px to touch and centered', async ({ page }) => {
    await page.goto('/');
    const box = (await page.getByRole('button', { name: 'Dominus' }).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    const viewport = page.viewportSize()!;
    expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
  });

  test('no sideways scroll, even with the status open', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Dominus' }).click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('passes WCAG 2.2 AA, closed and open', async ({ page }) => {
    await page.goto('/');
    const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Dominus' }).click();
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  });
});

test('English when the browser does not speak Portuguese', async ({ browser }) => {
  const context = await browser.newContext({
    storageState: SIGNED_IN,
    locale: 'de-DE',
    extraHTTPHeaders: { 'Accept-Language': 'de-DE,de;q=0.9' },
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: 'Dominus' }).click();
  await expect(page.locator('#dominus-status')).toContainText('No AI connected yet');
  await context.close();
});
