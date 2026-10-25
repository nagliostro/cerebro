import { coreRequest, isCoreUp } from '@cerebro/dominus/client';
import { corePaths } from '@cerebro/dominus/paths';
import { expect, test } from '@playwright/test';

import { E2E_DATA_DIR } from '../playwright.config';

// When things go wrong: the Dominus core goes away, and the next screen brings it back with
// everything it had. Runs after the other screens: it stops the core they use.

test.use({ locale: 'pt-BR', extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9' } });

test('the core killed, the next screen starts it again, with the neurons where they were', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'build-desktop', 'stops the shared core');
  const paths = corePaths(E2E_DATA_DIR);
  const { pid } = await coreRequest<{ pid: number }>('GET', '/stats', undefined, paths);
  process.kill(pid);
  await expect.poll(() => isCoreUp(paths)).toBe(false);
  await page.goto('/');
  await expect(page.locator('[data-neuron]').first()).toBeAttached();
  await page.getByRole('button', { name: 'Dominus' }).click();
  await expect(page.locator('#dominus-status')).not.toContainText('não respondeu');
  const again = await coreRequest<{ pid: number }>('GET', '/stats', undefined, paths);
  expect(again.pid).not.toBe(pid);
});
