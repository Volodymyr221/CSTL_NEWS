// ІНСТРУМЕНТ (руками): node tests/tools/board-olx-edge.mjs [тека]
// Дошка у моделі OLX: СВІТЛИЙ фон + ЧІТКИЙ суцільний обідок + БЕЗ широкої тіні.
//
// 🔬 ЗАМІРЯНО ЗІ СКРІНШОТА OLX, який дав Вова (пікселі, не око):
//   фон сторінки  #EEF1F1  (яскравість 87.4%)
//   картка        #FFFFFF  → різниця заливок лише **1.136:1**, тобто майже нуль
//   обідок        #C8CED0, 3 фізичні пікселі при 3× = рівно 1pt → контраст лінії 1.401
//   тіні НЕМАЄ    (зріз показує чистий стрибок фон → лінія → біле, без градієнта)
//
// 🔴 ЧОМУ НАШ ОБІДОК «НЕ ВИДНО», ХОЧ ЧИСЛО В НЬОГО НАВІТЬ БІЛЬШЕ (1.446 проти 1.401).
// Дві причини, обидві структурні:
//   1) ТІНЬ. У нас `0 4px 10px rgba(...,0.10)` — навколо картки градієнт, який
//      розмиває перехід. Око бачить м'яку смугу, а не лінію. В OLX тіні немає зовсім.
//   2) ПОДВІЙНИЙ КРАЙ. Ми одночасно розділяємо і ЗАЛИВКОЮ (1.458), і ЛІНІЄЮ. Два
//      розділювачі в одному місці читаються як каша. OLX робить заливку майже
//      непомітною (1.136) і лишає ОДИН чіткий розділювач — лінію.
// Тобто «давить на очі» — це не яскравість і не сірість, а НЕВИЗНАЧЕНА МЕЖА:
// око постійно доводить край, якого немає. Тому і світліший, і темніший фон
// однаково не рятували — крутили не той важіль.
//
// Варіанти тримають контраст лінії ≈1.40 (число OLX) під кожен фон.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { launch, serve, blockExternal } from '../_lib.mjs';

const OUT = process.argv[2] || new URL('./_out', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

// [ярлик, фон, обідок, тінь]
const VARIANTS = [
  ['0-зараз', '#D6D6D1', 'rgba(16,18,22,0.18)', '0 1px 2px rgba(16,18,22,0.06), 0 4px 10px rgba(16,18,22,0.10)'],
  // H1 — модель OLX майже дослівно: фон = наш базовий `--app-bg` (він практично
  //      збігається з фоном OLX), обідок під контраст 1.40, тіні немає.
  ['H1-олх',   '#ECEEF1', '#C9CBCE', 'none'],
  // H2 — та сама яскравість, але НАШ нейтральний тон (без холодного відтінку).
  ['H2-наш-тон', '#EDEDEA', '#CACAC7', 'none'],
  // H3 — «як був перед цим» (#E6E6E3) + чіткий обідок. Компроміс: фон трохи глибший
  //      за OLX, зате знайомий; розділення все одно тримає лінія.
  ['H3-як-було', '#E6E6E3', '#C4C4C1', 'none'],
];

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

for (const [label, bg, edge, shadow] of VARIANTS) {
  await page.evaluate(({ bg, edge, shadow }) => {
    let s = document.getElementById('__olx');
    if (!s) { s = document.createElement('style'); s.id = '__olx'; document.head.appendChild(s); }
    s.textContent = `
      :root { --board-bg: ${bg}; }
      .board-bg { background: ${bg} !important; }
      .app-main[data-tab="board"] { background: ${bg} !important; }
      #board-content .cm-board-note:not(.cm-board-note--official) {
        border: 1px solid ${edge} !important;
        box-shadow: ${shadow} !important;
      }
    `;
  }, { bg, edge, shadow });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/olx-${label}.png` });
  // КОНТРОЛЬ: колір мусить рухатись за варіантом (інструмент уже раз брехав).
  const live = await page.evaluate(() => {
    const c = document.querySelector('#board-content .cm-board-note:not(.cm-board-note--official)');
    return getComputedStyle(document.querySelector('.app-main[data-tab="board"]')).backgroundColor
      + ' · обідок ' + (c ? getComputedStyle(c).borderTopColor : '—');
  });
  console.log(`${label.padEnd(12)} ${live}`);
}

await browser.close();
await stop();
