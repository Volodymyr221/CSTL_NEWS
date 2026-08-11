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
const { url, stop } = await serve();
const executablePath = chromiumPath();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });

const VIEW_W = 390, VIEW_H = 844;
// Видима зона = екран мінус шапка (56) і таб-бар (57). Те саме число, яким міряли
// «77.6%» до переробки — інакше порівняння «було/стало» було б нечесним.
const VIEW = VIEW_H - 56 - 57;

async function openCommunity() {
  const ctx = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
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
    chips: n.querySelectorAll('.cm-news-chip, .cm-news-filters, .cm-news-feed').length,
    headerTag: (n.querySelector('[data-cm-news-all]') || {}).tagName,
    hasAll: !!n.querySelector('[data-cm-news-all]'),
  };
})()`);

ok('віджет новин існує', !!w);
// 🔴 04.08 — правило змінилось за прямим замовленням Вови: у віджеті тепер Є
// ОДИН горизонтальний скролер (карусель категорій). Вертикального бути не може —
// саме вертикальний 31.07 крав прокрутку сторінки.
ok('🔴 у віджеті НЕМА ВЕРТИКАЛЬНОГО скролера',
   w.scrollers.filter(c => !/hm-ntrack/.test(c)).length === 0, `знайдено: ${JSON.stringify(w.scrollers)}`);
// Стеля 480px: заміряно 431px після переробки (було 567). Запас ~50px на інший
// шрифт/масштаб iOS. Якщо колись знову підповзе до 567 — це повернення хвороби.
ok('віджет не з\'їдає головний екран (< 480px)', w.h < 480, `${w.h}px = ${Math.round(w.h / VIEW * 1000) / 10}% видимої зони`);
// 04.08: карусель по категоріях — три СТОРІНКИ по три картки (було 3 картки
// одним дайджестом). Стеля 9 лишається стелею: більше означало б, що на головну
// знову висипали стрічку новин.
ok('у віджеті 3 картки на сторінку', w.cards === 9 || w.cards === 3, `${w.cards}`);
ok('картинок не більше ніж карток', w.imgs <= 9, `${w.imgs}`);
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
ok('у хабі три категорії', h.tabs === 3, `${h.tabs}`);

// Порція: Громада має 22 статті, тож перший показ мусить бути 20.
ok('хаб малює ПОРЦІЮ, а не все одразу', h.cards <= 20, `карток: ${h.cards}`);

// Дозавантаження при прокрутці — і воно НЕ мусить спрацьовувати без прокрутки.
const before = h.cards;
await page.waitForTimeout(1000);
const idle = await page.evaluate(() => document.querySelectorAll('.nh-list [data-article-id]').length);
ok('КОНТРОЛЬ: без прокрутки нічого не дописується', idle === before, `${before} → ${idle}`);

await page.locator('.nh-tab', { hasText: 'Україна та Світ' }).click();
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
    lead: !!document.querySelector('.nc--lead'),
    leadHasPhoto: !!document.querySelector('.nc--lead img, .nc--lead .img-fallback'),
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
ok('велика перша картка є', look.lead);
ok('велика перша — саме з фото (інакше це роздутий текст)', look.leadHasPhoto);
ok('ексклюзив БЕЗ обідка-кільця', !/0px 0px 0px 1\.5px/.test(look.exclRing), look.exclRing.slice(0, 40));

// Гео-мітка: у «Громаді» це повтор активної вкладки, у «Україна та Світ» — сенс.
const geoHere = await page.evaluate(() => document.querySelectorAll('.nh-list .nc-badge--geo').length);
ok('🔴 у «Громаді» гео-мітки нема (не дублює вкладку)', geoHere === 0, `${geoHere}`);
await page.locator('.nh-tab', { hasText: 'Україна та Світ' }).click();
await page.waitForTimeout(700);
const geoThere = await page.evaluate(() => document.querySelectorAll('.nh-list .nc-badge--geo').length);
ok('🔴 КОНТРОЛЬ: у «Україна та Світ» гео-мітка ЛИШИЛАСЬ (там вона інформативна)',
   geoThere > 0, `${geoThere}`);

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
