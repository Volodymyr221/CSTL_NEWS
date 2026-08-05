// tests/tools/modal-font-shots.mjs — знімки макетів ШРИФТУ заголовка модалки.
//
// Три варіанти з `_mockups/modal-font.html` + колаж поруч: вибирати легше
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
  viewport: { width: 390, height: 620 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, serviceWorkers: 'block',
})).newPage();

for (const v of VARIANTS) {
  await page.goto(`${url}/tests/tools/_mockups/modal-font.html?v=${v}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, `font-mk-${v}.png`) });
  console.log(`✓ варіант ${v.toUpperCase()} → tests/tools/_shots/font-mk-${v}.png`);
}

// Колаж: три екрани в ряд.
const collage = await browser.newContext({ viewport: { width: 1700, height: 800 }, deviceScaleFactor: 2 });
const cp = await collage.newPage();
await cp.setContent(`
  <style>
    body{margin:0;background:#F3F4F6;font:600 14px/1 -apple-system,system-ui,sans-serif;color:#2A2520}
    .row{display:flex;gap:24px;padding:24px}
    .col{flex:1}
    .cap{text-align:center;padding:14px 0 0;font:700 15px/1 system-ui;letter-spacing:.02em}
    .sub{text-align:center;font:400 12.5px/1.45 system-ui;color:#6E727A;padding-top:6px}
    iframe{width:390px;height:580px;border:0;border-radius:20px;box-shadow:0 8px 30px rgba(0,0,0,.14);background:#2A2520}
  </style>
  <div class="row">
    <div class="col"><iframe src="${url}/tests/tools/_mockups/modal-font.html?v=a"></iframe>
      <div class="cap">А — Georgia (як зараз)</div>
      <div class="sub">Те, що на скріні Вови.</div></div>
    <div class="col"><iframe src="${url}/tests/tools/_mockups/modal-font.html?v=b"></iframe>
      <div class="cap">Б — системний sans 20/700</div>
      <div class="sub">Той самий шрифт, що весь застосунок.<br>Відрізняється вагою, не гарнітурою.</div></div>
    <div class="col"><iframe src="${url}/tests/tools/_mockups/modal-font.html?v=c"></iframe>
      <div class="cap">В — системний sans 23/800</div>
      <div class="sub">Те саме сімейство, гучніше.<br>Патерн великих заголовків аркушів iOS.</div></div>
    <div class="col"><iframe src="${url}/tests/tools/_mockups/modal-font.html?v=d"></iframe>
      <div class="cap">Г — тихий капс</div>
      <div class="sub">Заголовок стає підписом розділу.<br>Головний у вікні — список.</div></div>
  </div>
`, { waitUntil: 'networkidle' });
await cp.waitForTimeout(900);
await cp.screenshot({ path: join(SHOTS, 'font-mk-all.png') });
console.log('✓ колаж → tests/tools/_shots/font-mk-all.png');

await browser.close();
await stop();
