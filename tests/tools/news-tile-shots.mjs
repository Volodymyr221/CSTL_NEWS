// tests/tools/news-tile-shots.mjs — знімки макетів ФОРМИ плитки новини.
//
// Три варіанти з `_mockups/news-tile.html` + колаж поруч: вибирати легше
// порівнянням, ніж гортанням. Той самий метод, що для шапки й фону 04.08.
//
// Запуск: node tests/tools/news-tile-shots.mjs

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { chromiumPath, serve, ROOT } from '../_lib.mjs';

const SHOTS = join(ROOT, 'tests', 'tools', '_shots');
mkdirSync(SHOTS, { recursive: true });

const { url, stop } = await serve();
const executablePath = chromiumPath();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });

const VARIANTS = ['a', 'b', 'c', 'd'];
const page = await (await browser.newContext({
  viewport: { width: 390, height: 560 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, serviceWorkers: 'block',
})).newPage();

for (const v of VARIANTS) {
  await page.goto(`${url}/tests/tools/_mockups/news-tile.html?v=${v}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, `tile-mk-${v}.png`) });
  console.log(`✓ варіант ${v.toUpperCase()} → tests/tools/_shots/tile-mk-${v}.png`);
}

// Колаж: три екрани в ряд.
const collage = await browser.newContext({ viewport: { width: 1640, height: 700 }, deviceScaleFactor: 2 });
const cp = await collage.newPage();
await cp.setContent(`
  <style>
    body{margin:0;background:#F3F4F6;font:600 14px/1 -apple-system,system-ui,sans-serif;color:#2A2520}
    .row{display:flex;gap:24px;padding:24px}
    .col{flex:1}
    .cap{text-align:center;padding:14px 0 0;font:700 15px/1 system-ui;letter-spacing:.02em}
    .sub{text-align:center;font:400 12.5px/1.45 system-ui;color:#6E727A;padding-top:6px}
    iframe{width:390px;height:520px;border:0;border-radius:20px;box-shadow:0 8px 30px rgba(0,0,0,.14);background:#2A2520}
  </style>
  <div class="row">
    <div class="col"><iframe src="${url}/tests/tools/_mockups/news-tile.html?v=a"></iframe>
      <div class="cap">А — як картка Дошки</div>
      <div class="sub">Радіус 14, обідок 1px, тіні нема.<br>Нових візуальних мов на сторінці не додає.</div></div>
    <div class="col"><iframe src="${url}/tests/tools/_mockups/news-tile.html?v=b"></iframe>
      <div class="cap">Б — підняте скло</div>
      <div class="sub">Радіус 18, обідка нема, двошарова тінь.<br>Картка лежить НА фото, а не вирізана з нього.</div></div>
    <div class="col"><iframe src="${url}/tests/tools/_mockups/news-tile.html?v=c"></iframe>
      <div class="cap">В — фото в рамці</div>
      <div class="sub">Два радіуси: картка 16, фото 10 з відступом.<br>Ціна — фото вужче на 18px, площа −7%.</div></div>
    <div class="col"><iframe src="${url}/tests/tools/_mockups/news-tile.html?v=d"></iframe>
      <div class="cap">Г — та сама картка, що вся головна</div>
      <div class="sub">Радіус 14 + обідок + тінь = примітив <code>.hm-card</code>.<br>Новина стає тим самим обʼєктом, що оголошення поруч.</div></div>
  </div>
`, { waitUntil: 'networkidle' });
await cp.waitForTimeout(900);
await cp.screenshot({ path: join(SHOTS, 'tile-mk-all.png') });
console.log('✓ колаж → tests/tools/_shots/tile-mk-all.png');

await browser.close();
await stop();
