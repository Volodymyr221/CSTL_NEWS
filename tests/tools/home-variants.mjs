// ІНСТРУМЕНТ: чотири варіанти верху головного екрана — знімками, для вибору.
//
// Той самий підхід, яким у проєкті вже обирали шапку Дошки (`board-head-variants.mjs`)
// і табло новин (`news-variants.mjs`): Вова дивиться картинки і тицяє в ту, що
// ближча, замість описувати словами те, чого ще не бачив.
//
// ⚠️ ЖОДЕН ВАРІАНТ НЕ ЗМІНЮЄ ПРОДУКТОВИЙ КОД. Усі відмінності накладаються в
// браузері стенда (класи + CSS), тому порівняння йде на ОДНИХ даних і одному
// білді — інакше різниця могла б виявитись різницею даних, а не розкладки.
import { chromium } from 'playwright';
import { chromiumPath, serve } from '../_lib.mjs';

const { url, stop } = await serve();
const ep = chromiumPath();
const browser = await chromium.launch({ ...(ep ? { executablePath: ep } : {}) });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block',
});
const page = await ctx.newPage();
await page.route('**://api.open-meteo.com/**', r => r.abort());
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
await page.evaluate(() => window.switchTab && window.switchTab('community'));
await page.waitForTimeout(2500);
const consent = page.locator('.consent-accept');
if (await consent.count()) { await consent.click(); await page.waitForTimeout(300); }

const dir = process.env.SHOT_DIR || '/tmp';

const VARIANTS = {
  // A — те, що зараз НА САЙТІ (PR #758): фото немає, верх світлий.
  A: () => {
    document.getElementById('cm-content').classList.remove('hm-onphoto');
    const bg = document.querySelector('.hm-photobg');
    if (bg) bg.style.display = 'none';
  },
  // B — фото ЗА верхом, віджети скляні (готове, лежить у гілці vova/home-photo).
  B: () => {
    document.getElementById('cm-content').classList.add('hm-onphoto');
    const bg = document.querySelector('.hm-photobg');
    if (bg) { bg.style.display = ''; bg.style.height = '420px'; }
  },
  // C — фото на ВЕСЬ перший екран: віджети пливуть по ньому і згортаються вниз.
  C: () => {
    document.getElementById('cm-content').classList.add('hm-onphoto');
    const bg = document.querySelector('.hm-photobg');
    if (bg) { bg.style.display = ''; bg.style.height = '700px'; }
    const f = document.querySelector('.hm-photobg-fade');
    if (f) f.style.background =
      'linear-gradient(180deg, rgba(20,18,16,0.50) 0%, rgba(20,18,16,0.28) 40%,' +
      ' rgba(20,18,16,0.30) 68%, rgba(230,230,227,0.60) 92%, var(--hm-bg) 100%)';
  },
  // D — фото ЛИШЕ в головній плитці (як кадр новини), решта екрана світла.
  D: () => {
    document.getElementById('cm-content').classList.remove('hm-onphoto');
    const bg = document.querySelector('.hm-photobg');
    if (bg) bg.style.display = 'none';
    const hero = document.querySelector('.hm-hero');
    if (!hero) return;
    hero.classList.add('hm-hero--photo');
    let ph = hero.querySelector('.hm-hero-photo');
    if (!ph) {
      ph = document.createElement('div');
      ph.className = 'hm-hero-photo';
      const sh = document.createElement('div');
      sh.className = 'hm-hero-shade';
      hero.prepend(sh); hero.prepend(ph);
    }
    const d = new Date().getDate() % 4 + 1;
    ph.style.backgroundImage = `url('./photos/olyka.day-${d}.jpg')`;
  },
};

for (const [name, fn] of Object.entries(VARIANTS)) {
  await page.evaluate(fn);
  await page.waitForTimeout(700);
  await page.evaluate(() => { document.querySelector('.app-main').scrollTop = 0; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/var-${name}.png` });
  const h = await page.evaluate(() => Math.round(document.querySelector('.app-main').scrollHeight));
  console.log(`варіант ${name}: знімок ${dir}/var-${name}.png · сторінка ${h}px`);
}

await browser.close();
await stop();
