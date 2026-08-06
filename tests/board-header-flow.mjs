// Стенд №41: ШАПКА ДОШКИ НА ПОЧАТКУ СТОРІНКИ ЇДЕ РАЗОМ ЗІ СКРОЛОМ.
//
// Замовлення Вови 06.08, дослівно: «суть у тому, щоб він на початку сторінки
// ховався разом зі скролом сторінки», а далі — «при скролі вверх зʼявлявся так,
// як зʼявляється, і якщо скрол вниз починається з середини сторінки — ховався
// так, як ховається».
//
// ЩО БУЛО ДО ЦЬОГО: шапка `position: fixed`, до 90px трималась примусово повною,
// потім чекала накопичених 110px і зникала стрибком за 0.28с. Рух пальця і рух
// шапки не збігались.
//
// 🔴 ЧОМУ ЦЕ ОКРЕМИЙ ФАЙЛ, А НЕ ДОПИСКА ДО `board-header.mjs`.
// Той стенд будує СИНТЕТИЧНУ сцену (`setContent`) з голого HTML+CSS — у ній
// немає ані `bundle.js`, ані `setupHeaderCollapse`. Перевірка режиму там могла б
// лише вручну поставити клас і зміряти CSS, тобто довести, що правило написане,
// а не що ПОВЕДІНКА працює. Перша версія цих перевірок саме там і впала — на
// цілком робочому коді. Тому тут піднімається справжній застосунок.
//
// 🔴 ЩО САМЕ МІРЯЄМО — і чому критерій змінився 06.08 (третій підхід).
// Раніше тут читався `transform`: шапку рухав JS, і зсув був наслідком. Тепер її
// рухає САМ БРАУЗЕР (`position: sticky` у потоці), і `transform` при цьому
// нульовий — прилад, що читає матрицю, показував би «нічого не рухається» на
// повністю справному екрані. Тому міряємо ФАКТИЧНУ ПОЗИЦІЮ шапки на екрані
// (`getBoundingClientRect().top`) — рівно те, що бачить око.
//
// 🔑 ЕТАЛОН береться не з голови: шапка лежить першою в потоці, який починається
// під шапкою застосунку (56px на 390×844). Отже поки вона не прилипла,
// `top` мусить дорівнювати `56 − scrollTop` — тобто рух РІВНО за сторінкою.
import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter('board-header-flow');

// Досить карток, щоб сторінка гарантовано скролилась на кілька екранів.
const ts = Date.now() - 2 * 864e5;
const POSTS = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1, type: 'board', category: i % 2 ? 'продам' : 'куплю',
  title: 'Продаю машину', text: 'Терміново продам автомобіль у гарному стані.',
  photos: [], price: null, currency: 'UAH', location: 'Вся Олицька громада',
  status: 'published', ts, created_at: new Date(ts).toISOString(),
  published_at: new Date(ts).toISOString(), owner_uid: 'u1', author_name: 'Іван',
}));

const { url, stop } = await serve();
const browser = await launch(chromium);
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mockSupabase(page, { posts: POSTS, announcements: [] });
await page.route('**://api.open-meteo.com/**', r => r.abort());
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.evaluate(() => window.switchTab && window.switchTab('board'));
await page.waitForTimeout(1200);
// Банер згоди і гейт правил Дошки — обидва `fixed` і перехоплюють тапи.
await page.evaluate(() => document.querySelector('.consent-accept')?.click());
await page.evaluate(() => document.querySelector('.brules-ok')?.click());
await page.waitForTimeout(500);

const SETTLE = 420;   // 0.28с анімації липкого режиму + запас

// Прокрутити і віддати ПОЛОЖЕННЯ шапки на екрані. Два кадри: перший — подія
// `scroll`, другий — уже застосований стиль.
const step = (y) => page.evaluate(v => new Promise(res => {
  document.querySelector('.app-main').scrollTop = v;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = document.querySelector('#board-content .bd-controls');
    const hdr = document.querySelector('.app-header');
    const r = el.getBoundingClientRect();
    res({
      y: v,
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      headerBottom: Math.round(hdr.getBoundingClientRect().bottom),
      position: getComputedStyle(el).position,
      shown: el.classList.contains('bd-controls--shown'),
      h: el.offsetHeight,
    });
  }));
}), y);

const settled = async () => {
  await page.waitForTimeout(SETTLE);
  return page.evaluate(() => {
    const el = document.querySelector('#board-content .bd-controls');
    const hdr = document.querySelector('.app-header');
    const r = el.getBoundingClientRect();
    return {
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      headerBottom: Math.round(hdr.getBoundingClientRect().bottom),
      shown: el.classList.contains('bd-controls--shown'),
      h: el.offsetHeight,
    };
  });
};

// ── 1. Початок сторінки: шапка їде РІВНО за сторінкою ─────────────────────────
const base = await step(0);
const FLOW_TOP = base.top;            // де шапка стоїть у спокої (= низ .app-header)
ok('у спокої шапка стоїть рівно під шапкою застосунку',
   FLOW_TOP === base.headerBottom, `${FLOW_TOP} проти ${base.headerBottom}`);
ok('шапка Дошки лежить у ПОТОЦІ сторінки (position: sticky), а не прибита',
   base.position === 'sticky', base.position);

const pts = [];
for (const y of [20, 45, 90]) pts.push(await step(y));
const oneToOne = pts.filter(p => p.top === FLOW_TOP - p.y);
ok('на початку сторінки шапка їде РІВНО за сторінкою (1:1, рухає браузер)',
   oneToOne.length === pts.length,
   pts.map(p => `скрол ${p.y} → top ${p.top} (очікувано ${FLOW_TOP - p.y})`).join(' · '));

// 🔴 КОНТРОЛЬ. Без нього «1:1» ще нічого не доводить: якби шапка просто стояла на
// місці, а прилад помилявся — розбіжність могла б лишитись непоміченою. Тому
// окремо стверджуємо, що між нулем і 90px позиція СПРАВДІ змінилась, і рівно на
// величину прокрутки.
ok('КОНТРОЛЬ — прилад розрізняє стани (позиція змінилась саме на 90px)',
   base.top - pts[2].top === 90, `${base.top} → ${pts[2].top}`);

// ── 2. Дійшовши до верху, шапка прилипає ВЖЕ СХОВАНОЮ ─────────────────────────
await step(700);
const deep = await settled();
ok('нижче за свою висоту шапка зникає повністю (нижній край вище шапки застосунку)',
   deep.bottom <= deep.headerBottom, `низ шапки ${deep.bottom}, низ .app-header ${deep.headerBottom}`);
ok('…і не їде далі за екран без потреби — вона ПРИЛИПЛА, а не загубилась',
   deep.top > -(deep.h + 40), `top ${deep.top} при висоті ${deep.h}`);

// ── 3. Рух угору з середини → шапка повертається (стара поведінка збережена) ──
for (const y of [660, 620, 580]) await step(y);
const up = await settled();
ok('рух угору з середини сторінки повертає шапку у видиме положення',
   up.shown && up.bottom > up.headerBottom,
   `клас ${up.shown ? 'є' : 'нема'}, низ ${up.bottom} проти ${up.headerBottom}`);

// ── 4. 🔴 Повертаючись у початкову зону, шапка не має стрибати ────────────────
// Тут вона знову опиняється у своєму місці в потоці, тож клас показу мусить
// зніматись — інакше він опустив би її НИЖЧЕ, ніж вона стоїть, і вийшов би стрибок.
for (const y of [300, 150, 60]) await step(y);
const nearTop = await settled();
ok('у початковій зоні клас показу знімається (інакше шапка з\'їхала б нижче місця)',
   !nearTop.shown, `клас ${nearTop.shown ? 'лишився' : 'знято'}`);
ok('…і позиція знову дорівнює «сторінка мінус скрол»',
   nearTop.top === FLOW_TOP - 60, `top ${nearTop.top}, очікувано ${FLOW_TOP - 60}`);

// ── 5. Повернення на самий верх ───────────────────────────────────────────────
const back = await step(0);
ok('на самому верху шапка знову повна і на своєму місці',
   back.top === FLOW_TOP && !back.shown, `top ${back.top}`);

await browser.close();
await stop();
done();
