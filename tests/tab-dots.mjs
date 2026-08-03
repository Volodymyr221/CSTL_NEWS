// Стенд №28: КРАПКА «Є НОВЕ» НА ІКОНЦІ ВКЛАДКИ + НАКЛАДКА В FAB-МЕНЮ.
//
// Вова 30.07: «треба легеньку позначку біля іконки вкладки, якщо є якесь повідомлення…
// бо важко замітити що тобі писали, якщо ти не заходив в дошку» і «в кнопці FAB…
// N кількість чатів розширює кнопку саму, треба зробити як накладку на кут кнопки».
//
// 🔴 ЩО МІРЯЄМО І ЧОМУ САМЕ ТАК.
// Дві речі, які ламаються МОВЧКИ:
//   1) накладка мусить НЕ впливати на ширину пункту меню. Це і був дефект: число
//      сиділо в плашці з `white-space: nowrap`, тож меню «дихало» від стану. Тому
//      міряємо ШИРИНУ пункту з числом і без — різниця мусить бути НУЛЬ.
//   2) крапка мусить стояти на КУТКУ іконки, а не десь у колонці вкладки. Міряємо
//      геометрію: центр крапки правіше і вище за центр іконки, і вона в її межах ±.
//
// ⚠️ Обидві перевірки мають КОНТРОЛЬ на синтезованому «до»: без нього «різниця 0»
// була б зеленою навіть якби ми міряли не ті вузли.
//
// ⚠️ ЧОГО СТЕНД НЕ ПОКРИВАЄ: чи крапка «легенька» на око і чи не тісно їй у таб-барі
// на живому екрані — це вирішує Вова на iPhone. Стенд стежить лише за геометрією.
import { chromium } from 'playwright';
import { launch, projectFile, reporter } from './_lib.mjs';

const BASE_CSS = projectFile('style/base.css');
const TAB_CSS  = projectFile('style/tabbar.css');
const COMM_CSS = projectFile('style/community.css');
const INDEX    = projectFile('index.html');
const BOARD_JS = projectFile('src/tabs/board.js');
const CHAT_JS  = projectFile('src/tabs/board-chat.js');
const DISC_JS  = projectFile('src/tabs/board-discussions.js');

const { ok, done } = reporter();

// ── Сторожі присутності (те, що ламається без жодної візуальної ознаки) ───────
const guards = [
  [/data-tab-dot="board"/, INDEX, 'у розмітці є крапка вкладки «Дошка»'],
  [/data-tab-dot="discussions"/, INDEX, 'у розмітці є крапка вкладки «Обговорення»'],
  // Стрічку свідомо НЕ позначаємо — рішення Вови «давай без стрічки».
  // 🔄 02.08: бейдж переїхав на КОНВЕРТ У ШАПЦІ (дії й листування помінялись
  // місцями). Сенс перевірки той самий, що був 30.07: число не має розпирати вміст —
  // тоді плашка з `white-space: nowrap` ширшала на кожне нове повідомлення і пункт
  // меню стрибав у розмірі. Тому бейдж — окремий вузол-накладка, а не текст усередині.
  // 🔄 04.08: конверт (а з ним і бейдж) переїхав НА НИЖНІЙ КРУГ — кнопки Дошки
  // помінялись місцями за прямим замовленням Вови. Сенс перевірки не змінився:
  // число не має розпирати вміст, тому бейдж лишається окремим вузлом-накладкою.
  [/id="bd-msgs-fab"[\s\S]{0,300}?<span class="board-trigger-badge"/, BOARD_JS,
   'бейдж непрочитаних — накладка на конверті, не текст усередині'],
  [/export function paintTabDots/, CHAT_JS, 'paintTabDots існує'],
  [/paintUnreadBadge[\s\S]{0,1600}paintTabDots\(\)/, CHAT_JS,
   'крапки малюються тим самим кроком, що й бейджі'],
  [/export function unseenDiscussionsCount/, DISC_JS, 'підрахунок нових обговорень існує'],
  [/cstl-disc-seen/, DISC_JS, 'прочитана тема сигналить подією (без циклу імпортів)'],
  [/addEventListener\('cstl-disc-seen'/, CHAT_JS, 'сигнал прочитаної теми слухається'],
];
for (const [re, src, label] of guards) ok(label, re.test(src), re.test(src) ? 'на місці' : '🔴 ВІДСУТНЄ');

// Підрахунок мусить бути ЛОКАЛЬНИМ: якщо тут зʼявиться мережа, кожна перемальовка
// таб-бару стане запитом у базу — рівно та хвороба, яку цією сесією прибрали з бейджа.
const cnt = /export function unseenDiscussionsCount\(\)[\s\S]*?\n\}/.exec(DISC_JS);
ok('підрахунок обговорень без мережі',
   !!cnt && !/fetch|await|supa|\.rpc\(/.test(cnt[0]),
   !!cnt && !/fetch|await|supa|\.rpc\(/.test(cnt[0]) ? 'локально' : '🔴 у ньому запит у базу');
// Час нормалізується: коментарі приходять ISO-РЯДКОМ, межа перегляду — ЧИСЛО.
ok('час нормалізується перед порівнянням',
   !!cnt && /tsMs\(/.test(cnt[0]),
   !!cnt && /tsMs\(/.test(cnt[0]) ? 'через tsMs()' : '🔴 пряме порівняння рядка з числом дасть NaN → завжди false');

// ── Роздільник «Нові повідомлення» в Обговореннях (фікс 30.07) ───────────────
// 🔴 Це був окремий баг, знайдений під час роботи над крапкою: `t > dividerTs`, де
// `t` — ISO-РЯДОК із `created_at`, а `dividerTs` — ЧИСЛО мс. Тобто умова була завжди
// false і роздільник не зʼявлявся НІКОЛИ. Вова сказав «так» → виправлено через `tsMs`.
// ⚠️ Чесно про межу: `chatMessagesHtml` приватна, тож поведінку тут не проженеш.
// Перевіряємо ДВА рубежі: (1) у коді стоїть нормалізація; (2) числами — що стара
// форма справді ламалась, а нова працює. Другий рубіж і є доказ, що фікс не косметика.
const cmp = /const isNew = dividerTs > 0 && ([^;]+);/.exec(DISC_JS);
ok('роздільник порівнює НОРМАЛІЗОВАНИЙ час',
   !!cmp && /tsMs\(/.test(cmp[1]),
   cmp ? cmp[1].trim() : '🔴 рядок порівняння не знайдено');

const ISO = '2026-07-30T07:00:00.000Z';
const seen = new Date('2026-07-30T06:00:00.000Z').getTime();
ok('контроль: СТАРА форма (рядок vs число) давала false',
   (ISO > seen) === false, `'${ISO}' > ${seen} → false, бо Number(ISO) = NaN`);
ok('нова форма (через мілісекунди) працює',
   new Date(ISO).getTime() > seen, `${new Date(ISO).getTime()} > ${seen} → true`);

// ── Сторож проти пастки зі зворотними лапками (додано 30.07) ─────────────────
// Пастка спіймала мене ПʼЯТЬ разів за сесію, і раз через неї в репозиторій пішла
// зламана збірка. Тепер її ловить `scripts/check-imports.js` ДО esbuild — стежимо,
// щоб перевірку не прибрали.
const CHECKER = projectFile('scripts/check-imports.js');
ok('check-imports ловить зворотну лапку в HTML-коментарі',
   /checkBacktickInHtmlComment/.test(CHECKER) && /ЗВОРОТНА ЛАПКА/.test(CHECKER),
   /checkBacktickInHtmlComment/.test(CHECKER) ? 'перевірка на місці' : '🔴 ВІДСУТНЯ');

// ── Геометрія в живому браузері ──────────────────────────────────────────────
const tabbarHtml = INDEX.slice(INDEX.indexOf('<nav class="tab-bar">'), INDEX.indexOf('</nav>', INDEX.indexOf('<nav class="tab-bar">')) + 6);

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
${TAB_CSS}
${COMM_CSS}
* { animation: none !important; transition: none !important; }
/* Меню FAB — розкрите, щоб пункти мали реальну ширину */
.board-fab-menu { opacity: 1 !important; }
.board-fab-item { opacity: 1 !important; }
</style></head><body>
${tabbarHtml}
<div class="board-fab open">
  <div class="board-fab-menu">
    <button class="board-fab-item" type="button">
      <span class="board-fab-label">Повідомлення</span>
      <span class="board-fab-ic">✉<span class="board-fab-msgs-badge" id="board-fab-msgs-badge"></span></span>
    </button>
  </div>
</div>
</body></html>`;

const browser = await launch(chromium);
const pg = await browser.newPage({ viewport: { width: 390, height: 844 } });
await pg.setContent(PAGE);

// 1) ШИРИНА ПУНКТУ НЕ ЗАЛЕЖИТЬ ВІД ЧИСЛА — головний критерій прохання Вови.
const widths = await pg.evaluate(() => {
  const item = document.querySelector('.board-fab-item');
  const badge = document.getElementById('board-fab-msgs-badge');
  const w = () => Math.round(item.getBoundingClientRect().width);
  const before = w();
  badge.textContent = '12';
  badge.style.display = 'block';
  const after = w();
  return { before, after };
});
ok('число НЕ розширює пункт меню',
   widths.before === widths.after,
   `без числа ${widths.before}px · з числом ${widths.after}px`);

// 2) КОНТРОЛЬ: повертаємо бейдж у плашку (як було) — ширина МУСИТЬ поїхати.
const ctlWidths = await pg.evaluate(() => {
  const item = document.querySelector('.board-fab-item');
  const label = document.querySelector('.board-fab-label');
  const badge = document.getElementById('board-fab-msgs-badge');
  badge.remove();
  const w = () => Math.round(item.getBoundingClientRect().width);
  const before = w();
  const b2 = document.createElement('span');
  // стан ДО фіксу: у плашці, inline, з відступом
  b2.style.cssText = 'display:inline-block;margin-left:6px;min-width:16px;height:16px;padding:0 4px';
  b2.textContent = '12';
  label.appendChild(b2);
  return { before, after: w() };
});
ok('контроль: у плашці число ШИРИЛО пункт (як і скаржився Вова)',
   ctlWidths.after > ctlWidths.before,
   `було ${ctlWidths.before}px → стало ${ctlWidths.after}px (+${ctlWidths.after - ctlWidths.before}px)`);

// 3) КРАПКА СТОЇТЬ НА КУТКУ ІКОНКИ (а не десь у колонці вкладки).
const dot = await pg.evaluate(() => {
  const wrap = document.querySelector('[data-tab="board"] .tab-ico-wrap');
  const icon = wrap.querySelector('.tab-icon');
  const d = wrap.querySelector('[data-tab-dot]');
  d.removeAttribute('hidden');
  const i = icon.getBoundingClientRect(), b = d.getBoundingClientRect();
  return {
    size: Math.round(b.width),
    rightOfCenter: Math.round((b.x + b.width / 2) - (i.x + i.width / 2)),
    aboveCenter: Math.round((i.y + i.height / 2) - (b.y + b.height / 2)),
    withinX: b.x + b.width <= i.right + 8 && b.x >= i.x,
  };
});
ok('крапка правіше центру іконки', dot.rightOfCenter > 4, `+${dot.rightOfCenter}px`);
ok('крапка вище центру іконки', dot.aboveCenter > 4, `+${dot.aboveCenter}px`);
ok('крапка не вилітає за іконку', dot.withinX, 'у межах іконки (+8px запас)');
ok('крапка дрібна («легенька»)', dot.size >= 6 && dot.size <= 12, `${dot.size}px`);

await browser.close();
done();
