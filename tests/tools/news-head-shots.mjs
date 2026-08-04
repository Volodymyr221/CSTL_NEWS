// tests/tools/news-head-shots.mjs — знімки макетів РЯДКА ВХОДУ в розділ.
//
// Три варіанти з `_mockups/news-head.html` + колаж поруч: вибирати легше
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
  viewport: { width: 390, height: 860 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, serviceWorkers: 'block',
})).newPage();

for (const v of VARIANTS) {
  await page.goto(`${url}/tests/tools/_mockups/news-head.html?v=${v}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, `head-mk-${v}.png`) });
  console.log(`✓ варіант ${v.toUpperCase()} → tests/tools/_shots/head-mk-${v}.png`);
}

// Колаж: три екрани в ряд.
const collage = await browser.newContext({ viewport: { width: 1700, height: 1010 }, deviceScaleFactor: 2 });
const cp = await collage.newPage();
await cp.setContent(`
  <style>
    body{margin:0;background:#F3F4F6;font:600 14px/1 -apple-system,system-ui,sans-serif;color:#2A2520}
    .row{display:flex;gap:24px;padding:24px}
    .col{flex:1}
    .cap{text-align:center;padding:14px 0 0;font:700 15px/1 system-ui;letter-spacing:.02em}
    .sub{text-align:center;font:400 12.5px/1.45 system-ui;color:#6E727A;padding-top:6px}
    iframe{width:390px;height:820px;border:0;border-radius:20px;box-shadow:0 8px 30px rgba(0,0,0,.14);background:#2A2520}
  </style>
  <div class="row">
    <div class="col"><iframe src="${url}/tests/tools/_mockups/news-head.html?v=a"></iframe>
      <div class="cap">А — капс, тихіший за назву</div>
      <div class="sub">Різниця лише в кеглі та яскравості.<br>Два капси лишаються в одному рядку.</div></div>
    <div class="col"><iframe src="${url}/tests/tools/_mockups/news-head.html?v=b"></iframe>
      <div class="cap">Б — капс-чіп</div>
      <div class="sub">Вхід має власну поверхню — це обʼєкт, а не текст.<br>Площа дотику більша.</div></div>
    <div class="col"><iframe src="${url}/tests/tools/_mockups/news-head.html?v=c"></iframe>
      <div class="cap">В — перевернута ієрархія</div>
      <div class="sub">Назва секції гучна, вхід тихий.<br>Кеглі рознесені: 15px проти 10px.</div></div>
    <div class="col"><iframe src="${url}/tests/tools/_mockups/news-head.html?v=d"></iframe>
      <div class="cap">Г — вхід смугою під блоком</div>
      <div class="sub">Двох капсів поруч не буває взагалі.<br>Ціна: +44px на КОЖЕН блок.</div></div>
  </div>
`, { waitUntil: 'networkidle' });
await cp.waitForTimeout(900);
await cp.screenshot({ path: join(SHOTS, 'head-mk-all.png') });
console.log('✓ колаж → tests/tools/_shots/head-mk-all.png');

await browser.close();
await stop();
