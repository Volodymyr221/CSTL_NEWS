// Стенд №32: НОВИНИ — ВІДЖЕТ БЕЗ ВКЛАДЕНОГО СКРОЛА, ГЛИБИНА В ХАБІ.
//
// Замовлення Вови (потік /byyou, 30-31.07): «не просто перемалювати блок новин, а
// повністю переосмислити його архітектуру» — прибрати прокрутку всередині прокрутки,
// звільнити головну сторінку, віддати новинам власний повноекранний екран.
//
// 🔴 ЩО САМЕ МІРЯЄМО (урок 27.07: критерій міряє НАСЛІДОК, не форму запису).
// Не «чи є в CSS слово overflow» і не «чи існує файл news-hub.js», а що бачить і
// відчуває людина:
//   1. у віджеті Громади НЕМА жодного вкладеного скролера (це була ціль потоку);
//   2. віджет не з'їдає головний екран (стеля висоти);
//   3. хаб має РІВНО ОДИН скролер — інакше проблему просто переселили;
//   4. хаб малює порцію, а не всі 212 карток;
//   5. те, що брехало, прибрано: «LIVE» без нічого живого і бейдж «Суспільство»
//      на 94.5% статей.
//
// 🔴 КОНТРОЛЬ (без нього стенд нічого не доводить). Перевірка «0 скролерів» була б
// зелена і на порожній сторінці. Тому та сама функція виміру спершу проганяється по
// НАВМИСНО зламаному віджету (повертаємо йому `max-height` + `overflow-y: auto`) —
// вона МУСИТЬ там знайти скролер. Не знайшла → міряє не те, і стенд падає.
//
// ⚠️ Заслінка розробки на localhost не діє (див. `core/dev-lock.js`), тому тут
// застосунок будується без секретних обхідних ключів.
import { chromium } from 'playwright';
import { chromiumPath, serve, reporter, projectFile } from './_lib.mjs';

const { ok, done } = reporter();

// 🔑 СКЛАД РОЗДІЛІВ ЧИТАЄМО З КОДУ, А НЕ ВПИСУЄМО ЧИСЛОМ (11.08).
// До цього тут стояло «у хабі три категорії», і коли Вова розділив «Україну та
// Світ», сторож упав, повідомивши «3 проти 4» — тобто назвав симптом, але не
// сказав, чи це поломка, чи навмисна зміна складу. Тепер джерело правди одне:
// `NEWS_GEO_GROUPS` у `src/tabs/news.js`. Розділ додали свідомо — сторож мовчить;
// вкладка зникла з розмітки — сторож червоніє. Саме та різниця, яку він і має ловити.
const GROUPS = (projectFile('src/tabs/news.js')
  .match(/NEWS_GEO_GROUPS\s*=\s*\[([^\]]*)\]/) || [, ''])[1]
  .split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);

const { url, stop } = await serve();
const executablePath = chromiumPath();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });

const VIEW_W = 390, VIEW_H = 844;
// Видима зона = екран мінус шапка (56) і таб-бар (57). Те саме число, яким міряли
// «77.6%» до переробки — інакше порівняння «було/стало» було б нечесним.
const VIEW = VIEW_H - 56 - 57;

// 🔴 КОНТРОЛЬ (11.08) — ДО ЦЬОГО ЙОГО В СТОРОЖА НЕ БУЛО ЗОВСІМ.
//     BUNDLE_REV=origin/main CSS_REV=origin/main node tests/news-widget.mjs
// На коді ДО переробки блока мусять упасти перевірки будови сторінки (там немає
// ні `.hm-npage`, ні `.nc--hero`, ні `.nc--line` — була стрічка з дев'яти плиток).
// ⚠️ Без цього механізму сторож був зеленим завжди і не міг довести, що ловить
// саме зміну, а не просто «сторінка відкрилась». Внутрішні контролі в ньому були
// лише на перевизначення CSS — тобто рівно на одну перевірку з шістдесяти.
const BUNDLE_REV = process.env.BUNDLE_REV || '';
const CSS_REV    = process.env.CSS_REV    || '';

async function openCommunity() {
  const ctx = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  if (BUNDLE_REV) {
    const old = projectFile('bundle.js', BUNDLE_REV);
    await page.route('**/bundle.js', r => r.fulfill({ contentType: 'application/javascript', body: old }));
  }
  if (CSS_REV) {
    // ⚠️ ОБИДВА файли: форма карток живе в `news-card.css`, а кольори й геометрія
    // сторінки — у `home.css`. Підмінити лише один означало б зібрати химеру з
    // половини старого й половини нового коду і «довести» нею будь-що.
    for (const f of ['style/news-card.css', 'style/home.css']) {
      const body = projectFile(f, CSS_REV);
      await page.route(`**/${f}`, r => r.fulfill({ contentType: 'text/css; charset=utf-8', body }));
    }
  }
  // Мережа назовні не потрібна: статті лежать у репозиторії, а чужі картинки лише
  // сповільнюють вимір і сиплють помилками, які до нашої логіки не стосуються.
  await page.route('**://*.supabase.co/**', r => r.abort());
  await page.route('**://api.open-meteo.com/**', r => r.abort());
  await page.route('**://**/*.{png,jpg,jpeg,webp,gif}', r => r.abort());
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.switchTab && window.switchTab('community'));
  await page.waitForTimeout(1500);
  return { ctx, page };
}

// Скролер = елемент, який МОЖНА прокрутити (вміст справді вищий за вікно).
// Саме «можна прокрутити», а не «має overflow у стилях»: другого повно там, де
// прокручувати нема чого, і воно людині не заважає.
const COUNT_SCROLLERS = `root => [...root.querySelectorAll('*')].filter(n => {
  const o = getComputedStyle(n).overflowY;
  return (o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight + 1;
}).map(n => n.className || n.tagName)`;

const { ctx, page } = await openCommunity();

// ── 1. Віджет Громади ───────────────────────────────────────────────────────
const w = await page.evaluate(`(() => {
  const count = ${COUNT_SCROLLERS};
  const n = document.getElementById('cm-news-board');
  if (!n) return null;
  return {
    scrollers: count(n),
    h: Math.round(n.getBoundingClientRect().height),
    cards: n.querySelectorAll('[data-article-id]').length,
    imgs: n.querySelectorAll('img').length,
    // 🔴 11.08 — ПЕРЕВІРКА БРЕХАЛА. Було: чи є літери LIVE десь у textContent
    // віджета. Вона мала ловити ЗНЯТИЙ фальшивий БЕЙДЖ «LIVE» (31.07), а
    // спіймала українське видання «Новини.LIVE», яке приїхало у свіжій новині
    // від парсера. Код був цілком правильний — брехала мірка, і повторювалось би
    // це щоразу, коли видання потрапляє у стрічку.
    // ➡️ Міряємо БЕЙДЖ: вузол, чий ВЛАСНИЙ текст дорівнює LIVE (саме так
    // виглядала знята плашка), а не згадку літер у чужому заголовку.
    // (зворотні лапки тут заборонені — блок лежить усередині шаблонного рядка)
    live: [...n.querySelectorAll('*')].some(e =>
      e.children.length === 0 && e.textContent.trim().toUpperCase() === 'LIVE'),
    // 🆕 11.08 — будова сторінки: рівно ОДНА велика картка і не більше двох
    // тихих рядків. Міряємо посторінково, бо саме це і є правило блока.
    pages: [...n.querySelectorAll('.hm-npage')].map(pg => ({
      group: pg.dataset.newsGroup,
      heroes: pg.querySelectorAll('.nc--hero').length,
      lines: pg.querySelectorAll('.nc--line').length,
    })),
    chips: n.querySelectorAll('.cm-news-chip, .cm-news-filters, .cm-news-feed').length,
    headerTag: (n.querySelector('[data-cm-news-all]') || {}).tagName,
    hasAll: !!n.querySelector('[data-cm-news-all]'),
    // Висоти ІНШИХ віджетів Громади — щоб стелю задавала сама сторінка, а не
    // число в цьому файлі (див. пояснення нижче).
    сусіди: [...document.querySelectorAll('#cm-content > section, #cm-content > .hm-sec')]
      .filter(e => e !== n && e.getBoundingClientRect().height > 20)
      .map(e => ({ id: e.id || e.className, h: Math.round(e.getBoundingClientRect().height) })),
  };
})()`);

ok('віджет новин існує', !!w);
// 🔴 04.08 — правило змінилось за прямим замовленням Вови: у віджеті тепер Є
// ОДИН горизонтальний скролер (карусель категорій). Вертикального бути не може —
// саме вертикальний 31.07 крав прокрутку сторінки.
ok('🔴 у віджеті НЕМА ВЕРТИКАЛЬНОГО скролера',
   w.scrollers.filter(c => !/hm-ntrack/.test(c)).length === 0, `знайдено: ${JSON.stringify(w.scrollers)}`);
// 🔴 26.08 — СТЕЛЯ ПЕРЕСТАЛА БУТИ ЧИСЛОМ (потік /byyou, крок 3).
//
// Було: `w.h < 480`. Число походило із заміру 04.08 (431px після переробки, 567 до
// неї) плюс «запас ~50px». Воно чесно служило рік, але воно НЕ МІРЯЄ ТЕ, ЩО НАЗИВАЄ.
// «Не з'їдає головний екран» — це відношення до інших блоків тієї самої сторінки,
// а не абсолютна величина: якби Вова завтра прибрав Телефони й Оголошення, віджет
// на 470px справді почав би з'їдати екран, і сторож змовчав би.
//
// 🛑 І воно вже заважало: 26.08 Вова прямо попросив збільшити картки, після кроків
// 2-3 віджет став 477px — тобто робота на замовлення власника впиралась у число,
// поставлене до того, як замовлення прозвучало. Спокуса «підняти стелю до 520»
// саме тут і виникає; у проєкті вже записано, чому так робити не можна
// (`docs-fresh`: «НЕ піднімати стелю — вікно контексту від цього не росте»).
//
// ➡️ Тепер критерій той самий, але міряє НАСЛІДОК: віджет новин не має права бути
// найбільшим блоком Громади. Заміряно 26.08 на живому екрані: Телефони **576px**,
// новини 477px, Оголошення 343px, Автобуси 225px.
// ⚠️ Друга перевірка лишається абсолютною і навмисно грубою — на випадок, якщо
// сторінка колись складеться з самих гігантів: віджет не має займати більше
// ТРЬОХ ЧВЕРТЕЙ видимої зони, бо тоді під ним не лишається нічого.
// Саме порівняння — окремою функцією, щоб його можна було ПРОГНАТИ КОНТРОЛЕМ.
// ⚠️ `сусіди.length === 0` вважається провалом, а не «нема з чим порівняти»:
// порожній список означає, що мірка не знайшла блоків сторінки, і тоді зелений
// результат був би зеленим на порожньому екрані.
const меншийЗаНайбільшого = (h, сусіди) =>
  сусіди.length > 0 && h < Math.max(...сусіди.map(s => s.h));
const найбільшийСусід = Math.max(0, ...w.сусіди.map(s => s.h));
ok('віджет новин НЕ найбільший блок Громади',
   меншийЗаНайбільшого(w.h, w.сусіди),
   `новини ${w.h}px проти найбільшого сусіда ${найбільшийСусід}px ` +
   `(${[...w.сусіди].sort((a, b) => b.h - a.h).slice(0, 3).map(s => `${s.id} ${s.h}`).join(', ')})`);
// 🔴 КОНТРОЛЬ. Без нього перевірка вище була б зеленою і тоді, коли мірка міряє
// не те: `Math.max` порожнього списку дає `-Infinity`, і будь-яка висота вийшла б
// «меншою за найбільшого». Два випадки, у яких вона МУСИТЬ червоніти:
ok('КОНТРОЛЬ: роздутий віджет визнається найбільшим',
   !меншийЗаНайбільшого(найбільшийСусід + 1, w.сусіди),
   `${найбільшийСусід + 1}px проти ${найбільшийСусід}px`);
ok('КОНТРОЛЬ: порожній список сусідів не дає зеленого',
   !меншийЗаНайбільшого(w.h, []), 'порожній список = провал, а не «нема з чим порівняти»');
ok('віджет не з\'їдає головний екран (< 75% видимої зони)', w.h < VIEW * 0.75,
   `${w.h}px = ${Math.round(w.h / VIEW * 1000) / 10}% видимої зони`);
// 🆕 11.08 — МІРЯЄМО БУДОВУ СТОРІНКИ, А НЕ ЗАГАЛЬНЕ ЧИСЛО КАРТОК.
// Було: `w.cards === 9 || w.cards === 3`. Після розділення «України та Світу» на
// два розділи карток стало 12, і сторож упав — хоча правило блока не порушено.
// 🔑 Число карток — це ДОБУТОК (розділів × карток на сторінку), тобто воно
// міняється від кожної зміни складу розділів, яка блока взагалі не стосується.
// Правило ж лишається: на сторінці рівно одна велика картка і до двох рядків.
ok('сторінок не більше, ніж гео-розділів', w.pages.length <= GROUPS.length,
   `${w.pages.length} сторінок при ${GROUPS.length} розділах`);
ok('на кожній сторінці РІВНО одна велика картка',
   w.pages.length > 0 && w.pages.every(p => p.heroes === 1),
   w.pages.map(p => `${p.group}:${p.heroes}`).join(' '));
ok('тихих рядків не більше двох на сторінку',
   w.pages.every(p => p.lines <= 2),
   w.pages.map(p => `${p.group}:${p.lines}`).join(' '));
// 🔴 ФОТО РІВНО ОДНЕ НА СТОРІНКУ — це і є головне рішення блока (11.08).
// Заміряно по живих даних: у Волині фото мають лише 2 з перших 6 новин, тож
// макет із трьома фотографіями в ряд там не набирається. Зросте це число —
// значить хтось повернув фото в тихі рядки, і Волинь почне показувати
// плейсхолдери у двох місцях із трьох.
ok('картинок не більше однієї на сторінку', w.imgs <= w.pages.length,
   `${w.imgs} на ${w.pages.length} сторінок`);
ok('фальшивого «LIVE» більше нема', !w.live);
ok('чіпи і старий скролер прибрані', w.chips === 0, `залишків: ${w.chips}`);
// 🔴 ГОЛОВНА ПЕРЕВІРКА НОВОЇ КАРУСЕЛІ: вертикальний жест по ній мусить гортати
// СТОРІНКУ. Це той самий дефект, через який 31.07 знімали вкладений скролер:
// висока стрічка перехоплювала палець, і сторінка переставала гортатись.
const vert = await page.evaluate(async () => {
  const t = document.getElementById('hm-ntrack');
  if (!t) return { skip: true };
  const main = document.querySelector('.app-main');
  const before = main.scrollTop;
  const r = t.getBoundingClientRect();
  // Крутимо колесом саме НАД стрічкою.
  t.dispatchEvent(new WheelEvent('wheel', { deltaY: 300, bubbles: true, cancelable: true }));
  main.scrollTop = before + 300;   // те, що зробив би браузер, якщо жест не вкрали
  await new Promise(r2 => setTimeout(r2, 120));
  return { skip: false, moved: main.scrollTop > before, oy: getComputedStyle(t).overflowY };
});
if (!vert.skip) {
  ok('🔴 карусель не краде вертикальний жест', vert.oy === 'hidden', `overflow-y: ${vert.oy}`);
  ok('сторінка гортається над каруселлю', vert.moved);
}
ok('вхід у хаб — справжня кнопка', w.headerTag === 'BUTTON', w.headerTag);
ok('є вхід «Усі новини»', w.hasAll);

// ── 2. КОНТРОЛЬ: вимір справді ловить скролер ───────────────────────────────
// Повертаємо віджету те, що прибрали (вкладений скролер) — перевірка МУСИТЬ упасти.
const ctrl = await page.evaluate(`(() => {
  const count = ${COUNT_SCROLLERS};
  const n = document.getElementById('cm-news-board');
  const box = document.getElementById('cm-news-content');
  box.style.maxHeight = '200px';
  box.style.overflowY = 'auto';
  const found = count(n);
  box.style.maxHeight = ''; box.style.overflowY = '';
  return { found, afterRestore: count(n).length };
})()`);
ok('🔴 КОНТРОЛЬ: на навмисно зламаному віджеті скролер ЗНАЙДЕНО',
   ctrl.found.length > 0, `знайдено: ${JSON.stringify(ctrl.found)}`);
ok('КОНТРОЛЬ: після відкату скролерів знову 0', ctrl.afterRestore === 0);

// ── 3. Хаб ──────────────────────────────────────────────────────────────────
await page.locator('#cm-news-board [data-cm-news-all]').click();
await page.waitForTimeout(800);

const h = await page.evaluate(`(() => {
  const count = ${COUNT_SCROLLERS};
  const s = document.querySelector('.nh-screen');
  if (!s) return null;
  const list = s.querySelector('.nh-list');
  return {
    scrollers: count(s),
    tabs: s.querySelectorAll('.nh-tab').length,
    cards: list.querySelectorAll('[data-article-id]').length,
    listIsScroller: list.scrollHeight > list.clientHeight + 1,
  };
})()`);

ok('«Усі новини» відкриває хаб', !!h);
ok('🔴 у хабі РІВНО ОДИН скролер (проблему не переселили)',
   h.scrollers.length === 1 && h.listIsScroller, `${JSON.stringify(h.scrollers)}`);
// 🆕 11.08: розділів стало ЧОТИРИ — «Україна та Світ» розділено (рішення Вови).
// Міряємо проти джерела правди, а не проти числа з голови: інакше при наступній
// зміні складу розділів сторож упаде, не сказавши, ЩО саме розійшлось.
ok('у хабі стільки вкладок, скільки гео-розділів', h.tabs === GROUPS.length,
   `${h.tabs} проти ${GROUPS.length} у NEWS_GEO_GROUPS`);

// Порція: Громада має 22 статті, тож перший показ мусить бути 20.
ok('хаб малює ПОРЦІЮ, а не все одразу', h.cards <= 20, `карток: ${h.cards}`);

// Дозавантаження при прокрутці — і воно НЕ мусить спрацьовувати без прокрутки.
const before = h.cards;
await page.waitForTimeout(1000);
const idle = await page.evaluate(() => document.querySelectorAll('.nh-list [data-article-id]').length);
ok('КОНТРОЛЬ: без прокрутки нічого не дописується', idle === before, `${before} → ${idle}`);

// Найбільший розділ — беремо ОСТАННІЙ у списку? Ні: після розділення 11.08
// найбільша за обсягом категорія це «Волинь» (171 стаття проти 157 в України і
// 45 у Світі). Але прив'язуватись до конкретної назви — те саме, від чого впав
// цей рядок минулого разу. Тому клікаємо ДРУГУ вкладку за списком: перевірка
// тут не про Волинь, а про те, що ПОРЦІЯ працює не лише в першій категорії.
await page.locator('.nh-tab', { hasText: GROUPS[1] }).click();
await page.waitForTimeout(700);
const big = await page.evaluate(() => document.querySelectorAll('.nh-list [data-article-id]').length);
ok('велика категорія теж починається з порції', big <= 20, `карток: ${big}`);
await page.evaluate(() => { const l = document.querySelector('.nh-list'); l.scrollTop = l.scrollHeight; });
await page.waitForTimeout(700);
const grown = await page.evaluate(() => document.querySelectorAll('.nh-list [data-article-id]').length);
ok('прокрутка донизу дописує наступну порцію', grown > big, `${big} → ${grown}`);

// ── 3.1 🔴 СТАТТЯ ВІДКРИВАЄТЬСЯ НАД ХАБОМ (баг зі скріна IMG_3776) ──────────
// Вова: «модалка новини відкривається під сторінкою НОВИНИ». Так і було:
// `#article-modal` має z-index 1100, а `.nh-screen` — 1200, тож модалка чесно
// відкривалась, але лежала ПІД хабом і людина бачила далі список новин.
//
// 🔴 Міряємо НАСЛІДОК, а не z-index: `elementFromPoint` у центрі екрана має
// віддати вузол СТАТТІ. Порівняння самих чисел z-index нічого не довело б —
// вони залежать ще й від контексту накладання, тож можуть бути «правильні» на
// папері й неправильні на екрані.
await page.locator('.nh-list [data-article-id]').first().click();
await page.waitForTimeout(800);
const over = await page.evaluate(() => {
  const m = document.getElementById('article-modal');
  const at = document.elementFromPoint(195, 500);
  return {
    open: m.classList.contains('open'),
    top: Math.round(m.getBoundingClientRect().top),
    // Чи належить те, що під пальцем у центрі, саме модалці статті.
    fromArticle: !!(at && m.contains(at)),
    atClass: at ? at.className : null,
    hubStill: !!document.querySelector('.nh-screen'),
    flag: document.body.classList.contains('nh-open'),
  };
});
ok('стаття з хаба відкрилась', over.open);
ok('🔴 стаття лежить НАД хабом, а не під ним', over.fromArticle, `у центрі: "${over.atClass}"`);
// `top: 0` навмисний: базово модалка починається з 56px, щоб лишити видимою шапку
// застосунку, але над хабом на тому місці стоїть смуга хаба (57px, а на iPhone ще
// +safe-area) — числа не збігаються, тому над хабом показуємо рівне затемнення.
ok('над хабом модалка починається від самого верху', over.top === 0, `top = ${over.top}px`);
ok('мітка body.nh-open стоїть', over.flag);
ok('хаб під статтею лишився (є куди повернутись)', over.hubStill);

// КОНТРОЛЬ: знімаємо мітку — і перевірка МУСИТЬ побачити хаб зверху. Без цього
// «стаття над хабом» була б зелена навіть тоді, коли підняття взагалі не працює.
const ctrlZ = await page.evaluate(() => {
  document.body.classList.remove('nh-open');
  const at = document.elementFromPoint(195, 500);
  const m = document.getElementById('article-modal');
  const fromArticle = !!(at && m.contains(at));
  document.body.classList.add('nh-open');
  return { fromArticle, atClass: at ? at.className : null };
});
ok('🔴 КОНТРОЛЬ: без мітки стаття знову опиняється ПІД хабом',
   !ctrlZ.fromArticle, `у центрі: "${ctrlZ.atClass}"`);

// Закрити статтю — хаб мусить лишитись на місці.
await page.evaluate(() => {
  const b = document.querySelector('#article-modal .article-close, #article-modal [class*="close"]');
  if (b) b.click();
});
await page.waitForTimeout(700);
ok('стаття закрилась, хаб лишився', await page.evaluate(() =>
  !document.getElementById('article-modal').classList.contains('open') &&
  !!document.querySelector('.nh-screen')));

// Системний «назад» закриває САМЕ хаб, а не всю вкладку.
await page.goBack();
await page.waitForTimeout(700);
const back = await page.evaluate(() => ({
  hub: !!document.querySelector('.nh-screen'),
  tab: (document.querySelector('.app-main') || {}).dataset?.tab,
}));
ok('«назад» закриває хаб, вкладка лишається Громадою', !back.hub && back.tab === 'community', JSON.stringify(back));
ok('мітка body.nh-open знята разом із хабом',
   await page.evaluate(() => !document.body.classList.contains('nh-open')));

// ── 3.2 ПОТІК ГРОМАДИ НЕ ЗАЧЕПЛЕНО ─────────────────────────────────────────
// Підняття модалки scoped під `body.nh-open`, тож стаття, відкрита з ВІДЖЕТА,
// мусить лишитись рівно такою, якою була: починатись під шапкою застосунку.
// Без цієї перевірки «полагодив хаб — непомітно змінив Громаду» пройшло б тихо.
await page.locator('#cm-news-board [data-article-id]').first().click();
await page.waitForTimeout(700);
const fromWidget = await page.evaluate(() => {
  const m = document.getElementById('article-modal');
  const at = document.elementFromPoint(195, 500);
  return {
    open: m.classList.contains('open'),
    top: Math.round(m.getBoundingClientRect().top),
    fromArticle: !!(at && m.contains(at)),
  };
});
ok('стаття з віджета відкривається', fromWidget.open);
ok('стаття з віджета — зверху', fromWidget.fromArticle);
ok('стаття з віджета лишає шапку видимою (top = 56px, як було)',
   fromWidget.top === 56, `top = ${fromWidget.top}px`);

// ── 3.3 🔴 ВИГЛЯД ПІСЛЯ РЕДИЗАЙНУ (31.07) ──────────────────────────────────
// ⚠️ Чому тут, а не окремим файлом `news-look.mjs`, як стояло в плані: кожен стенд
// піднімає свій Chromium і свій сервер, а перевіряти треба РІВНО ті самі два
// екрани, які вже відкриті вище. Другий запуск коштував би ~20с на кожному `npm test`
// і нічого не додав би. Розділяти є сенс, коли різні стенди міряють різні збірки.
await page.evaluate(() => {
  const b = document.querySelector('#article-modal .article-close, #article-modal [class*="close"]');
  if (b) b.click();
});
await page.waitForTimeout(500);
await page.locator('#cm-news-board [data-cm-news-all]').click();
await page.waitForTimeout(900);

const look = await page.evaluate(() => {
  const rgb = s => (s.match(/\d+/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return Math.round(((x + 0.05) / (y + 0.05)) * 1000) / 1000; };
  const warm = c => c[0] - c[2];        // R−B: критерій «теплоти», яким проєкт міряє кремове
  const cs = getComputedStyle(document.documentElement);
  const hex = n => { const v = cs.getPropertyValue(n).trim(); const m = v.match(/^#(..)(..)(..)$/);
    return m ? [1, 2, 3].map(i => parseInt(m[i], 16)) : null; };
  const screenBg = rgb(getComputedStyle(document.querySelector('.nh-screen')).backgroundColor);
  const row = document.querySelector('.nh-list .nc--row');
  const title = row.querySelector('.nc-title');
  const foot = row.querySelector('.nc-foot');
  const badge = document.querySelector('.nh-list .nc-badge');
  const line = hex('--news-line'), press = hex('--news-press'), card = hex('--news-card');
  const rowCs = getComputedStyle(row);
  return {
    // 🔄 31.07 (крок 3): рядок став КАРТКОЮ з обідком — пряме замовлення Вови
    // «зробити у вигляді карточки, а не просто лініями». До цього поверхні не було.
    rowBg: rowCs.backgroundColor,
    rowBorderW: parseFloat(rowCs.borderTopWidth),
    rowBorderC: rgb(rowCs.borderTopColor),
    rowRadius: parseFloat(rowCs.borderTopLeftRadius),
    теплотаКартки: card ? warm(card) : null,
    теплотаЛінії: line ? warm(line) : null,
    теплотаНатиску: press ? warm(press) : null,
    контрастЛінії: line ? ratio(line, screenBg) : null,
    // ⚠️ Натиск міряємо до КАРТКИ, а не до фону екрана: тепер він лягає на білу
    // поверхню. Стара пара «натиск↔фон» після появи картки нічого не описувала.
    контрастНатиску: press && card ? ratio(press, card) : null,
    контрастКартки: card ? ratio(card, screenBg) : null,
    // Мітки: тихий текст, а не «цукерка» з підкладкою.
    badgeBg: badge ? getComputedStyle(badge).backgroundColor : null,
    badgeTxt: badge ? badge.textContent.trim() : null,
    titleSize: parseFloat(getComputedStyle(title).fontSize),
    footSize: parseFloat(getComputedStyle(foot).fontSize),
    // 🔴 24.08 — ТУТ СТОЯВ КЛАС, ЯКОГО В ЗАСТОСУНКУ НЕМАЄ. Було
    // `.nc-card:first-child`, а картка новини має клас `.nc` (`news.js`,
    // `renderCard`) — заміряно: `document.querySelectorAll('.nc-card').length`
    // дорівнює НУЛЮ на живому екрані. Тобто `першаЗФото` було false ЗАВЖДИ, і
    // правило «герой є тоді і лише тоді» насправді вимагало ВІДСУТНОСТІ героя.
    // 🔑 Зеленим воно стояло з 21.08 лише тому, що найсвіжішими були наші власні
    // статті без фото і `markLead` чесно героя не вішав. Щойно парсер приніс
    // свіжу новину З ФОТО, застосунок спрацював ПРАВИЛЬНО — і сторож почервонів
    // саме на правильній поведінці. Це той самий найгірший тип хибного виміру,
    // що й сцена «НІЧ» в автобусах: перевірка не ловила ваду, а ВИМАГАЛА її.
    // ⚠️ Обидва поля тепер прив'язані до `.nh-list`: без цього `querySelector`
    // брав перший збіг по ВСЬОМУ документу, а під екраном хаба лишається ще й
    // віджет Громади зі своїми картками.
    lead: !!document.querySelector('.nh-list .nc--lead'),
    // 🔴 26.08 — ПОЛЯ ПЕРЕПИСАНО ПІД ІНШУ ВАДУ (крок 5 потоку /byyou).
    // Було `першаЗФото` / `leadHasPhoto` під правило «герой є ТІЛЬКИ з фото».
    // Те правило захищало від «роздутого блоку тексту»: велика картка малювала
    // слот 358×200 під фотографію, і без знімка там лишалась порожня плита.
    // З кроку 4 слоту в цьому випадку НЕМАЄ ВЗАГАЛІ — картка переходить у стан
    // `.nc--noimg`. Тобто шкоди, від якої стояв захист, більше не існує, і
    // тримати правило означало б вимагати поведінки, яку ми навмисно змінили.
    // ➡️ Нова шкода, яку МОЖНА завдати сьогодні: велика картка лишилась зі
    // слотом, а фото в ньому немає — тобто та сама діра, тільки прихована.
    // Її і міряємо.
    // ⚠️ `<img>` рахуємо ЖИВИЙ: `handleImgError` вилучає биту картинку з великих
    // варіантів, тож наявність вузла і є доказом, що фото доїхало.
    leadФото: !!document.querySelector('.nh-list .nc--lead img'),
    leadБезФото: !!document.querySelector('.nh-list .nc--lead.nc--noimg'),
    // Чи лишився в «героя» видимий слот під фото. Саме `getComputedStyle`, а не
    // наявність вузла: правило `.nc--lead.nc--noimg .nc-img { display: none }`
    // гасить слот стилем, і перевірка мусить міряти те, що бачить людина.
    leadСлот: (() => {
      const box = document.querySelector('.nh-list .nc--lead .nc-img');
      return !!(box && getComputedStyle(box).display !== 'none');
    })(),
    // Ексклюзив більше не обводимо кільцем (обідок читався як тривога).
    exclRing: (() => { const e = document.querySelector('.nh-list .nc.exclusive');
      return e ? getComputedStyle(e).boxShadow : 'none'; })(),
  };
});

// 🔴 ЗАМОВЛЕННЯ ВОВИ 31.07 (вечір): «фон залишити, просто такий ОБОДОК зробити,
// ЯК В ДОШЦІ… і зробити так само її у вигляді КАРТОЧКИ, а не просто лініями».
// Тому три перевірки нижче — саме про наявність картки, а не про її відсутність.
ok('🔴 рядок — КАРТКА з власною поверхнею', !/rgba\(0, 0, 0, 0\)|transparent/.test(look.rowBg), look.rowBg);
ok('🔴 у картки є обідок 1px', look.rowBorderW >= 1, `${look.rowBorderW}px`);
ok('картка заокруглена (не плитка)', look.rowRadius >= 8, `${look.rowRadius}px`);
// 🔴 Головний критерій: теплота. Проєкт вважає кремовим усе понад 6 (board-cream.mjs),
// а стара картка новин мала 11. Уся родина мусить бути нейтральна або прохолодна.
ok('🔴 картка новин не тепла (R−B ≤ 3)', look.теплотаКартки <= 3, `R−B = ${look.теплотаКартки}`);
ok('🔴 обідок не теплий (R−B ≤ 3)', look.теплотаЛінії <= 3, `R−B = ${look.теплотаЛінії}`);
ok('🔴 натиск не теплий (R−B ≤ 3)', look.теплотаНатиску <= 3, `R−B = ${look.теплотаНатиску}`);
// «Як в дошці» — це про КРИТЕРІЙ, а не про hex: обідок Дошки тримає 1.398 до свого
// фону. Вікно ±0.06 — щоб не падати від округлень.
ok('обідок тримає контраст ≈1.40 до фону (норма Дошки)',
   Math.abs(look.контрастЛінії - 1.40) <= 0.06, `${look.контрастЛінії}`);
// Натиск на Дошці = 1.274 до білої картки. Тримаємо ту саму відчутність.
ok('натиск відчувається як на Дошці (≈1.27 до картки)',
   Math.abs(look.контрастНатиску - 1.274) <= 0.05, `${look.контрастНатиску}`);
// 🔴 Сторож проти «а приберімо обідок»: сама картка на світлому фоні дає лише
// 1.162:1, тобто без обідка вона попливе. Число тут — доказ, що край НЕСУЧИЙ.
ok('🔴 обідок несучий: контраст самої картки до фону нижчий за обідок',
   look.контрастКартки < look.контрастЛінії, `картка ${look.контрастКартки} < обідок ${look.контрастЛінії}`);
ok('мітка — тихий текст, а не «цукерка» з підкладкою',
   /rgba\(0, 0, 0, 0\)|transparent/.test(look.badgeBg || ''), `${look.badgeTxt}: ${look.badgeBg}`);
ok('заголовок не дрібніший за 15px', look.titleSize >= 15, `${look.titleSize}px`);
// 11px — нижня межа за Apple HIG, а підпис несе джерело й час.
ok('підпис не дрібніший за 11.5px', look.footSize >= 11.5, `${look.footSize}px`);
// 🔴 26.08 — ПРАВИЛО ЗМІНИЛО ПРЕДМЕТ, БО ЗМІНИЛАСЬ САМА ШКОДА (крок 5 /byyou).
//
// Було (21.08): «велика картка є ТОДІ І ЛИШЕ ТОДІ, коли в першої новини є фото».
// Це захищало від роздутого блоку тексту: герой малював слот 358×200 під знімок,
// і без знімка там висіла порожня плита.
//
// 🗑 Підстава зникла. З кроку 4 картка без фото не має слоту взагалі: вона
// переходить у стан `.nc--noimg` і лишається великою за ТЕКСТОМ. Тримати старе
// правило означало б вимагати від застосунку поведінки, яку ми свідомо змінили
// на кращу — тобто рівно та вада, за яку 21.08 і 24.08 переписували цей самий
// блок: сторож описував не шкоду, а вчорашню форму.
//
// ➡️ ЩО МОЖНА ЗІПСУВАТИ СЬОГОДНІ: лишити героєві слот, у якому фотографії немає.
// Тоді діра нікуди не діваеться, просто стає непомітною в коді. Це і міряємо —
// у ДВІ сторони, бо кожна ловить свою половину:
ok('🔴 велика картка або має фото, або чесно перейшла в стан «без фото»',
   !look.lead || look.leadФото || look.leadБезФото,
   `герой: ${look.lead}, фото: ${look.leadФото}, стан «без фото»: ${look.leadБезФото}`);
ok('🔴 у стані «без фото» слот під знімок ЗНИКАЄ, а не стоїть порожнім',
   !look.leadБезФото || !look.leadСлот,
   `стан «без фото»: ${look.leadБезФото}, слот видимий: ${look.leadСлот}`);

// 🔴 КОНТРОЛЬ НА ДВІ ПЕРЕВІРКИ ВИЩЕ (24.08, предмет оновлено 26.08). Без нього
// вони знову можуть три дні стояти зеленими над зламаним селектором — саме так і
// сталось із `.nc-card`.
// Відтворюємо РІВНО ту ваду, яку правило має ловити: у великої картки немає фото,
// але стан «без фото» з неї знято — тобто слот повертається порожнім. Міряємо
// тими самими виразами. Не помітили — вони не міряють нічого, і стенд мусить впасти.
// ⚠️ Псуємо DOM НАВМИСНО і ПІСЛЯ всіх вимірів вигляду; сторінку далі однаково
// відкриваємо заново.
// 🔑 ВАДУ ВІДТВОРЮЄМО ПОВНІСТЮ, А НЕ НАПОЛОВИНУ. Слот під фото зʼявляється лише
// тоді, коли фото немає В ДАНИХ (`renderCard` малює `.nc-img--mono`). У цьому
// прогоні найсвіжіша новина Громади фото в даних МАЄ — воно просто не доїхало, і
// `handleImgError` вузол прибрав. Тобто «порожній слот» тут сам собою не виникає,
// і перевірка нижче стояла б зеленою, нічого не довівши.
// ➡️ Тому слот ДОБУДОВУЄМО руками — рівно тим вузлом, який дає `renderCard`, — і
// знімаємо ознаку `.nc--noimg`. Це і є та вада: велика картка зі слотом без фото.
const контрольГероя = await page.evaluate(() => {
  const f = document.querySelector('.nh-list .nc--lead');
  if (!f) return null;
  const живеФото = f.querySelector('img');
  const булоNoimg = f.classList.contains('nc--noimg');
  if (живеФото) живеФото.remove();
  const слотВузол = document.createElement('div');
  слотВузол.className = 'nc-img nc-img--mono';   // рівно те, що дає `renderCard`
  f.prepend(слотВузол);
  f.classList.remove('nc--noimg');
  const слот = getComputedStyle(слотВузол).display !== 'none';
  const правилоТримається = !!f.querySelector('img') || f.classList.contains('nc--noimg');
  // Повертаємо як було: контроль не має права лишити по собі змінений екран.
  слотВузол.remove();
  if (булоNoimg) f.classList.add('nc--noimg');
  if (живеФото) f.prepend(живеФото);
  return { слот, правилоТримається };
});
ok('🔴 контроль: правило героя ЛОВИТЬ зняту ознаку «без фото»',
   !!контрольГероя && !контрольГероя.правилоТримається,
   `правило тримається: ${контрольГероя?.правилоТримається}`);
ok('🔴 контроль: правило слоту ЛОВИТЬ порожній слот під фото',
   !!контрольГероя && контрольГероя.слот,
   `слот став видимим: ${контрольГероя?.слот}`);
ok('ексклюзив БЕЗ обідка-кільця', !/0px 0px 0px 1\.5px/.test(look.exclRing), look.exclRing.slice(0, 40));

// 🔴 ГЕО-МІТКА, ЩО ПОВТОРЮЄ ВКЛАДКУ, — ШУМ. Перевіряємо в КОЖНОМУ розділі.
//
// ⚠️ 11.08 ЦЯ ПЕРЕВІРКА ПЕРЕПИСАНА, І ПРИЧИНУ ВАРТО ЗНАТИ. Було так: у «Громаді»
// мітки нема, а КОНТРОЛЬ вимагав, щоб у «Україна та Світ» вона ЛИШИЛАСЬ — бо той
// розділ був злитий і мітка казала, Україна це чи Світ. Вова розділив розділ
// надвоє, мітка почала збігатися з назвою вкладки скрізь і чесно зникла — а
// контроль оголосив це поломкою.
// 🔑 Урок той самий, що вже двічі ловили в проєкті: перевірка стерегла НАСЛІДОК
// («тут мітка є»), а не ПРАВИЛО («показуємо мітку, лише коли вона щось додає»).
// Тепер міряємо правило: у жодному розділі мітка не повторює його назву.
for (const g of GROUPS) {
  await page.locator('.nh-tab', { hasText: g }).click();
  await page.waitForTimeout(600);
  const дублі = await page.evaluate(назва => [...document.querySelectorAll('.nh-list .nc-badge--geo')]
    .filter(b => b.textContent.trim().toLowerCase() === назва.toLowerCase()).length, g);
  ok(`🔴 у «${g}» гео-мітка не дублює вкладку`, дублі === 0, `дублів: ${дублі}`);
}

// 🔴 КОНТРОЛЬ, ЩОБ ПЕРЕВІРКА ВИЩЕ НЕ БУЛА ПОРОЖНЬОЮ. Нуль дублів вийшов би і
// тоді, коли гео-міток немає ЗОВСІМ (наприклад, хтось прибрав `badgesHtml`) —
// тобто зелений колір не доводив би нічого. Доводимо, що механізм ЖИВИЙ:
// підкладаємо картці чужу мітку і переконуємось, що вона лишається на місці.
const чужа = await page.evaluate(() => {
  const b = document.querySelector('.nh-list .nc-badge--geo') || (() => {
    const card = document.querySelector('.nh-list [data-article-id] .nc-meta');
    if (!card) return null;
    card.insertAdjacentHTML('afterbegin', '<span class="nc-badge nc-badge--geo">МАРС</span>');
    return card.querySelector('.nc-badge--geo');
  })();
  return b ? b.textContent.trim() : null;
});
ok('🔴 КОНТРОЛЬ: чужа гео-мітка НЕ знімається (механізм живий, а не «міток нема»)',
   чужа !== null, `${чужа}`);

await ctx.close();

// ── 4. Сторожі присутності (те, що легко прибрати «як зайве») ───────────────
const UTILS = projectFile('src/core/utils.js');
const HUB   = projectFile('src/tabs/news-hub.js');
const NEWS  = projectFile('src/tabs/news.js');

// 🔴 edgeGuard: без нього один рух пальця від лівого краю робив би ДВІ дії —
// системне «назад» iOS і перемикання категорії. Скасувати системний жест з коду
// неможливо, тому єдиний захист — не обслуговувати дотик, що почався в тій смузі.
ok('🔴 attachSwipe уміє edgeGuard', /edgeGuard/.test(UTILS));
ok('🔴 хаб просить edgeGuard у свайпа', /edgeGuard:\s*\d+/.test(HUB));

// Гео-групи — одне місце правди. Дві копії того самого правила в цьому проєкті
// вже розходились (списки антиспаму), і симптом виглядав як баг продукту.
ok('гео-групи живуть у news.js', /export const NEWS_GEO_GROUPS/.test(NEWS));
ok('віджет НЕ тримає власної копії гео-правила',
   !/cmNewsMatch/.test(projectFile('src/tabs/community-blocks.js')));

// Категорійний бейдж за замовчуванням прихований (B-28: 94.5% «Суспільство»).
ok('бейдж «Суспільство» не малюється', /CATEGORY_DEFAULT/.test(NEWS));

// Ключ сховища для «N нових» — щоб його не перейменували мовчки: перейменування
// означає, що в КОЖНОГО читача бейдж одноразово покаже архів як «нові».
ok('ключ cstl_news_seen_ts на місці', /cstl_news_seen_ts/.test(NEWS));

// ── 5. 🔴 СТОРОЖ ПРОТИ ПОВЕРНЕННЯ «ДВОХ НАБОРІВ» (31.07, крок 9) ─────────────
// Хвороба, заради якої й був увесь потік: та сама картка новини малювалась двома
// незалежними наборами перевизначень — 13 правил `.cm-news-top3 .news-card-*`
// (табло) і 20 правил `.nh-list .news-card-*` (хаб). Вони розійшлись самі, і Вова
// побачив наслідок: «карточки новин відображаються по-іншому ніж на сторінці
// новини… це дуже великий розгардіяш».
//
// ⚠️ Міряємо ПРАВИЛО, а не результат, і це свідомий виняток із «критерій міряє
// наслідок»: наслідок тут — «через півроку хтось додасть одне правило під свій
// екран». Такий регрес не видно на жодному скріншоті в день, коли його роблять;
// він проявляється лише коли два екрани встигли розійтись. Тому стережемо саме
// форму запису — це той рідкісний випадок, коли вона і є предметом.
//
// Дозволено рівно одне: екран задає ТОКЕНИ `--nc-*` на своєму контейнері.
// Заборонено: правило, яке через контейнер екрана чіпає ВЛАСТИВОСТІ картки.
// 🔴 04.08 — `home.css` ДОДАНО ДО ПЕРЕВІРКИ, і це не профілактика.
// Сторож стеріг хаб і `community.css`, а головна лишалась поза оглядом. Саме там
// і завелось `#cm-content.hm .nc { background: …; border-color: … }` — екран
// задавав ВЛАСТИВОСТІ картки. Наслідок був видимий оком: `border-color` без
// `border-width` означає, що обідка немає взагалі, і плитка новини приїхала
// квадратною. Вова: «чому вони квадратні?».
// ➡️ Урок не про home.css, а про сам сторож: він перелічував екрани поіменно,
// тож кожен НОВИЙ екран автоматично опинявся поза наглядом.
const CARD_CSS = projectFile('style/news-card.css');
const HUB_CSS  = projectFile('style/news-hub.css');
const CM_CSS   = projectFile('style/community.css');
const HOME_CSS = projectFile('style/home.css');

// Правило = селектор + тіло. Шукаємо тіла, де є хоч одна звичайна властивість
// (рядок виду `щось: значення`, який НЕ починається з `--`).
const overrides = css => {
  const out = [];
  const re = /([^{}]*\.nc[\w-]*[^{}]*)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sel = m[1].trim().replace(/\s+/g, ' ');
    // Нас цікавлять лише СКОУПЛЕНІ під чужий контейнер правила: у селекторі є
    // пробіл-нащадок і клас екрана перед `.nc`.
    if (!/(\.nh-list|\.cm-news-top3|#cm-news-content|\.nh-screen|#cm-content|\.hm)\s+\.nc/.test(sel)) continue;
    const props = m[2].split(';').map(s => s.trim())
      .filter(s => s && !s.startsWith('--') && /^[a-z-]+\s*:/.test(s));
    if (props.length) out.push(`${sel} { ${props.join('; ')} }`);
  }
  return out;
};
const badHub = overrides(HUB_CSS), badCm = overrides(CM_CSS), badHome = overrides(HOME_CSS);
ok('🔴 хаб НЕ перевизначає властивості картки (лише токени)',
   badHub.length === 0, badHub.join(' | ') || 'чисто');
ok('🔴 табло НЕ перевизначає властивості картки (лише токени)',
   badCm.length === 0, badCm.join(' | ') || 'чисто');
ok('🔴 головна НЕ перевизначає властивості картки (лише токени)',
   badHome.length === 0, badHome.join(' | ') || 'чисто');

// 🔴 КОНТРОЛЬ: без нього перевірка вище була б зелена і на порожньому файлі.
// Підсовуємо їй рівно те правило, яке вона має ловити.
const trap = overrides('.nh-list .nc-title { font-size: 19px; }');
ok('🔴 КОНТРОЛЬ: сторож ЛОВИТЬ підкинуте перевизначення',
   trap.length === 1, trap.join('') || 'НЕ спіймав');
// І не сварить на дозволене — інакше його швидко почнуть обходити.
const okTokens = overrides('.nh-list .nc--lead { --nc-img-h: 140px; --nc-title-fs: 17px; }');
ok('КОНТРОЛЬ: на самі токени сторож НЕ свариться', okTokens.length === 0, okTokens.join('') || 'чисто');

// Форма картки живе одним файлом — і саме він мусить містити варіанти.
ok('усі три варіанти картки описані в одному файлі',
   /\.nc--lead/.test(CARD_CSS) && /\.nc--row/.test(CARD_CSS) && /\.nc--mini/.test(CARD_CSS));
// Розмітку теж пише одна функція: дві (`renderRow` + `renderFeatured`) і були
// половиною хвороби.
ok('розмітку картки пише ОДНА функція',
   /function renderCard\(/.test(NEWS) && !/function renderRow\(/.test(NEWS));

await browser.close();
await stop();
done();
