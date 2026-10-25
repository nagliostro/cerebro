import { expect, test as setup } from '@playwright/test';

import { issueLaunchKey } from '../lib/server/session';
import { SIGNED_IN } from '../playwright.config';

// Signs in like the owner: a one-time key (the one the terminal would show) opened in the
// browser. The tests write it straight to the data folder, which only the owner can do.
setup('sign in with the key from the terminal', async ({ page }) => {
  await page.goto(`/?key=${await issueLaunchKey()}`);
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Dominus' })).toBeVisible();
  await page.context().storageState({ path: SIGNED_IN });
});
