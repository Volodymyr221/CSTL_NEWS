// tests/tools/home-shots.mjs — знімки макетів першого екрана (390×844).
//
// Робить PNG кожного варіанта з `_mockups/home-variants.html` + один спільний
// колаж «А | Б | В» поруч, бо вибирати легше порівнянням, а не гортанням.
//
// Запуск: node tests/tools/home-shots.mjs

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { chromiumPath, serve, ROOT } from '../_lib.mjs';

const SHOTS = join(ROOT, 'tests', 'tools', '_shots');
mkdirSync(SHOTS, { recursive: true });

const { url, stop } = await serve();
const executablePath = chromiumPath();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });

const VARIANTS = ['a', 'b', 'c'];
const page = await (await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, serviceWorkers: 'block',
})).newPage();

for (const v of VARIANTS) {
  await page.goto(`${url}/tests/tools/_mockups/home-variants.html?v=${v}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, `mockup-${v}.png`) });
  console.log(`✓ варіант ${v.toUpperCase()} → tests/tools/_shots/mockup-${v}.png`);
}

// Колаж: три екрани в ряд на світлому тлі з підписами.
const collage = await browser.newContext({ viewport: { width: 1230, height: 980 }, deviceScaleFactor: 2 });
const cp = await collage.newPage();
await cp.setContent(`
  <style>
    body{margin:0;background:#F3F4F6;font:600 14px/1 -apple-system,system-ui,sans-serif;color:#2A2520}
    .row{display:flex;gap:24px;padding:28px 24px 12px}
    .col{flex:1}
    .cap{text-align:center;padding:14px 0 0;font:700 15px/1 system-ui;letter-spacing:.02em}
    .sub{text-align:center;font:400 12.5px/1.45 system-ui;color:#6E727A;padding-top:6px}
    iframe{width:390px;height:844px;border:0;border-radius:20px;box-shadow:0 8px 30px rgba(0,0,0,.14);background:#fff}
  </style>
  <div class="row">
    <div class="col"><iframe src="${url}/tests/tools/_mockups/home-variants.html?v=a"></iframe>
      <div class="cap">А — тиха шапка</div><div class="sub">Фото вгорі немає.<br>Максимум повітря, дані одразу.</div></div>
    <div class="col"><iframe src="${url}/tests/tools/_mockups/home-variants.html?v=b"></iframe>
      <div class="cap">Б — бордова шапка</div><div class="sub">Мова автобусного віджета.<br>Характер дає колір, не фото.</div></div>
    <div class="col"><iframe src="${url}/tests/tools/_mockups/home-variants.html?v=c"></iframe>
      <div class="cap">В — фото-смуга</div><div class="sub">Костел лишається, 168px.<br>Обкладинка, а не банер.</div></div>
  </div>
`, { waitUntil: 'networkidle' });
await cp.waitForTimeout(700);
await cp.screenshot({ path: join(SHOTS, 'mockup-all.png') });
console.log('✓ колаж → tests/tools/_shots/mockup-all.png');

await browser.close();
await stop();
