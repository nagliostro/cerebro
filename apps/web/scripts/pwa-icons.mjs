// Writes the icons a phone uses for the installed Cerebro (public/pwa/): the sphere of the menu
// with the brain, on the dark sky. Run again if app/icon.svg changes:
//   node scripts/pwa-icons.mjs
import { readFileSync } from 'node:fs';

import { chromium } from '@playwright/test';

const svg = readFileSync(new URL('../app/icon.svg', import.meta.url), 'utf8');
// [file, size, share of the square the sphere takes]: "maskable" keeps it inside the safe zone.
const ICONS = [
  ['icon-192.png', 192, 0.72],
  ['icon-512.png', 512, 0.72],
  ['maskable-512.png', 512, 0.56],
  ['apple-touch-icon.png', 180, 0.72],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, share] of ICONS) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;display:grid;place-items:center;width:${size}px;height:${size}px;background:radial-gradient(120% 90% at 50% -10%,#232a36,#0f1013 70%)">
      <div style="width:${size * share}px;height:${size * share}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
    </body>`,
  );
  await page.screenshot({
    path: new URL(`../public/pwa/${file}`, import.meta.url).pathname.slice(
      process.platform === 'win32' ? 1 : 0,
    ),
  });
  console.log(file);
}
await browser.close();
