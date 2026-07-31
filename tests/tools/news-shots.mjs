// tests/tools/news-shots.mjs — ЖИВІ СКРІНШОТИ шляху новин (31.07, потік /byyou).
//
// Навіщо окремим інструментом, а не стендом: стенд відповідає «так/ні» числом,
// а тут потрібне те, чого число не замінює — Вова дивиться і каже, який варіант
// беремо. Той самий прийом, яким 28.07 вибирали шапку Дошки
// (`tests/tools/board-head-variants.mjs`).
//
// Знімає: табло на Громаді (два варіанти), хаб у двох розділах, відкриту статтю.
// Запуск: node tests/tools/news-shots.mjs [тека]
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { chromiumPath, serve } from '../_lib.mjs';

const OUT = process.argv[2] || 'shots';
mkdirSync(OUT, { recursive: true });

const { url, stop } = await serve();
const executablePath = chromiumPath();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
// Supabase глушимо (у пісочниці недосяжний), а от КАРТИНКИ лишаємо: саме вони й
// вирішують, як виглядає велика картка.
await page.route('**://*.supabase.co/**', r => r.abort());
await page.route('**://api.open-meteo.com/**', r => r.abort());
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.evaluate(() => window.switchTab && window.switchTab('community'));
await page.waitForTimeout(2000);

const shot = async (name, sel) => {
  const el = sel ? await page.$(sel) : null;
  await (el ? el.screenshot({ path: `${OUT}/${name}.png` }) : page.screenshot({ path: `${OUT}/${name}.png` }));
  console.log('📸', `${OUT}/${name}.png`);
};

await shot('1-tablo-A-велика-перша', '#cm-news-board');

// Варіант B — та сама збірка, змінений лише варіант першої картки.
await page.evaluate(() => {
  const lead = document.querySelector('#cm-news-board .nc--lead');
  if (lead) lead.classList.replace('nc--lead', 'nc--mini');
});
await page.waitForTimeout(300);
await shot('2-tablo-B-три-однакові', '#cm-news-board');

// Повертаємо як є в коді і знімаємо головний екран цілком — щоб було видно, скільки
// віджет лишає іншим блокам Громади.
await page.evaluate(() => {
  const m = document.querySelector('#cm-news-board .nc--mini');
  if (m) m.classList.replace('nc--mini', 'nc--lead');
});
await page.waitForTimeout(300);
await shot('3-головний-екран');

await page.locator('.cm-news-board-bar').click();
await page.waitForTimeout(1200);
await shot('4-хаб-громада');

await page.locator('.nh-tab', { hasText: 'ВОЛИНЬ' }).click();
await page.waitForTimeout(1200);
await shot('5-хаб-волинь');

await page.locator('.nh-list .nc').first().click();
await page.waitForTimeout(1200);
await shot('6-стаття');

await browser.close();
await stop();
