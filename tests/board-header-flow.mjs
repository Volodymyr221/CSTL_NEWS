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
// 🔴 ЩО САМЕ МІРЯЄМО: фактичний зсув із обчисленого `transform` (матриця) проти
// позиції скролу. Не наявність класу `--flow`: клас може бути, а зсуву — ні.
//
// ⚠️ ТУТ НЕ МОЖНА ЧЕКАТИ ДОЇЗДУ АНІМАЦІЇ, як в інших стендах. Сенс режиму саме в
// тому, що анімації НЕМА і шапка стоїть рівно там, де палець. Якщо хтось поверне
// сюди `transition`, перевірка мусить упасти — і впаде, бо на кадрі виміру зсув
// відставатиме від скролу.
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

// Прокрутити і віддати зсув шапки. Два кадри: перший — подія `scroll`,
// другий — уже застосований стиль.
const step = (y) => page.evaluate(v => new Promise(res => {
  document.querySelector('.app-main').scrollTop = v;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = document.querySelector('#board-content .bd-controls');
    res({
      y: v,
      shift: Math.round(-new DOMMatrixReadOnly(getComputedStyle(el).transform).m42),
      dur: getComputedStyle(el).transitionDuration,
      collapsed: el.classList.contains('bd-controls--collapsed'),
      h: el.offsetHeight,
    });
  }));
}), y);

const settled = async () => {
  await page.waitForTimeout(SETTLE);
  return page.evaluate(() => {
    const el = document.querySelector('#board-content .bd-controls');
    return {
      shift: Math.round(-new DOMMatrixReadOnly(getComputedStyle(el).transform).m42),
      collapsed: el.classList.contains('bd-controls--collapsed'),
      h: el.offsetHeight,
    };
  });
};

// ── 1. Початок сторінки: зсув = позиції скролу, один до одного ────────────────
await step(0);
const pts = [];
for (const y of [20, 45, 90]) pts.push(await step(y));
ok('на початку сторінки зсув шапки = позиції скролу (1:1 за пальцем)',
   pts.every(p => p.shift === p.y),
   pts.map(p => `${p.y}→${p.shift}`).join(' · '));
ok('у режимі «в потоці» анімації немає (інакше шапка відставала б від пальця)',
   pts.every(p => p.dur.startsWith('0s')), pts[0].dur);

// 🔴 КОНТРОЛЬ. Без нього «1:1» ще нічого не доводить: якби зсув просто дорівнював
// нулю на всіх точках, а скрол не працював — рівність теж могла б збігтися.
// Беремо ту саму сцену і перевіряємо, що на НУЛЬОВОМУ скролі зсуву немає, а на
// ненульовому — є. Тобто прилад справді розрізняє два стани.
const atZero = await step(0);
ok('КОНТРОЛЬ — на самому верху зсуву немає (прилад розрізняє стани)',
   atZero.shift === 0 && pts[2].shift > 0, `0→${atZero.shift}, 90→${pts[2].shift}`);

// ── 2. Пройшли всю висоту шапки → липкий режим, шапка зникла повністю ─────────
await step(700);
const deep = await settled();
ok('нижче за свою висоту шапка перемикається в липкий режим і зникає повністю',
   deep.collapsed && deep.shift >= deep.h,
   `зсув ${deep.shift} при висоті ${deep.h}`);

// ── 3. Рух угору з середини → шапка повертається (стара поведінка збережена) ──
for (const y of [660, 620, 580]) await step(y);
const up = await settled();
ok('рух угору з середини сторінки повертає шапку', up.shift === 0 && !up.collapsed,
   `зсув ${up.shift}`);

// ── 4. 🔴 ГОЛОВНА ПАСТКА: далі вгору, у початкову зону — шапка НЕ має ховатись ─
// Якби прив'язку до потоку вмикали «щойно y < висоти шапки», шапка поїхала б
// угору НАЗУСТРІЧ рухові пальця, тобто почала б ховатись саме тоді, коли її
// викликали. Тому режим повертається лише на самому нулі.
for (const y of [300, 150, 60]) await step(y);
const nearTop = await settled();
ok('повертаючись угору в початкову зону, шапка лишається показаною',
   nearTop.shift === 0, `зсув ${nearTop.shift} на скролі 60`);

// ── 5. Доїхали до нуля → прив'язка до потоку відновилась ──────────────────────
await step(0);
const again = await step(50);
ok('після повернення на самий верх прив\'язка «в потоці» відновлюється',
   again.shift === 50, `скрол 50 → зсув ${again.shift}`);

await browser.close();
await stop();
done();
