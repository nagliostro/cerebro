import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { issueLaunchKey } from '../lib/server/session';

// The door: no session shows only the locked screen; a key from the terminal works once and
// leaves the address bar; other hosts and other origins are refused.

test.describe('without a session', () => {
  test.use({
    storageState: { cookies: [], origins: [] },
    locale: 'pt-BR',
    extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9' },
  });

  test('every page leads to the locked screen, with nothing to touch', async ({ page }) => {
    for (const path of ['/', '/anything']) {
      await page.goto(path);
      await expect(page).toHaveURL('/locked');
      await expect(page.getByText('abra o link que apareceu no terminal')).toBeVisible();
      await expect(page.getByRole('img', { name: 'Dominus' })).toBeVisible();
      await expect(page.getByRole('button')).toHaveCount(0);
    }
  });

  test('the locked screen passes WCAG 2.2 AA', async ({ page }) => {
    await page.goto('/locked');
    const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  });

  test('the API answers 401', async ({ request }) => {
    expect((await request.get('/api/anything')).status()).toBe(401);
  });

  test('only what a phone needs to install the Cerebro opens without a session', async ({
    request,
  }) => {
    const manifest = await request.get('/manifest.webmanifest');
    expect(manifest.status()).toBe(200);
    expect(await manifest.json()).toMatchObject({ name: 'Cerebro', display: 'standalone' });
    for (const path of [
      '/sw.js',
      '/offline.html',
      '/pwa/icon-192.png',
      '/pwa/apple-touch-icon.png',
    ])
      expect((await request.get(path)).status(), path).toBe(200);
    for (const path of ['/api/devices', '/api/pair', '/api/remote'])
      expect((await request.get(path)).status(), path).toBe(401);
    expect((await request.get('/devices', { maxRedirects: 0 })).status()).toBe(307);
  });

  test('a key works once and never stays in the address bar', async ({ page, browser }) => {
    const key = await issueLaunchKey();
    await page.goto(`/?key=${key}`);
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('button', { name: 'Dominus' })).toBeVisible();

    // A second browser with the same key stays outside.
    const other = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const second = await other.newPage();
    await second.goto(`/?key=${key}`);
    await expect(second).toHaveURL('/locked');
    await expect(second.getByRole('img', { name: 'Dominus' })).toBeVisible();
    await other.close();
  });

  test('the session cookie is out of reach of page scripts and of other sites', async ({
    request,
  }) => {
    const res = await request.get(`/?key=${await issueLaunchKey()}`, { maxRedirects: 0 });
    expect(res.status()).toBe(303);
    expect(res.headers()['location']).toBe('/');
    // Checked as sent: WebKit on Windows reports every cookie as SameSite=None.
    const cookie = res.headers()['set-cookie'] ?? '';
    expect(cookie).toMatch(/^cerebro_session=[\w-]{43};/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  test('a wrong key changes nothing', async ({ page }) => {
    await page.goto('/?key=wrong');
    await expect(page).toHaveURL('/locked');
    await expect(page.getByRole('img', { name: 'Dominus' })).toBeVisible();
  });
});

test('with a session, the locked screen leads home', async ({ page }) => {
  await page.goto('/locked');
  await expect(page).toHaveURL('/');
});

test('another host is refused (DNS rebinding)', async ({ request }) => {
  const res = await request.get('/', { headers: { Host: 'attacker.example:3100' } });
  expect(res.status()).toBe(403);
});

test('a change from another site is refused (CSRF)', async ({ request }) => {
  const foreign = await request.post('/', { headers: { Origin: 'https://attacker.example' } });
  expect(foreign.status()).toBe(403);
  const noOrigin = await request.post('/');
  expect(noOrigin.status()).toBe(403);
});
