// Разовий ВИМІР (не стенд): скільки карток хаба мають порожній верхній рядок.
// Гіпотеза: у «Громаді» і «Волині» гео-мітка знімається як повтор вкладки, а
// категорія «Суспільство» не малюється (94.5% статей) — отже картка починається
// одразу із заголовка, і саме тому список читається як суцільна стіна.
import { chromium } from 'playwright';
import { chromiumPath, serve } from '../_lib.mjs';

const { url, stop } = await serve();
const executablePath = chromiumPath();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.route('**://*.supabase.co/**', r => r.abort());
await page.route('**://api.open-meteo.com/**', r => r.abort());
await page.route('**://**/*.{png,jpg,jpeg,webp,gif}', r => r.abort());
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.evaluate(() => window.switchTab && window.switchTab('community'));
await page.waitForTimeout(1200);
await page.locator('.cm-news-board-bar').click();
await page.waitForTimeout(1200);

const measure = () => page.evaluate(() => {
  const cards = [...document.querySelectorAll('.nh-list .nc')];
  const empty = cards.filter(c => !c.querySelector('.nc-meta').textContent.trim()).length;
  return { всього: cards.length, безМітки: empty, відсоток: Math.round(empty / cards.length * 1000) / 10 };
});

for (const tab of ['Громада', 'Волинь', 'Україна та Світ']) {
  if (tab !== 'Громада') {
    await page.locator('.nh-tab', { hasText: tab }).click();
    await page.waitForTimeout(800);
  }
  console.log(tab.padEnd(18), JSON.stringify(await measure()));
}

await browser.close();
await stop();
