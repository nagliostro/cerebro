import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Devices and pairing, with a fake cloudflared (e2e/fake-cloudflared.mjs) signed in on "this
// computer": turn on access from outside home, pair a phone by its one-time code, see it in the
// list and revoke it. They run after the other screens: they change who can enter.

test.use({ locale: 'pt-BR', extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9' } });

const REMOTE = 'cerebro-e2e.example.com';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

test('the menu leads to the devices, in Settings; this one is listed, and it passes WCAG 2.2 AA', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('link', { name: 'Configurações' }).click();
  await expect(page).toHaveURL('/settings');
  await page.getByRole('link', { name: 'Aparelhos' }).click();
  await expect(page).toHaveURL('/settings/devices');
  await expect(page.getByRole('heading', { name: 'Aparelhos', level: 1 })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'este' })).toHaveCount(1);
  const remote = page.getByRole('region', { name: 'Acesso de fora de casa' });
  await expect(remote).toContainText(/Pronto|Ligado/);
  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
});

test('remote access on; a phone pairs once by its code, and is revoked', async ({
  page,
  browser,
  request,
}, info) => {
  test.skip(info.project.name !== 'build-desktop', 'one remote channel');
  // The old address still leads there.
  await page.goto('/devices');
  await expect(page).toHaveURL('/settings/devices');
  const remote = page.getByRole('region', { name: 'Acesso de fora de casa' });
  await expect(remote).toContainText('Pronto. Escreva o endereço do seu domínio');
  await expect(page.getByRole('button', { name: 'Parear um celular' })).toHaveCount(0);

  // Before: the remote address is just another host (DNS rebinding).
  expect((await request.get('/locked', { headers: { host: REMOTE } })).status()).toBe(403);
  await remote.getByLabel('Endereço').fill(REMOTE);
  await remote.getByRole('button', { name: 'Ligar o acesso remoto' }).click();
  await expect(remote).toContainText(`Ligado: https://${REMOTE}.`);
  // After: let in, and sent on over HTTPS (already signed in, the locked screen leads home).
  const inside = await request.get('/locked', { headers: { host: REMOTE }, maxRedirects: 0 });
  expect(inside.status()).toBe(307);
  expect(inside.headers().location).toBe(`https://${REMOTE}/`);

  await page.getByRole('button', { name: 'Parear um celular' }).click();
  const code = page.getByRole('img', { name: 'Código de pareamento' });
  await expect(code.locator('svg')).toBeVisible();
  const url = new URL((await code.getAttribute('data-url'))!);
  expect(url.origin).toBe(`https://${REMOTE}`);
  const key = url.searchParams.get('pair')!;

  // The phone opens the code (here through this computer's own address, as the channel would).
  // New contexts take the project's options, its signed-in session included: these start empty.
  const empty = { cookies: [], origins: [] };
  const phone = await browser.newContext({
    userAgent: IPHONE,
    locale: 'pt-BR',
    storageState: empty,
  });
  const p = await phone.newPage();
  await p.goto(`/?pair=${key}`);
  await expect(p).toHaveURL('/settings/devices?paired=1');
  await expect(p.getByRole('region', { name: 'Este aparelho entrou no Cerebro' })).toContainText(
    'Compartilhar e depois em Adicionar à Tela de Início',
  );
  await expect(page.getByRole('status')).toHaveText('Celular pareado.', { timeout: 10_000 });
  const row = page.getByRole('listitem').filter({ hasText: 'Safari · iOS' });
  await expect(row).toContainText('Celular');

  // The code works once.
  const again = await browser.newContext({ storageState: empty });
  const q = await again.newPage();
  await q.goto(`/?pair=${key}`);
  await expect(q).toHaveURL('/locked');
  await again.close();

  // Revoked from the computer, the phone is out at once.
  await row.getByRole('button', { name: /^Revogar/ }).click();
  await expect(row).toHaveCount(0);
  await p.goto('/');
  await expect(p).toHaveURL('/locked');
  await phone.close();

  await remote.getByRole('button', { name: 'Desligar' }).click();
  await expect(remote).toContainText('Pronto');
  await expect(remote.getByLabel('Endereço')).toHaveValue(REMOTE);
  expect((await request.get('/locked', { headers: { host: REMOTE } })).status()).toBe(403);
});
