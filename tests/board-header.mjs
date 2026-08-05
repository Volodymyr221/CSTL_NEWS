// Стенд №19: ЗГОРТАННЯ ШАПКИ ДОШКИ НЕ ЗСУВАЄ СПИСОК.
//
// Вова 28.07: «треба зробити, щоб ховалася оце поле воду з категоріями та і так далі…
// щоб не займало багато місця».
//
// 🔴 ЩО САМЕ МІРЯЄМО (урок 27.07: критерій має міряти те, що ПОБАЧИТЬ ВОВА).
// Не «чи є клас `--collapsed`» і не форму запису CSS, а ДВА наслідки в пікселях:
//   1. картка, на яку людина дивиться, лишається на тому самому місці (0px);
//   2. шапка справді зникає з очей — її нижній край іде вище за шапку застосунку.
//
// 🔴 ЧОМУ ТУТ ОБОВ'ЯЗКОВИЙ КОНТРОЛЬ. Якщо міряти лише новий варіант, «0px зсуву» ще
// нічого не доводить — може, у цій сцені взагалі нічому зсуватись. Тому кожна перевірка
// має ПАРУ: те саме згортання, але зроблене СТАРИМ способом (через висоту шапки, як було
// до 28.07, коли ховалась лише назва). Старий спосіб МУСИТЬ дати ненульовий зсув —
// інакше стенд не міряє нічого, і зелене світло не варте нічого.
//
// ⚠️ ГАНЯЄМО СПРАВЖНІЙ CSS ПРОЄКТУ (`style/base.css` + `style/community.css`), а не
// копію значень. Саме тут копія була б небезпечна: якщо хтось повернe згортання на
// висоту, стенд із власною копією лишився б зеленим і збрехав.
//
// ⚠️ ЧОГО ЦЕЙ СТЕНД НЕ ПЕРЕВІРЯЄ І ЧОМУ ЧЕСНО ЦЕ СКАЗАТИ:
// пороги `HIDE_AFTER 110` / `SHOW_AFTER 70` / `TOP_ZONE 90` (`board.js`) — це числа
// «за відчуттям пальця». Браузер на сервері не відтворює інерцію прокрутки iOS, тож
// «правильність» цих чисел може підтвердити лише Вова на iPhone. Стенд перевіряє
// МЕХАНІКУ згортання, а не його поріг — і не вдає, що покриває більше.
import { chromium } from 'playwright';
import { launch, projectFile, reporter, zoneCss } from './_lib.mjs';

const BASE_CSS = projectFile('style/base.css');
const COMM_CSS = zoneCss();

// Сторож присутності: якщо згортання колись повернуть на висоту, цей рядок зникне,
// і стенд скаже це прямо, а не буде мовчки міряти не те.
// ⚠️ Регулярка навмисно НЕ вимагає точного `translateY(-100%)`. Перша версія вимагала —
// і впала, коли зсув став `calc(-100% - 6px)` (запас під рамку плашки). Поведінка при
// цьому не змінилась ані на крок. Це рівно та помилка, що вже коштувала часу 27.07:
// перевірка чіплялась за ФОРМУ ЗАПИСУ замість наслідку. Тепер вимагаємо лише
// «зсув по вертикалі на власну висоту», а сам наслідок міряють перевірки нижче.
if (!/#board-content\s+\.bd-controls--collapsed\s*\{[^}]*translateY\([^)]*-100%/.test(COMM_CSS)) {
  console.log('❌ у community.css немає зсуву translateY(…-100%…) на #board-content .bd-controls--collapsed');
  console.log('   Якщо згортання свідомо переписали — треба переписати і цей стенд, а не гасити його.');
  process.exit(1);
}

const { ok, done } = reporter();

// Сцена, максимально близька до справжньої Дошки: шапка застосунку (fixed, z-100),
// прибита шапка Дошки (.bd-controls, fixed, z-90) і тіло зі списком карток.
// Висоти карток різні — як живий корок у дві колонки.
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<style>
${BASE_CSS}
${COMM_CSS}
/* Умови iPhone: у Safari НЕМА overflow-anchor, тобто браузер сам НЕ компенсує
   зміну висоти вмісту. Без цього рядка Chromium приховав би зсув — рівно так
   перша версія стенда patch-scroll колись «довела», що бага не існує.
   ⚠️ Зворотні лапки в CSS усередині цього шаблонного рядка ставити НЕ МОЖНА —
   вони закривають сам шаблон (на цьому стенд уже впав один раз). */
.app-main { overflow-anchor: none; }
/* Стенд не має safe-area (це не справжній iPhone) — задаємо явно, щоб числа
   були відтворювані, а не залежали від оточення. */
:root { --safe-top: 0px; }
</style></head><body>
  <header class="app-header">CSTL LIFE</header>
  <main class="app-main" data-tab="board">
    <div id="page-board" class="page">
      <div class="board-bg" aria-hidden="true"></div>
      <div id="board-content" class="board-content">
        <div class="bd-controls">
          <div class="bd-titlebar">
            <h2 class="sr-only">Дошка оголошень</h2>
            <div class="bd-subrow">
              <span class="bd-count" id="bd-count">15 оголошень</span>
              <div class="bd-loc-filter">
                <button class="bd-loc-btn"><span class="bd-loc-label">Олицька громада</span></button>
              </div>
            </div>
          </div>
          <div class="bd-search-row">
            <div class="bd-cat-filter-wrap"><button class="bd-cat-filter">≡</button></div>
            <div class="bd-search"><input class="bd-search-input" placeholder="Пошук по дошці..."></div>
          </div>
        </div>
        <div class="bd-body" id="bd-body">
          <div class="cm-board-corkboard board-corkboard--full">
            <div class="cm-board-col">${Array.from({ length: 8 }, (_, i) =>
              `<article class="cm-board-note bd-card bd-card--board" data-post-id="L${i}" style="height:${200 + (i % 3) * 80}px">ліва ${i}</article>`).join('')}</div>
            <div class="cm-board-col">${Array.from({ length: 8 }, (_, i) =>
              `<article class="cm-board-note bd-card bd-card--board" data-post-id="R${i}" style="height:${240 + (i % 3) * 60}px">права ${i}</article>`).join('')}</div>
          </div>
        </div>
      </div>
    </div>
  </main>
</body></html>`;

const browser = await launch(chromium);
const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
await page.setContent(PAGE);

// Відступ тіла під прибиту шапку — те саме, що робить syncBoardBodyOffset() у board.js.
// Беремо ЖИВУ висоту, як і бойовий код, а не число з голови.
await page.evaluate(() => {
  const c = document.querySelector('.bd-controls');
  document.getElementById('bd-body').style.paddingTop = (c.offsetHeight + 12) + 'px';
});

// 🔴 ЧОМУ ТУТ ОЧІКУВАННЯ, А НЕ МИТТЄВИЙ ВИМІР.
// Перша версія цього стенда завалила дві перевірки — і винна була МІРКА, не код.
// У шапки є `transition: transform 0.28s / box-shadow 0.2s`. Вимір одразу після
// додавання класу читає ПЕРШИЙ КАДР: transform ще нульовий, тінь ще стара. Стенд
// «доводив», що шапка не поїхала і тінь не знята, хоча за 300мс усе на місці.
// Це та сама пастка, що вже коштувала часу 27.07 («міряв перший кадр анімації»).
// Тому кінцеву геометрію міряємо ПІСЛЯ доїзду, а зсув списку — і одразу, і після:
// стрибок може статись у будь-якій з двох точок, і обидві однаково видно оком.
const SETTLE = 420;   // 0.28s transform + запас на неквантований rAF у headless

// Один прогін. mode: 'transform' — так, як зроблено 28.07;
// 'height' — КОНТРОЛЬ: старий спосіб (шапка зменшує висоту, тіло перераховує відступ).
const run = (mode) => page.evaluate((mode) => {
  const main = document.querySelector('.app-main');
  const controls = document.querySelector('.bd-controls');
  const body = document.getElementById('bd-body');

  // Вихідний стан перед кожним прогоном — інакше сценарії тягли б наслідки один одного.
  controls.classList.remove('bd-controls--collapsed');
  controls.style.cssText = '';
  body.style.paddingTop = (controls.offsetHeight + 12) + 'px';
  main.scrollTop = 900;                       // людина прогорнула вниз

  const H0 = controls.offsetHeight;
  // Картка, яку людина зараз бачить угорі — та сама, за якою вона й помітить стрибок.
  const watch = [...body.querySelectorAll('[data-post-id]')]
    .find(c => c.getBoundingClientRect().bottom > controls.getBoundingClientRect().bottom + 1);
  const posBefore = watch.getBoundingClientRect().top;

  if (mode === 'transform') {
    controls.classList.add('bd-controls--collapsed');
    // Так само, як у бойовому коді: padding тіла НЕ чіпаємо.
  } else {
    // КОНТРОЛЬ — старий спосіб: шапка стискається, і відступ тіла мусить піти за нею
    // (саме це й робив би syncBoardBodyOffset, якби висота змінювалась).
    controls.style.height = '0px';
    controls.style.overflow = 'hidden';
    body.style.paddingTop = '12px';
  }

  // Зсув У МОМЕНТ зміни (перший кадр) — тут ловиться стрибок від перерахунку розкладки.
  const driftNow = Math.round(watch.getBoundingClientRect().top - posBefore);

  // Дані кінцевого стану добираємо окремо, коли анімація доїде (див. коментар вище).
  window.__probe = () => {
    const cRect = controls.getBoundingClientRect();
    const headerBottom = document.querySelector('.app-header').getBoundingClientRect().bottom;
    return {
      driftNow,
      driftSettled: Math.round(watch.getBoundingClientRect().top - posBefore),
      height: controls.offsetHeight,           // transform не змінює висоту в розкладці
      height0: H0,
      // ≤0 = нижній край шапки Дошки вже НЕ нижче за низ шапки застосунку,
      // тобто вона повністю заїхала під непрозорий шар і зникла з очей.
      hiddenAboveHeader: Math.round(cRect.bottom - headerBottom),
      paddingTop: Math.round(parseFloat(getComputedStyle(body).paddingTop)),
      shadow: getComputedStyle(controls).boxShadow,
      pointerEvents: getComputedStyle(controls).pointerEvents,
    };
  };
  return null;
}, mode).then(async () => {
  await page.waitForTimeout(SETTLE);
  return page.evaluate(() => window.__probe());
});

// ── 1. ШУМОВИЙ ПОРІГ (урок 27.07: спершу зміряй стан ІЗ САМИМ СОБОЮ) ───────────
const noise = await page.evaluate(() => {
  const main = document.querySelector('.app-main');
  const body = document.getElementById('bd-body');
  main.scrollTop = 900;
  const watch = body.querySelector('[data-post-id]');
  const a = watch.getBoundingClientRect().top;
  const b = watch.getBoundingClientRect().top;   // нічого не робимо
  return Math.round(b - a);
});
ok('шумовий поріг сцени = 0 (нічого не робимо — ніщо не рухається)', noise === 0, `${noise}px`);

// ── 2. КОНТРОЛЬ: старий спосіб (згортання висотою) СПРАВДІ зсуває список ───────
const ctl = await run('height');
ok('КОНТРОЛЬ — згортання через висоту зсуває список (доводить, що стенд міряє реальне)',
   Math.abs(ctl.driftNow) > 40, `${ctl.driftNow}px`);

// ── 3. ГОЛОВНЕ: новий спосіб не рухає список ані на піксель ────────────────────
const tr = await run('transform');
ok('шапка їде вгору — видима картка НЕ рухається (перший кадр)', tr.driftNow === 0, `${tr.driftNow}px`);
ok('…і після доїзду анімації теж не рухається', tr.driftSettled === 0, `${tr.driftSettled}px`);

// ── 4. Відступ тіла не змінюється (корінь стрибка був саме в ньому) ────────────
ok('padding-top тіла не змінився при згортанні', tr.paddingTop === ctl.height0 + 12,
   `${tr.paddingTop}px, шапка ${ctl.height0}px + зазор 12`);

// ── 5. Висота шапки в розкладці лишається (transform не чіпає розміри) ─────────
ok('offsetHeight шапки не змінився — syncBoardBodyOffset не має що перераховувати',
   tr.height === tr.height0, `${tr.height0} → ${tr.height}`);

// ── 6. Шапка справді пішла з очей (під шапку застосунку) ───────────────────────
ok('нижній край шапки Дошки піднявся під шапку застосунку', tr.hiddenAboveHeader <= 0,
   `${tr.hiddenAboveHeader}px відносно низу .app-header`);

// ── 7-8. Схована шапка не ловить тапи і не малює тінь ──────────────────────────
// Обидва — з того самого прогону `tr` (виміряні ПІСЛЯ доїзду анімації). Окремі
// page.evaluate тут і збрехали в першій версії: тінь має свій transition 0.2s, тож
// миттєвий getComputedStyle повертав проміжний кадр, а не кінцеве `none`.
ok('схована шапка не перехоплює тапи (pointer-events: none)', tr.pointerEvents === 'none', tr.pointerEvents);
ok('тінь у згорнутому стані знята (інакше визирала б з-під шапки застосунку смугою)',
   tr.shadow === 'none', tr.shadow);

// ── 9. Повернення: клас знято → шапка на місці і список знову не рухається ─────
const back = await page.evaluate(() => {
  const main = document.querySelector('.app-main');
  const body = document.getElementById('bd-body');
  const controls = document.querySelector('.bd-controls');
  controls.style.cssText = '';
  controls.classList.add('bd-controls--collapsed');
  body.style.paddingTop = (controls.offsetHeight + 12) + 'px';
  main.scrollTop = 900;
  const watch = [...body.querySelectorAll('[data-post-id]')]
    .find(c => c.getBoundingClientRect().bottom > 120);
  const before = watch.getBoundingClientRect().top;
  controls.classList.remove('bd-controls--collapsed');       // рух угору → шапка назад
  window.__back = () => ({
    drift: Math.round(watch.getBoundingClientRect().top - before),
    transform: getComputedStyle(controls).transform,
  });
  return null;
}).then(async () => {
  await page.waitForTimeout(SETTLE);       // те саме: чекаємо доїзду, не міряємо перший кадр
  return page.evaluate(() => window.__back());
});
ok('повернення шапки теж не рухає список', back.drift === 0, `${back.drift}px`);
ok('розгорнута шапка без зсуву (transform: none/identity)',
   back.transform === 'none' || back.transform === 'matrix(1, 0, 0, 1, 0, 0)', back.transform);

// ── 10. Заголовок лишився для читача екрана ────────────────────────────────────
const sr = await page.evaluate(() => {
  const h = document.querySelector('#board-content h2.sr-only');
  if (!h) return null;
  const r = h.getBoundingClientRect();
  const cs = getComputedStyle(h);
  return { text: h.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height),
           display: cs.display, visibility: cs.visibility };
});
ok('заголовок «Дошка оголошень» є в дереві доступності', sr && sr.text === 'Дошка оголошень',
   sr ? sr.text : 'нема');
ok('…і при цьому не займає місця на екрані', sr && sr.w <= 1 && sr.h <= 1,
   sr ? `${sr.w}×${sr.h}px` : '—');
ok('…і НЕ прихований display/visibility (інакше зник би і для читача екрана)',
   sr && sr.display !== 'none' && sr.visibility !== 'hidden',
   sr ? `${sr.display} / ${sr.visibility}` : '—');

await browser.close();
done();
