// Разовий ВИМІР: чи влазять назви розділів у свою третину після переходу на капс.
// Міряємо на 320px (старий iPhone SE — найвужчий реальний екран) і на 390px.
// Критерій — НАСЛІДОК, який побачить людина: `scrollWidth > clientWidth` означає,
// що браузер уже підрізав напис трикрапкою.
import { chromium } from 'playwright';
import { chromiumPath, serve } from '../_lib.mjs';

const { url, stop } = await serve();
const executablePath = chromiumPath();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });

for (const width of [320, 390, 430]) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.route('**://*.supabase.co/**', r => r.abort());
  await page.route('**://api.open-meteo.com/**', r => r.abort());
  await page.route('**://**/*.{png,jpg,jpeg,webp,gif}', r => r.abort());
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.switchTab && window.switchTab('community'));
  await page.waitForTimeout(1000);
  await page.locator('.cm-news-board-bar').click();
  await page.waitForTimeout(1000);
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.nh-tab')].map(t => {
    const r = document.createRange(); r.selectNodeContents(t);
    return {
      назва: t.textContent.trim(),
      треба: Math.ceil(r.getBoundingClientRect().width),   // ШИРИНА САМИХ ЛІТЕР
      є: t.clientWidth,
      обрізано: t.scrollWidth > t.clientWidth,
    };
  }));
  console.log(`— екран ${width}px —`);
  for (const t of tabs) console.log('  ', t.назва.padEnd(18), `${t.треба}/${t.є}`, t.обрізано ? '❌ ОБРІЗАНО' : '✅');
  await ctx.close();
}

await browser.close();
await stop();
