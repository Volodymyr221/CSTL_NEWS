// Стенд №16: ЗГОРТАННЯ ДОВГОГО ТЕКСТУ — кнопка не бреше, тап по тексту розгортає.
//
// Дві скарги Вови 27.07:
//   1. «на сторінці спільноти текст уже відкритий, а кнопка пише "Показати більше";
//      тисну — нічого не збільшується, лише напис міняється на "Згорнути"»;
//   2. «треба щоб тап по самому тексту теж відкривав — але чітко, а не будь-де;
//      згорнути вже по кнопці».
//
// 🔴 КОРІНЬ ПЕРШОЇ: `openPageScreen` кликав `wireClamps` ДО того, як екран потрапляв
// у документ. У відʼєднаного елемента `getComputedStyle` віддає порожні значення →
// `line-height` = NaN → усі метрики NaN. Умова «текст короткий» (`NaN <= NaN`) хибна,
// тож функція не виходила, а `max-height: NaNpx` браузер мовчки ігнорував: текст
// лишався ПОВНИЙ, а кнопку домальовано. Саме це стенд і відтворює нижче.
//
// ⚠️ Ганяємо СПРАВЖНІЙ код: `wireClamps`/`clampMetrics`/`togglePostText`/`isCleanTap`
// витягнуті текстом із src/tabs/feed.js.
import { chromium } from 'playwright';
import { launch, projectFile, reporter } from './_lib.mjs';

const SRC = projectFile('src/tabs/feed.js');
const CSS = projectFile('style/feed.css');

const clampFrom = SRC.indexOf('const CLAMP_LINES');
const clampTo   = SRC.indexOf('// Оновлення крапок/лічильника каруселі');
const tapFrom   = SRC.indexOf('const TAP_SLOP');
const tapTo     = SRC.indexOf('// ── Делегування подій на картках');
if (clampFrom < 0 || clampTo < 0 || tapFrom < 0 || tapTo < 0) {
  console.log('❌ не знайшов блоки згортання/тапу у feed.js'); process.exit(1);
}
const CLAMP = SRC.slice(clampFrom, clampTo);
const TAP   = SRC.slice(tapFrom, tapTo);

const { ok, done } = reporter();

const LONG  = 'Туристична Олика — місце, яке варто відкрити для себе. '.repeat(20);
const SHORT = 'Коротке оголошення на два рядки.';

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{--fd-ink:#111;--fd-muted:#888;--fd-surface:#fff;--fd-line:#ddd;--fd-accent:#722F37}
  body{width:390px}
  ${CSS}
</style></head><body>
  <div id="list">
    <article data-post="1"><div class="fd-text">${LONG}</div></article>
    <article data-post="2"><div class="fd-text">${SHORT}</div></article>
  </div>
</body></html>`;

const browser = await launch(chromium);
const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
await page.setContent(PAGE);

const r = await page.evaluate(async ({ clamp, tap, long }) => {
  const api = new Function(clamp + '\n' + tap +
    '\nreturn { wireClamps, togglePostText, expandedPosts, isCleanTap, clampMetrics, CLAMP_LINES };')();
  const { wireClamps, togglePostText, expandedPosts, isCleanTap, clampMetrics, CLAMP_LINES } = api;
  const list = document.getElementById('list');
  const textOf = id => list.querySelector(`[data-post="${id}"] .fd-text`);
  const btnOf  = id => list.querySelector(`[data-post="${id}"] .fd-more`);
  // Фактична висота, яку бачить око.
  const hOf = id => Math.round(textOf(id).getBoundingClientRect().height);

  // ── а) ВІДТВОРЕННЯ БАГА: міряємо ВІДʼЄДНАНИЙ вузол ─────────────────────────
  const detached = document.createElement('article');
  detached.dataset.post = '9';
  detached.innerHTML = `<div class="fd-text">${long}</div>`;
  const metricsDetached = clampMetrics(detached.querySelector('.fd-text'));
  wireClamps(detached);
  const detachedBtn = !!detached.querySelector('.fd-more');
  const detachedMaxH = detached.querySelector('.fd-text').style.maxHeight;

  // ── б) НОРМАЛЬНИЙ ШЛЯХ: вузол у документі ─────────────────────────────────
  expandedPosts.clear();
  wireClamps(list);
  const collapsedH = hOf(1);
  const label0 = btnOf(1)?.textContent || '';
  const shortHasBtn = !!btnOf(2);            // короткий пост кнопки не отримує
  const fullH = (() => {                     // повна висота тексту для порівняння
    const el = textOf(1), keep = el.style.maxHeight;
    el.style.maxHeight = 'none'; const h = Math.round(el.getBoundingClientRect().height);
    el.style.maxHeight = keep; return h;
  })();

  // ── в) кнопка справді розгортає (а не лише міняє напис) ───────────────────
  // ⚠️ Міряємо ПІСЛЯ анімації (0.28с у `.fd-text--anim`). Перша версія стенда читала
  // висоту одразу після виклику і показувала «165px → 165px», тобто «не розгорнулось» —
  // хоча то просто перехід ще не почався. Око Вови дивиться на кінцевий стан.
  togglePostText(1, btnOf(1));
  await new Promise(res => setTimeout(res, 450));
  const afterTapH = hOf(1);
  const label1 = btnOf(1).textContent;

  // ── г) правило чистого тапу ───────────────────────────────────────────────
  const down = { x: 100, y: 200 };
  const tapSame  = isCleanTap(down, { clientX: 100, clientY: 200 });
  const tapSmall = isCleanTap(down, { clientX: 106, clientY: 204 });   // дрібне тремтіння
  const tapDrag  = isCleanTap(down, { clientX: 100, clientY: 260 });   // це вже скрол
  const tapNoDown = isCleanTap(null, { clientX: 100, clientY: 200 });

  // виділення тексту скасовує розгортання
  const range = document.createRange();
  range.selectNodeContents(textOf(2));
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  const tapWhileSelecting = isCleanTap(down, { clientX: 100, clientY: 200 });
  sel.removeAllRanges();

  return {
    metricsDetachedLh: metricsDetached.lh, detachedBtn, detachedMaxH,
    collapsedH, fullH, afterTapH, label0, label1, shortHasBtn,
    lines: CLAMP_LINES, tapSame, tapSmall, tapDrag, tapNoDown, tapWhileSelecting,
  };
}, { clamp: CLAMP, tap: TAP, long: LONG });

// 1. Сам корінь бага — доказ, що вимірювання відʼєднаного вузла дає сміття.
ok('відʼєднаний вузол справді не має чим міряти', !isFinite(r.metricsDetachedLh),
   `line-height = ${r.metricsDetachedLh}`);
ok('на відʼєднаному вузлі кнопка НЕ зʼявляється (був баг Вови)', !r.detachedBtn,
   r.detachedBtn ? `кнопка є, max-height="${r.detachedMaxH}"` : 'кнопки нема — правильно');

// 2. Нормальний шлях: текст справді обрізано, і кнопка каже правду.
ok('довгий текст згорнуто', r.collapsedH < r.fullH, `${r.collapsedH}px з ${r.fullH}px`);
ok('кнопка каже «Показати більше», коли текст справді згорнутий',
   r.label0.includes('Показати більше'), `«${r.label0}»`);
ok('короткий пост кнопки не отримує', !r.shortHasBtn);

// 3. Натискання ЗБІЛЬШУЄ текст, а не лише перемикає напис (скарга Вови дослівно).
ok('після натискання текст став вищим', r.afterTapH > r.collapsedH,
   `${r.collapsedH}px → ${r.afterTapH}px`);
ok('і напис змінився на «Згорнути»', r.label1 === 'Згорнути', `«${r.label1}»`);

// 4. Правило «чіткого» тапу по тексту.
ok('тап на місці — розгортає', r.tapSame);
ok('дрібне тремтіння пальця (6px) — теж тап', r.tapSmall);
ok('рух на 60px — це скрол, не тап', !r.tapDrag);
ok('клік без дотику (нізвідки) — не тап', !r.tapNoDown);
ok('коли текст виділяють — не розгортаємо', !r.tapWhileSelecting);

// ── 5. 🔴 ЗГОРНУТО З ПЕРШОГО КАДРУ, БЕЗ БЛИМАННЯ (20.08) ─────────────────────
// Скарга Вови: «коли заходжу в стрічку, верхнє оголошення відразу розгорнуте і
// блимає та згортається».
//
// 🔬 КОРІНЬ ЗАМІРЯНО, А НЕ ВГАДАНО. Стрічка малюється, поки її вкладка
// `display: none`. У прихованого елемента `scrollHeight` дорівнює НУЛЮ, тож
// `contentFull` виходив **−20**, і умова «текст короткий» спрацьовувала на
// будь-якому тексті: згортання не ставилось узагалі. Людина відкривала вкладку
// і бачила **538px** повного тексту, який складався до 165px аж при наступному
// вимірі. Це і є «блимає».
//
// 🛑 ЧОМУ ЦЕ ОКРЕМА СЦЕНА: усі перевірки вище ганяють ВИДИМИЙ список — на ньому
// вада не відтворюється взагалі. Сторож без прихованої вкладки був зелений над
// зламаною поведінкою.
const мірка = await (async () => {
  const page2 = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await page2.setContent(PAGE.replace('<div id="list">', '<div id="tab" style="display:none"><div id="list">')
                             .replace('</div>\n</body>', '</div></div>\n</body>')
                             .replace(/class="fd-text"/g, 'class="fd-text fd-text--preclip"'));
  const res = await page2.evaluate(({ clamp }) => {
    const api = new Function(clamp + '\nreturn { wireClamps };')();
    const list = document.getElementById('list');
    const h = id => Math.round(list.querySelector(`[data-post="${id}"] .fd-text`).getBoundingClientRect().height);
    api.wireClamps(list);                                  // рендер на ПРИХОВАНІЙ вкладці
    const залишивсяPreclip = list.querySelector('[data-post="1"] .fd-text')
                                 .classList.contains('fd-text--preclip');
    document.getElementById('tab').style.display = 'block';
    const перший = { довгий: h(1), короткий: h(2) };        // те, що око бачить ПЕРШИМ
    api.wireClamps(list);                                  // перемір, коли вкладку відкрили
    const усталений = { довгий: h(1), короткий: h(2),
                        кнопка: !!list.querySelector('[data-post="1"] .fd-more') };
    return { залишивсяPreclip, перший, усталений };
  }, { clamp: CLAMP });
  await page2.close();
  return res;
})();

ok('🔴 на прихованій вкладці згортання НЕ знімається (текст лишається складеним)',
   мірка.залишивсяPreclip);
// 🔑 Головна перевірка: перший кадр і усталений стан мусять збігатись. Саме їхня
// РІЗНИЦЯ і є те блимання, яке видно оком.
ok('🔴 довгий пост не стрибає: перший кадр = усталений стан',
   Math.abs(мірка.перший.довгий - мірка.усталений.довгий) <= 2,
   `${мірка.перший.довгий}px → ${мірка.усталений.довгий}px`);
// ⚠️ Другий бік тієї самої вимоги. Перша спроба фіксу (нульовий `padding-bottom`
// у preclip) прибрала стрибок довгого поста і перенесла його на короткі: 31 → 43.
// Без цієї перевірки такий «фікс» зійшов би за успіх.
ok('🔴 короткий пост теж не стрибає (фікс не переніс ваду на нього)',
   Math.abs(мірка.перший.короткий - мірка.усталений.короткий) <= 2,
   `${мірка.перший.короткий}px → ${мірка.усталений.короткий}px`);
ok('після показу вкладки кнопка з\'являється', мірка.усталений.кнопка);

// Стеля в CSS і константа в JS мусять означати ОДНЕ число рядків: розходження
// дало б стрибок на кожному довгому пості, і саме такий, який важко пояснити.
const рядківCSS = (CSS.match(/--fd-clamp-lines:\s*(\d+)/) || [])[1];
ok('🔴 число рядків у CSS збігається з CLAMP_LINES у feed.js',
   Number(рядківCSS) === r.lines, `CSS ${рядківCSS}, JS ${r.lines}`);

await browser.close();
done();
