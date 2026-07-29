// Стенд №23: НА ДОШЦІ І ЕКРАНАХ FAB НЕ ЛИШИЛОСЬ КРЕМОВИХ ПОВЕРХОНЬ.
//
// Вова 29.07: «всі кремові кольори, які знаходяться в вкладці дошка і в всіх її
// пунктах підменю треба замінити в такому стилі як ми міняли фон».
//
// 🔴 ЩО САМЕ МІРЯЄМО (урок 27.07: критерій має міряти те, що ПОБАЧИТЬ ВОВА).
// Не «чи є в CSS слово --card-cream» — таку перевірку обходить будь-який новий hex.
// Міряємо ЖИВИЙ обчислений колір кожної поверхні і рахуємо ТЕПЛОТУ = R − B:
//     #FAF8EF (--card-cream)  → 250−239 = 11
//     #EAE4D2 (--paper-deep)  → 234−210 = 24
//     #F4F1E6 (--paper)       → 244−230 = 14
//     #E6E6E3 (--board-bg)    → 230−227 =  3   ← нейтраль
//     #FFFFFF (--board-card)  → 255−255 =  0
//     #E4E4E1 (--board-press) → 228−225 =  3
// Поріг 6 лежить у розриві між нейтралью (≤3) і найслабшим кремовим (11) — тобто
// жодне з чинних значень не стоїть на межі.
//
// 🔴 ЧОМУ ТУТ ОБОВ'ЯЗКОВИЙ КОНТРОЛЬ. «Усе нейтральне» саме собою нічого не доводить:
// так само зелено було б, якби стенд міряв не ті елементи або взагалі порожню сцену.
// Тому кожна поверхня міряється ДВІЧІ: у чинному CSS і в сцені, де ті самі селектори
// навмисно повернуті на кремові токени (стан ДО фіксу). Другий прогін МУСИТЬ впасти —
// інакше перевірка не розрізняє кремове від нейтрального, і зелене світло не варте нічого.
//
// ⚠️ ГАНЯЄМО СПРАВЖНІЙ CSS ПРОЄКТУ, а не копію значень.
//
// ⚠️ ЧОГО ЦЕЙ СТЕНД НЕ ПЕРЕВІРЯЄ І ЧОМУ ЧЕСНО ЦЕ СКАЗАТИ:
// стани `:active` (натиск пальцем) тут перевіряються ПРИСУТНІСТЮ правила в CSS, а не
// живим кольором: натиск у headless-браузері відтворюється нестабільно, і фальшиве
// падіння гірше за відсутність перевірки. Чи натиск «відчувається так само» — може
// сказати лише Вова на iPhone; підбір зроблено за контрастом (1.274 проти 1.271 було).
import { chromium } from 'playwright';
import { launch, projectFile, reporter } from './_lib.mjs';

const BASE_CSS = projectFile('style/base.css');
const COMM_CSS = projectFile('style/community.css');
const MSGS_CSS = projectFile('style/messages.css');

const { ok, done } = reporter();

// ── Сторожі присутності для станів :active (їх не міряємо живим кольором) ─────
const PRESS_GUARDS = [
  ['community.css', COMM_CSS, /\.cm-board-msg-btn:active\s*\{[^}]*--board-press/,  '.cm-board-msg-btn:active'],
  ['community.css', COMM_CSS, /\.cm-board-call:active\s*\{[^}]*--board-press/,     '.cm-board-call:active'],
  ['community.css', COMM_CSS, /\.bm-photo-slot:active\s*\{[^}]*--board-press/,     '.bm-photo-slot:active'],
  ['messages.css',  MSGS_CSS, /\.pm-ctx:active\s*\{[^}]*--board-press/,            '.pm-ctx:active'],
  ['messages.css',  MSGS_CSS, /\.pm-ctx-call:active\s*\{[^}]*--board-press/,       '.pm-ctx-call:active'],
  ['messages.css',  MSGS_CSS, /\.pm-actions button:active\s*\{[^}]*--board-press/, '.pm-actions button:active'],
];
for (const [file, css, re, label] of PRESS_GUARDS) {
  ok(`натиск ${label} узяв --board-press`, re.test(css), file);
}

// ── Сцена: справжні класи на справжньому CSS ──────────────────────────────────
// Кожен вузол несе data-опис ролі — щоб у звіті було видно ЩО саме тепле.
const SCENE = `
<div class="board-bg"></div>
<div id="board-content" class="board-content">
  <div class="bd-controls">
    <div class="bd-search-row">
      <div class="bd-cat-filter-wrap">
        <button class="bd-cat-filter" data-t="кнопка-фільтр категорій"></button>
        <div class="bd-cat-menu" data-t="меню категорій"><button class="bd-cat-mi"></button></div>
      </div>
      <div class="bd-search" data-t="поле пошуку">
        <input class="bd-search-input">
        <button class="bd-search-clear" data-t="кружечок × у пошуку"></button>
      </div>
      <div class="bd-loc-filter">
        <div class="bd-loc-menu" data-t="меню локації"><button class="bd-loc-mi"></button></div>
      </div>
    </div>
  </div>
  <div class="bd-body">
    <div class="cm-board-note" data-t="картка оголошення">текст</div>
  </div>
</div>

<!-- Обговорення: НЕ чіпали свідомо (теплий беж, рішення Вови 20.07) -->
<div id="disc-content">
  <div class="bd-search"><button class="bd-search-clear" data-t="ОБГ: кружечок × у пошуку"></button></div>
</div>

<!-- Екрани, що відкриваються з FAB Дошки = «пункти підменю» -->
<div class="pm-screen visible" data-t="екран FAB">
  <div class="pm-ctxwrap">
    <div class="pm-ctx-tabs" data-t="смужка чіпів контекстів">
      <button class="pm-ctx-tab" data-t="чіп контексту (неактивний)"></button>
    </div>
    <button class="pm-ctx" data-t="картка оголошення в чаті">
      <span class="pm-ctx-thumb" data-t="підкладка фото оголошення"></span>
    </button>
  </div>
  <div class="pm-chips"><button class="pm-chip" data-t="чіп-фільтр списку"></button></div>
  <div class="pm-stream">
    <div class="pm-group pm-group--other"><div class="pm-bubble">
      <span class="pm-reply-reveal" data-t="кружечок «відповісти» при свайпі"></span>
    </div></div>
  </div>
  <div class="pm-composebar" data-t="бар «Відповідь/Редагування»"></div>
  <div class="pm-form" data-t="бар вводу"></div>
</div>
<div class="pm-actions-back"><div class="pm-actions" data-t="лист дій над повідомленням">
  <button data-t="кнопка в листі дій"></button>
</div></div>
`;

// Кремові оголошення СТАНОМ ДО ФІКСУ — рівно ті рядки, які замінено.
// Це і є контроль: з ними стенд мусить впасти.
const REVERT_CSS = `
#board-content .bd-search, #board-content .bd-cat-filter { background: var(--card-cream); }
#board-content .bd-search-clear { background: var(--paper-deep); }
.bd-cat-menu, .bd-loc-menu { background: var(--card-cream); }
#board-content .cm-board-note:not(.cm-board-note--official) { background: #FBFBF9; }
.pm-form, .pm-chip, .pm-ctx-tabs, .pm-ctx, .pm-composebar, .pm-reply-reveal,
.pm-actions { background: var(--card-cream); }
.pm-ctx-tab { background: #FFFFFF; }
.pm-ctx-thumb { background-color: var(--paper-deep); }
`;

function page(extraCss) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
${COMM_CSS}
${MSGS_CSS}
/* Стенд не має safe-area — глушимо, щоб геометрія не залежала від пристрою. */
:root { --sat: 0px; --sab: 0px; }
/* Усе видимим і на своєму місці: нас цікавить КОЛІР, не розкладка. */
* { animation: none !important; transition: none !important; }
.pm-screen, .pm-actions-back, .bd-cat-menu, .bd-loc-menu {
  position: static !important; transform: none !important;
  opacity: 1 !important; display: block !important; visibility: visible !important;
}
${extraCss}
</style></head><body>${SCENE}</body></html>`;
}

const WARM_LIMIT = 6;   // розрив між нейтралью (≤3) і найслабшим кремовим (11)

async function measure(pg, html) {
  await pg.setContent(html);
  return pg.$$eval('[data-t]', nodes => nodes.map(n => {
    const bg = getComputedStyle(n).backgroundColor;
    const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    const [r, g, b] = m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
    const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0').toUpperCase()).join('');
    return { role: n.dataset.t, hex, warmth: r - b, transparent: !m || /,\s*0\)$/.test(bg) };
  }));
}

const browser = await launch(chromium);
const pg = await browser.newPage({ viewport: { width: 390, height: 844 } });

// ── 0) ШУМОВИЙ ПОРІГ: та сама сцена двічі → однакові кольори ─────────────────
// (правило CLAUDE.md: спершу зміряй порівняння стану з САМИМ СОБОЮ)
const a = await measure(pg, page(''));
const b = await measure(pg, page(''));
ok('шум: та сама сцена двічі дає ті самі кольори',
   JSON.stringify(a) === JSON.stringify(b), `${a.length} поверхонь`);
ok('сцена не порожня: усі поверхні мають заливку',
   a.length >= 14 && a.every(x => !x.transparent),
   a.filter(x => x.transparent).map(x => x.role).join(', ') || `${a.length} поверхонь`);

// ── 1) ЧИННИЙ CSS: жодної теплої поверхні на Дошці й екранах FAB ─────────────
const board = a.filter(x => !x.role.startsWith('ОБГ:'));
for (const s of board) {
  ok(`нейтрально: ${s.role}`, s.warmth <= WARM_LIMIT, `${s.hex} · теплота ${s.warmth}`);
}

// ── 2) НЕ ЗАЧЕПИЛИ ОБГОВОРЕННЯ (теплий беж — свідоме рішення Вови 20.07) ────
// Це «сторож необережності»: якщо хтось поправить кремове БЕЗ scoped-селектора,
// Обговорення похолодніють, і стенд скаже це прямо.
const disc = a.filter(x => x.role.startsWith('ОБГ:'));
for (const s of disc) {
  ok(`Обговорення лишились теплими: ${s.role.replace('ОБГ: ', '')}`,
     s.warmth > WARM_LIMIT, `${s.hex} · теплота ${s.warmth}`);
}

// ── 3) КОНТРОЛЬ: повертаємо кремові оголошення — стенд МУСИТЬ їх побачити ────
const reverted = await measure(pg, page(REVERT_CSS));
const caught = reverted.filter(x => !x.role.startsWith('ОБГ:') && x.warmth > WARM_LIMIT);
ok('контроль: на СТАРИХ кремових значеннях перевірка падає',
   caught.length >= 10, `зловлено ${caught.length} теплих: ` +
   caught.slice(0, 4).map(x => `${x.role} ${x.hex}`).join(' · '));

// Контроль другого роду: чіп контексту. До фіксу він був БІЛИЙ на кремовій смужці;
// тепер смужка біла, тож білий чіп на ній зник би. Міряємо саме це — різницю
// заливок чіпа і смужки під ним, а не колір чіпа окремо.
const chip  = a.find(x => x.role.startsWith('чіп контексту'));
const strip = a.find(x => x.role.startsWith('смужка чіпів'));
ok('чіп контексту відрізняється від смужки під ним',
   chip.hex !== strip.hex, `чіп ${chip.hex} · смужка ${strip.hex}`);

await browser.close();
done();
