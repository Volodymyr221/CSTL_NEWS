// Стенд №24: ПЛАВАЮЧА КНОПКА НЕ НАКРИВАЄ ОСТАННЮ КАРТКУ.
//
// 🔴 Звідки взявся (аудит Дошки 30.07, пункт Д-В2). `.board-trigger--fixed` знала свій
// розмір (56px) і зазор від таб-бару (14px), а `.board-content` мав окремий
// `padding-bottom: 24px` із коментом «щоб остання картка не зависала високо». Числа
// не були зв'язані — і не сходились: контент доходив до 764px, верх кнопки був на 718px,
// тобто вони ділили смугу **46px**.
//
// 🔴 ЧОМУ ЦЕ НЕ ЗЛОВИЛИ ОКОМ, І ЧОМУ САМЕ ЦЕЙ СТЕНД ПОТРІБЕН.
// На живих даних (7 карток) дефекту НЕ ВИДНО: найнижчою випадково була картка ЛІВОЇ
// колонки, а кнопка стоїть праворуч (`right: 18px`). Тобто «подивився і все гаразд» тут
// нічого не доводить — треба міряти не «чи перетинається зараз», а **чи існує смуга,
// у якій перетин можливий**. Саме цю смугу стенд і міряє.
//
// ⚠️ ЧОГО ЦЕЙ СТЕНД НЕ ПЕРЕВІРЯЄ: чи відступ «гарний на око». 12px повітря над кнопкою —
// число за відчуттям, підтвердити його може лише Вова на iPhone. Стенд стежить лише за
// тим, щоб відступ НЕ БУВ МЕНШИЙ за смугу кнопки.
import { chromium } from 'playwright';
import { launch, projectFile, reporter, zoneCss, baseCss} from './_lib.mjs';

const BASE_CSS = baseCss();
const COMM_CSS = zoneCss();

const { ok, done } = reporter();

// Сторож присутності: відступ мусить бути ПОХІДНИМ від токенів кнопки, а не числом.
// Якщо хтось повернe магічне число, зв'язок розірветься знову — і стенд скаже це прямо.
// ⚠️ Читаємо декларацію до `;`, а НЕ до дужки: `calc(var(--fab-gap) + var(--fab-size))`
// містить внутрішні `)`, тож `[^)]*` спинявся на першій із них і правило «не збігалось»
// ніколи. Це рівно та пастка, від якої застерігає CLAUDE.md («регулярка перевіряла форму
// запису») — і вона спрацювала тут одразу.
if (!/\.board-content\s*\{[^}]*padding-bottom:[^;]*--fab-gap[^;]*--fab-size/.test(COMM_CSS)) {
  console.log('❌ .board-content padding-bottom більше не похідний від --fab-gap/--fab-size');
  console.log('   Саме незв\'язані числа й дали баг 30.07. Якщо це свідома зміна — переписати стенд.');
  process.exit(1);
}

// Сцена: скролер + дві колонки карток різної висоти + FAB, як на живій Дошці.
//
// 🔴 КІЛЬКІСТЬ КАРТОК ТУТ — НЕ ВИПАДКОВА, І ЦЕ ГОЛОВНЕ ПРО ЦЮ СЦЕНУ.
// Перша версія мала 9 карток, і контроль ПРОВАЛИВСЯ: на старих 24px перетину не було.
// Причина — я відтворив рівно ту випадковість, що й на проді: при 9 картках остання
// (№9) лишається сама в ряду і сидить у ЛІВІЙ колонці, а кнопка стоїть ПРАВОРУЧ.
// Тобто сцена «доводила», що бага немає, — точно як живі дані.
// Треба ПАРНА кількість, щоб найнижчою була картка ПРАВОЇ колонки, під кнопкою.
// Мораль: сцена, у якій баг не відтворюється, робить стенд декорацією.
const cards = (n, h) => Array.from({ length: n }, (_, i) =>
  `<div class="cm-board-note" style="height:${h[i % h.length]}px">картка ${i + 1}</div>`).join('');

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<style>
${BASE_CSS}
${COMM_CSS}
/* Стенд не на iPhone — safe-area глушимо явно, щоб числа не залежали від пристрою.
   Це коректно: safe-area зсуває І кнопку, І padding .app-main однаково, тож на
   ширину спільної смуги вона не впливає (перевірено арифметикою в аудиті). */
* { animation: none !important; transition: none !important; }
.app-main { height: 844px; overflow-y: auto; }
/* Дві колонки, як корок Дошки */
.bd-body { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: start; padding-left: 10px; padding-right: 10px; }
.cm-board-note { border-radius: 12px; }
</style></head><body>
<div class="app-main" data-tab="board">
  <div id="board-content" class="board-content">
    <div class="bd-body">${cards(10, [120, 200])}</div>
    <div class="board-fab" id="board-fab">
      <button class="cm-board-trigger board-trigger--fixed" id="board-trigger"></button>
    </div>
  </div>
</div>
</body></html>`;

const browser = await launch(chromium);
const pg = await browser.newPage({ viewport: { width: 390, height: 844 } });
await pg.setContent(PAGE);

// ── 0) ШУМОВИЙ ПОРІГ: та сама сцена двічі → ті самі числа ────────────────────
const read = () => pg.evaluate(() => {
  const main = document.querySelector('.app-main');
  const fab  = document.getElementById('board-trigger').getBoundingClientRect();
  const cs   = getComputedStyle(document.querySelector('.board-content'));
  main.scrollTop = main.scrollHeight;          // саме низ списку нас і цікавить
  const cards = [...document.querySelectorAll('.cm-board-note')];
  const lowest = cards.reduce((a, c) => Math.max(a, c.getBoundingClientRect().bottom), 0);
  // Скільки з КОЖНОЇ картки заходить під кнопку (перетин по обох осях).
  let worst = 0, worstIdx = -1;
  cards.forEach((c, i) => {
    const b = c.getBoundingClientRect();
    const ox = Math.min(fab.right, b.right) - Math.max(fab.left, b.left);
    const oy = Math.min(fab.bottom, b.bottom) - Math.max(fab.top, b.top);
    if (ox > 0 && oy > 0 && oy > worst) { worst = oy; worstIdx = i + 1; }
  });
  return {
    padBottom: Math.round(parseFloat(cs.paddingBottom)),
    fabTop: Math.round(fab.top), fabH: Math.round(fab.height),
    lowestCardBottom: Math.round(lowest),
    clearance: Math.round(fab.top - lowest),   // >0 = картки закінчуються ВИЩЕ кнопки
    worstOverlap: Math.round(worst), worstIdx,
  };
});
const m1 = await read();
const m2 = await read();
ok('шум: та сама сцена двічі дає ті самі числа',
   JSON.stringify(m1) === JSON.stringify(m2), JSON.stringify(m1));

// ── 1) ГОЛОВНЕ: жодна картка не заходить під кнопку ─────────────────────────
ok('жодна картка не перетинається з кнопкою',
   m1.worstOverlap === 0,
   m1.worstOverlap === 0 ? 'перетин 0px'
     : `картка №${m1.worstIdx} заходить на ${m1.worstOverlap}px`);

ok('низ списку закінчується ВИЩЕ за кнопку',
   m1.clearance >= 0, `зазор ${m1.clearance}px (низ картки ${m1.lowestCardBottom}, верх кнопки ${m1.fabTop})`);

// ── 2) ВІДСТУП ПОКРИВАЄ СМУГУ КНОПКИ (а не «просто якийсь») ────────────────
// Це перевірка ПРИЧИНИ, а не наслідку: навіть якби в цій сцені картки випадково
// не дійшли до кнопки, замалий відступ лишався б бомбою на інших даних.
ok('відступ списку ≥ смуга кнопки',
   m1.padBottom >= m1.fabH + 14, `відступ ${m1.padBottom}px, кнопка ${m1.fabH}px + зазор 14px`);

// ── 3) КОНТРОЛЬ: повертаємо старі 24px — стенд МУСИТЬ упасти ───────────────
// Без цього «перетин 0px» нічого не доводить: може, у сцені нічому перетинатись.
await pg.addStyleTag({ content: '.board-content { padding-bottom: 24px !important; }' });
const bad = await read();
ok('контроль: на старих 24px картка справді заходить під кнопку',
   bad.worstOverlap > 0,
   bad.worstOverlap > 0 ? `картка №${bad.worstIdx} заходить на ${bad.worstOverlap}px`
                        : '🔴 сцена не відтворює баг — стенд нічого не доводить');

await browser.close();
done();
