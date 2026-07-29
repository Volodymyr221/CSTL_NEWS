// ІНСТРУМЕНТ (руками): node tests/tools/fab-variants.mjs [тека]
// Знімає FAB Дошки у ДВОХ станах (закрите меню + відкрите) для кількох варіантів вигляду.
//
// НАВІЩО. Вова: «в підменю FAB треба стилі всіх вкладок привести в однаковий стиль,
// щоб кнопки і нічого інше не зливались з фоном».
//
// 🔴 ЗАМІРЯНО ПЕРЕД ТИМ, ЯК ЩОСЬ МІНЯТИ:
//   • закрите меню — скло кнопки vs фон Дошки = 1.140 (кнопку тримає лише бордова обручка);
//   • відкрите   — скло пункту vs затемнення  = 1.770;
//   • стеля для БІЛОГО скла на фоні #E3DFD3 = 1.332 навіть при 100% щільності.
// Тобто «зробити скло щільнішим» кнопку не рятує — впирається у стелю. Єдиний спосіб
// дати кнопці справжню помітність — змінити ЗНАЧЕННЯ заливки (бордова: 7.24:1).
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { launch, serve, blockExternal } from '../_lib.mjs';

const OUT = process.argv[2] || new URL('./_out', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const VARIANTS = [
  ['0-зараз', ''],
  // A — те саме скло, але щільніше: пункти меню стають виразнішими (1.77 → 2.8),
  //     сама кнопка лишається блідою (стеля 1.31) і тримається на обручці.
  ['A-щільне-скло', `
    .board-fab-label, .board-fab-ic, .board-trigger--fixed, .pm-fab-ad {
      background: rgba(255,255,255,0.88) !important;
      border-width: 1.5px !important;
    }`],
  // B — кнопка ЗАЛИТА бордовим (мова застосунку: «Написати» в модалці вже така),
  //     пункти меню лишаються світлими, але щільними → чітка ієрархія: дія / список.
  ['B-бордова-кнопка', `
    .board-trigger--fixed, .pm-fab-ad {
      background: var(--red) !important;
      border-color: var(--red) !important;
      color: #fff !important;
      box-shadow: 0 8px 24px rgba(0,0,0,0.30), 0 2px 6px rgba(0,0,0,0.18) !important;
    }
    .board-fab-label, .board-fab-ic {
      background: rgba(255,255,255,0.92) !important;
    }
    .board-fab-ic { color: var(--red) !important; }`],
];

const { url, stop } = await serve();
const browser = await launch(chromium);
const page = await browser.newPage({ viewport: { width: 430, height: 844 }, deviceScaleFactor: 2 });
await blockExternal(page);
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  document.getElementById('splash')?.remove();
  document.querySelector('[class*="consent"]')?.remove();
});
await page.evaluate(() => window.switchTab?.('board'));
await page.waitForTimeout(1200);

for (const [label, css] of VARIANTS) {
  await page.evaluate((css) => {
    let s = document.getElementById('__fabvar');
    if (!s) { s = document.createElement('style'); s.id = '__fabvar'; document.head.appendChild(s); }
    s.textContent = css;
  }, css);
  // закрите меню
  await page.evaluate(() => document.getElementById('board-fab')?.classList.remove('open'));
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/fab-${label}-closed.png` });
  // відкрите меню
  await page.evaluate(() => document.getElementById('board-fab')?.classList.add('open'));
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/fab-${label}-open.png` });
  console.log(`✓ ${label}`);
}

await browser.close();
await stop();
