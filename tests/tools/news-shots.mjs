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

// ⚠️ Знімаємо РЕАЛЬНИЙ стан застосунку, нічого не підмінюючи. 31.07 тут стояла
// тимчасова підміна класів, щоб порівняти два варіанти табла (велика перша проти
// трьох однакових) — Вова вибрав три однакові, і підміну прибрано.
// Скріншот, який показує не те, що в коді, гірший за відсутній.
await shot('1-табло', '#cm-news-board');
await shot('2-головний-екран');

await page.locator('.cm-news-board-bar').click();
await page.waitForTimeout(1200);
await shot('3-хаб-громада');

await page.locator('.nh-tab', { hasText: 'ВОЛИНЬ' }).click();
await page.waitForTimeout(1200);
await shot('4-хаб-волинь');

await page.locator('.nh-list .nc').first().click();
await page.waitForTimeout(1200);
await shot('5-стаття');

await browser.close();
await stop();
