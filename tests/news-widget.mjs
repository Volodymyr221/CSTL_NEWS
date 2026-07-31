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
  const n = document.querySelector('.cm-block--news');
  if (!n) return null;
  return {
    scrollers: count(n),
    h: Math.round(n.getBoundingClientRect().height),
    cards: n.querySelectorAll('[data-article-id]').length,
    imgs: n.querySelectorAll('img').length,
    live: /LIVE/.test(n.textContent),
    chips: n.querySelectorAll('.cm-news-chip, .cm-news-filters, .cm-news-feed').length,
    headerTag: (n.querySelector('.cm-news-board-bar') || {}).tagName,
    hasAll: !!n.querySelector('[data-cm-news-all]'),
  };
})()`);

ok('віджет новин існує', !!w);
ok('🔴 у віджеті НЕМА вкладених скролерів', w.scrollers.length === 0, `знайдено: ${JSON.stringify(w.scrollers)}`);
// Стеля 480px: заміряно 431px після переробки (було 567). Запас ~50px на інший
// шрифт/масштаб iOS. Якщо колись знову підповзе до 567 — це повернення хвороби.
ok('віджет не з\'їдає головний екран (< 480px)', w.h < 480, `${w.h}px = ${Math.round(w.h / VIEW * 1000) / 10}% видимої зони`);
ok('у віджеті рівно 3 картки', w.cards === 3, `${w.cards}`);
ok('картинок у віджеті не більше 3', w.imgs <= 3, `${w.imgs}`);
ok('фальшивого «LIVE» більше нема', !w.live);
ok('чіпи і старий скролер прибрані', w.chips === 0, `залишків: ${w.chips}`);
ok('шапка віджета — справжня кнопка', w.headerTag === 'BUTTON', w.headerTag);
ok('є вхід «Усі новини»', w.hasAll);

// ── 2. КОНТРОЛЬ: вимір справді ловить скролер ───────────────────────────────
// Повертаємо віджету те, що прибрали (вкладений скролер) — перевірка МУСИТЬ упасти.
const ctrl = await page.evaluate(`(() => {
  const count = ${COUNT_SCROLLERS};
  const n = document.querySelector('.cm-block--news');
  const box = n.querySelector('.cm-news-top3');
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
await page.locator('.cm-news-board-bar').click();
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

ok('тап по віджету відкриває хаб', !!h);
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
await page.locator('.cm-block--news [data-article-id]').first().click();
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

await browser.close();
await stop();
done();
