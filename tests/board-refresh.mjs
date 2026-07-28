// Стенд №18: ДОШКА — власна дія не кидає екран на початок.
//
// Вова 28.07: «виправи все, що залишилось». По Дошці лишалось одне: коли ти в «Моїх
// оголошеннях» завершуєш / повертаєш / видаляєш оголошення (або публікуєш нове як
// довірений автор), летіла подія `cstl-posts-changed` → `renderBoard()` → перечитати
// все і зібрати ВКЛАДКУ заново. Тобто той самий стрибок, що був у «Стрічці» до 27.07.
//
// 🔴 ЩО МІРЯЄМО: після повної перемальовки СПИСКУ всередині `keepScroll` картка, на яку
// людина дивиться, лишається на тому самому місці. Дошка — корок у ДВІ колонки
// (картки розкладені за парністю `i % 2`), тому патчити одну картку там нема сенсу:
// поява чи зникнення однієї законно перекладає всі наступні. Якір це витримує, бо
// рахує по видимій КАРТЦІ, а не по індексу.
//
// ⚠️ Ганяємо СПРАВЖНІЙ `keepScroll` — зі спільного модуля core/list-patch.js, того
// самого, яким користується «Стрічка».
import { chromium } from 'playwright';
import { launch, projectFile, reporter } from './_lib.mjs';

const LP    = projectFile('src/core/list-patch.js').replace(/^export /gm, '');
const BOARD = projectFile('src/tabs/board.js');
const { ok, done } = reporter();

// Дошка позначає картки інакше, ніж «Стрічка»: `data-post-id` замість `data-post`.
// Саме тому в `keepScroll` є параметр `key` — інакше довелось би робити другу копію.
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  /* overflow-anchor:none — умови Safari/iPhone: там браузерного якоря нема. */
  #main{height:700px;overflow-y:auto;overflow-anchor:none;background:#eee}
  .cm-board-col{display:flex;flex-direction:column;gap:10px;width:50%}
  .cork{display:flex;gap:10px;align-items:flex-start}
  article{background:#fff;padding:8px;font:14px/1.4 sans-serif}
</style></head><body><div id="main"><div id="bd-body"></div></div></body></html>`;

const browser = await launch(chromium);
const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
await page.setContent(PAGE);

const r = await page.evaluate(({ lp }) => {
  const { keepScroll } = new Function(lp + '\nreturn { keepScroll };')();
  const main = document.getElementById('main');
  const body = document.getElementById('bd-body');

  // Корок як у Дошці: дві колонки, картки за парністю індексу.
  const build = (ids) => {
    const col = (list) => list.map(id =>
      `<article class="bd-card" data-post-id="${id}" style="height:${140 + (id % 3) * 70}px">оголошення ${id}</article>`).join('');
    body.innerHTML = `<div class="cork">
      <div class="cm-board-col">${col(ids.filter((_, i) => i % 2 === 0))}</div>
      <div class="cm-board-col">${col(ids.filter((_, i) => i % 2 === 1))}</div>
    </div>`;
  };
  const ids = Array.from({ length: 20 }, (_, i) => i + 1);

  const posOf = id => {
    const el = body.querySelector(`[data-post-id="${id}"]`);
    return el ? Math.round(el.getBoundingClientRect().top - main.getBoundingClientRect().top) : null;
  };
  const visibleId = () => {
    const t = main.getBoundingClientRect().top;
    return [...body.querySelectorAll('[data-post-id]')]
      .find(c => c.getBoundingClientRect().bottom > t + 1)?.dataset.postId;
  };

  // Сценарій: людина прогорнула Дошку і завершила ОДНЕ зі своїх оголошень (воно зникає).
  const run = (withAnchor) => {
    build(ids);
    main.scrollTop = 420;
    const watch = visibleId();
    const before = posOf(watch);
    // «Завершив оголошення №3» → повна перемальовка списку без нього.
    const rerender = () => build(ids.filter(id => id !== 3));
    if (withAnchor) keepScroll(main, rerender, null, 'data-post-id'); else rerender();
    return { watch, drift: posOf(watch) - before, scroll: main.scrollTop };
  };

  const off = run(false);
  const on  = run(true);

  // Шумовий поріг: перемальовка ТИМ САМИМ вмістом не має рухати нічого.
  build(ids); main.scrollTop = 420;
  const watchN = visibleId(); const beforeN = posOf(watchN);
  keepScroll(main, () => build(ids), null, 'data-post-id');
  const noise = posOf(watchN) - beforeN;

  return { off, on, noise, sameCard: on.watch === off.watch };
}, { lp: LP });

ok('шумовий поріг: перемальовка тим самим вмістом не рухає екран', r.noise === 0, `${r.noise}px`);
ok('контроль — без якоря повна перемальовка справді зсуває', r.off.drift !== 0,
   `зсув ${r.off.drift}px, прокрутка ${r.off.scroll}`);
ok('з якорем картка під пальцем лишається на місці', r.on.drift === 0,
   `зсув ${r.on.drift}px, прокрутка ${r.on.scroll}`);
ok('дивились на ту саму картку в обох прогонах', r.sameCard, `картка ${r.on.watch}`);

// ── Проводка в самій Дошці ──────────────────────────────────────────────────
// Симптом був однією конкретною командою, тож її відсутність — це і є наслідок.
const handler = BOARD.slice(BOARD.indexOf("addEventListener('cstl-posts-changed'"), BOARD.indexOf("addEventListener('cstl-posts-changed'") + 220);
ok('власна дія більше не кличе renderBoard напряму', !/cstl-posts-changed'[^)]*\)\s*=>\s*renderBoard\(\)/.test(handler), handler.split('\n')[0]);
ok('власна дія йде через мʼяке оновлення', handler.includes('refreshBoardKeepingPlace'));
ok('мʼяке оновлення тримає позицію через keepScroll',
   /refreshBoardKeepingPlace[\s\S]{0,900}keepScroll\(/.test(BOARD));
ok('мʼяке оновлення має запасний шлях, якщо дані не прийшли',
   /if \(!ok \|\| !el \|\| !body\) \{ renderBoard\(\); return; \}/.test(BOARD));
// Читання даних не задвоєне: `renderBoard` і мʼяке оновлення беруть його з одного місця.
ok('запит до бази лишився в ОДНОМУ місці (loadBoardData)',
   (BOARD.match(/fetchPublishedPosts\(\)/g) || []).length === 1);

await browser.close();
done();
