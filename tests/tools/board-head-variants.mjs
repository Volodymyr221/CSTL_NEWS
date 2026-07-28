// Інструмент вибору вигляду ШАПКИ Дошки: знімає один екран із різними способами
// відділити прибиту шапку (лічильник + локація + пошук) від фону.
//
// Вова 28.07: «сам верхній блок цього пошуку зливається з фоном… може накласти
// накладку як у Громаді у віджеті Дошка зверху, щоб воно трошки вирізнялось,
// але щоб це було гармонічно поєднано».
//
// 🔴 ЧОМУ НЕ КОПІЮЄМО НАКЛАДКУ З ВІДЖЕТА БУКВАЛЬНО.
// `.cmbw-head` (віджет Громади) = `rgba(0,0,0,0.22)` + світла лінія знизу. Це
// ЗАТЕМНЕННЯ, і воно працює саме тому, що фон віджета темний, а текст на ньому
// світлий (`#F2E7D0`). На світло-сірій Дошці текст ТЕМНИЙ — те саме затемнення дало б
// темно-сіру плиту з нечитабельним написом.
// Фізика та сама, знак протилежний: на темному тлі «вище» = темніше з підсвіченим
// краєм; на світлому «вище» = СВІТЛІШЕ з тінню/лінією під краєм. Тому ідею віджета
// передаємо дзеркально — шапка стає світлішою за фон, а не темнішою.
//
// Запуск: node tests/tools/board-head-variants.mjs [тека для знімків]
import { chromium } from 'playwright';
import { launch, serve, blockExternal } from '../_lib.mjs';

const OUT = process.argv[2] || '/tmp';

// Кожен варіант — CSS, що накладається на `#board-content .bd-controls`.
const VARIANTS = {
  '0-зараз': ``,

  // A. Просто світліше скло + тонка лінія. Найближче до iOS-навбара і FB.
  'A-світліше-скло': `
    #board-content .bd-controls {
      background: rgba(255,255,255,0.72);
      border-bottom: 1px solid rgba(16,18,22,0.10);
      box-shadow: 0 4px 14px rgba(16,18,22,0.10);
    }`,

  // B. Те саме + вертикальний градієнт усередині: світліше згори, ніби на плашку
  // падає світло. Це і є дзеркальний відповідник накладки віджета.
  'B-градієнт+лінія': `
    #board-content .bd-controls {
      background:
        linear-gradient(to bottom, rgba(255,255,255,0.86), rgba(255,255,255,0.62));
      border-bottom: 1px solid rgba(16,18,22,0.12);
      box-shadow: 0 5px 16px rgba(16,18,22,0.12);
    }`,

  // C. Суцільна біла плита без прозорості — максимальне відділення, скла більше немає.
  'C-біла-плита': `
    #board-content .bd-controls {
      background: #FFFFFF;
      -webkit-backdrop-filter: none; backdrop-filter: none;
      border-bottom: 1px solid rgba(16,18,22,0.10);
      box-shadow: 0 4px 16px rgba(16,18,22,0.13);
    }`,

  // D. Скло як зараз, але шапка стає ПЛАШКОЮ з відступами від країв екрана —
  // відділяється формою, а не кольором (як «картка» серед карток).
  'D-плашка-з-полями': `
    #board-content .bd-controls {
      left: 8px; right: 8px;
      background: rgba(255,255,255,0.78);
      border: 1px solid rgba(16,18,22,0.08);
      border-radius: 16px;
      box-shadow: 0 6px 18px rgba(16,18,22,0.14);
    }`,
};

const { url, stop } = await serve();
const browser = await launch(chromium);
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await blockExternal(page);
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  document.getElementById('splash')?.remove();
  document.querySelector('.consent-bar, .cookie-bar, [class*="consent"]')?.remove();
});
await page.evaluate(() => window.switchTab?.('board'));
await page.waitForTimeout(1200);

for (const [label, css] of Object.entries(VARIANTS)) {
  await page.evaluate((css) => {
    let s = document.getElementById('__headvar');
    if (!s) { s = document.createElement('style'); s.id = '__headvar'; document.head.appendChild(s); }
    s.textContent = css;
  }, css);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/head-${label}.png`, clip: { x: 0, y: 0, width: 390, height: 420 } });
  console.log(`знято: ${label}`);
}

await browser.close();
await stop();
