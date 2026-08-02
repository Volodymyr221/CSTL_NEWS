// tests/ad-sheet-swipe.mjs — свайп-закриття МОДАЛКИ ОГОЛОШЕННЯ.
//
// НАВІЩО (скарга Вови 02.08): «свайп закриття модалки зламаний, у нас скаче в різні боки».
//
// КОРІНЬ, знайдений перед написанням цього стенда: у `board.js` жили ДВІ майже однакові
// реалізації свайпу на ту саму модалку — `openAdModalStandalone` (вхід із чату) вже
// рахувала аркуш знизу, а `expand()` (зум із Дошки, ГОЛОВНИЙ шлях) лишалась на
// математиці ЦЕНТРОВАНОЇ картки: `translate(-50%, calc(-50% + dy))`. Оскільки CSS уже
// давно `left:0; right:0; width:100%`, при першому ж дотику аркуш отримував зсув на
// пів ширини екрана вліво і пів висоти вгору. Це і є «скаче в різні боки».
//
// ЩО МІРЯЄМО — те, що бачить око, а не форму запису:
//   • горизонталь під час вертикального свайпу мусить лишатись НЕРУХОМОЮ;
//   • аркуш мусить іти за пальцем по вертикалі (translateY ≈ dy);
//   • короткий рух (нижче порогу) мусить повернути аркуш рівно на місце.
// Плюс сторож DRY: другої копії свайпу в коді бути не повинно — саме її розходження
// й дало цей баг (у проєкті це вже третій випадок «двох копій», після списків
// антиспаму й тригерів коментарів).
//
// ⚠️ Живі дані Дошки (`tests/tools/_board-live.json`) у `.gitignore` — репозиторій
// публічний. Тому стенд робить СВОЇ оголошення, з фото у вигляді `data:`-картинки,
// щоб не залежати ні від бази, ні від мережі.

import { chromium } from 'playwright';
import { launch, serve, projectFile, reporter } from './_lib.mjs';

const { ok, done } = reporter();

// Фото як `data:`-картинка: навмисно ВИСОКА (1200×1600) — саме такі й вилазили за межі.
const PHOTO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><rect width="1200" height="1600" fill="#8a6"/></svg>');

const ts = Date.now() - 3 * 864e5;
const POSTS = [
  { id: 901, type: 'board', category: 'продам', title: 'ПРОДАМ БУДИНОК В ЖОРНИЩЕ',
    text: 'Просторий будинок у тихому місці. '.repeat(20),
    photos: [PHOTO, PHOTO], photo: PHOTO, price: 450000, currency: 'UAH', price_negotiable: true,
    location: 'Жорнище', author: 'Тест', author_name: 'Тест', owner_uid: 'u1',
    status: 'published', ts, created_at: new Date(ts).toISOString(), bumped_at: new Date(ts).toISOString() },
  { id: 902, type: 'board', category: 'куплю', title: 'КУПЛЮ МОТОЦИКЛ',
    text: 'Куплю мотоцикл у робочому стані.', photos: [], price: null, currency: 'UAH',
    location: 'Вся Олицька громада', author: 'Тест', author_name: 'Тест', owner_uid: 'u1',
    status: 'published', ts, created_at: new Date(ts).toISOString(), bumped_at: new Date(ts).toISOString() },
];

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
await p.route('**://*.supabase.co/**', r => json(r, []));
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.route('**/data/community-board.json*', r => json(r, { posts: POSTS }));

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.evaluate(() => window.switchTab && window.switchTab('board'));
await p.waitForTimeout(1500);

// ── Жест справжніми подіями дотику (CDP), а не синтетичними об'єктами ─────────
const cdp = await ctx.newCDPSession(p);
const touch = async (type, x, y) => {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
  });
};

const modalBox = () => p.evaluate(() => {
  const m = document.querySelector('.cm-board-modal-note');
  if (!m) return null;
  const r = m.getBoundingClientRect();
  return { left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
});

async function openAd(id) {
  const hit = await p.evaluate(pid => {
    const el = document.querySelector(`#board-content [data-post-id="${pid}"]`);
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  }, id);
  await p.waitForTimeout(700);
  return hit;
}
// ⚠️ Закриваємо ШЛЯХОМ ЗАСТОСУНКУ (кнопка), а не `node.remove()`. Перша версія стенда
// зносила вузол напряму — розмітка зникала, але внутрішній стан `activeNote` лишався
// заповненим, і `expand()` після цього мовчки не відкривав наступне оголошення.
// Тобто стенд ламав сам себе і показував «модалки немає» там, де код не винен.
const closeAd = async () => {
  await p.evaluate(() => {
    const btn = document.querySelector('.cm-board-modal-note [data-ad-close]');
    if (btn) btn.click();
    else document.querySelector('#board-backdrop')?.click();
  });
  await p.waitForFunction(() => !document.querySelector('.cm-board-modal-note'), null, { timeout: 3000 })
        .catch(() => {});
  await p.waitForTimeout(350);   // DURATION=240 + запас: доки не спаде isAnimating
};

// ── 1. Головний шлях: зум із Дошки, оголошення З ФОТО ────────────────────────
ok('картка оголошення з фото відкрилась', await openAd(901));
const rest = await modalBox();
ok('модалка на весь екран по ширині', rest && rest.left <= 1 && rest.w >= 388,
   rest ? `left=${rest.left} w=${rest.w}` : 'модалки немає');

// ── 1б. КОНСТРУКЦІЯ ТРЬОХ ШАРІВ ──────────────────────────────────────────────
// Саме на неї показував Вова по макету: «фотографія прикріплена до верху… блок опису
// заокругленими кутами… блок подзвонити-написати теж заокруглений». Міряємо ГЕОМЕТРІЮ,
// яку видно оку, а не наявність класів.
const geo = await p.evaluate(() => {
  const H = window.innerHeight;
  const q = s => document.querySelector(s);
  const r = el => el ? el.getBoundingClientRect() : null;
  const cs = el => el ? getComputedStyle(el) : null;
  const photo = q('.cm-ad-photo'), sheet = q('.cm-ad-sheet'), bar = q('.cm-ad-bottom');
  const hdr = q('.app-header');
  // Колір шапки застосунку: під затемненням вона мусить ПОТЕМНІТИ. Це був справжній
  // баг — затемнення лежало всередині вкладки, і його z-index не перебивав шапку.
  const hdrTop = hdr ? Math.round(r(hdr).top + r(hdr).height / 2) : 20;
  const overHeader = document.elementFromPoint(Math.round(window.innerWidth / 2), hdrTop);
  const bdEl = q('.board-backdrop.cm-ad-backdrop--over.visible');
  return {
    екран: H,
    фото_верх: photo ? Math.round(r(photo).top) : null,
    фото_радіус: photo ? cs(photo).borderTopLeftRadius : null,
    фото_ліво: photo ? Math.round(r(photo).left) : null,
    фото_ширина: photo ? Math.round(r(photo).width) : null,
    аркуш_верх: sheet ? Math.round(r(sheet).top) : null,
    аркуш_радіус: sheet ? parseFloat(cs(sheet).borderTopLeftRadius) : null,
    аркуш_низ: sheet ? Math.round(r(sheet).bottom) : null,
    наїжджає_на: photo && sheet ? Math.round(r(photo).bottom - r(sheet).top) : null,
    панель_радіус: bar ? parseFloat(cs(bar).borderTopLeftRadius) : null,
    панель_низ: bar ? Math.round(r(bar).bottom) : null,
    затемнення_є: !!bdEl,
    затемнення_z: bdEl ? +getComputedStyle(bdEl).zIndex : null,
    затемнення_в_body: bdEl ? bdEl.parentElement === document.body : null,
    над_шапкою: overHeader ? (overHeader.className || overHeader.tagName) : null,
  };
});
ok('ФОТО від самого верху екрана', geo.фото_верх === 0, `top=${geo.фото_верх}`);
ok('ФОТО без заокруглень і на всю ширину',
   geo.фото_радіус === '0px' && geo.фото_ліво === 0 && geo.фото_ширина >= 388,
   `radius=${geo.фото_радіус} left=${geo.фото_ліво} w=${geo.фото_ширина}`);
ok('АРКУШ заокруглений зверху', geo.аркуш_радіус >= 20, `${geo.аркуш_радіус}px`);
ok('АРКУШ наїжджає на фото (немає щілини)', geo.наїжджає_на > 0, `${geo.наїжджає_на}px`);
ok('АРКУШ доходить до низу екрана', Math.abs(geo.аркуш_низ - geo.екран) <= 1,
   `${geo.аркуш_низ} з ${geo.екран}`);
ok('ПАНЕЛЬ ДІЙ теж заокруглена зверху', geo.панель_радіус >= 16, `${geo.панель_радіус}px`);
ok('ПАНЕЛЬ ДІЙ у межах екрана', geo.панель_низ <= geo.екран + 1,
   `${geo.панель_низ} з ${geo.екран}`);
// 🔴 Пастка z-index: затемнення мусить жити в `body`. Усередині вкладки будь-яке число
// замикається її стек-контекстом і шапка застосунку лишається неприкритою.
ok('затемнення лежить у body і накриває шапку',
   geo.затемнення_є && geo.затемнення_в_body === true && geo.над_шапкою !== null,
   `z=${geo.затемнення_z} у body=${geo.затемнення_в_body}`);

// Хапаємо за ручку (grip) — вона працює завжди, навіть коли опис прокручено.
const gripXY = await p.evaluate(() => {
  const g = document.querySelector('.cm-board-modal-note .cm-board-modal-grip')
         || document.querySelector('.cm-board-modal-note .cm-board-modal-bar');
  if (!g) return null;
  const r = g.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
});
ok('ручка свайпу існує і видима', !!gripXY, gripXY ? `${gripXY.x},${gripXY.y}` : 'немає');

const DY = 120;
if (gripXY) {
  await touch('touchStart', gripXY.x, gripXY.y);
  for (let s = 20; s <= DY; s += 20) { await touch('touchMove', gripXY.x, gripXY.y + s); await p.waitForTimeout(16); }
  const mid = await modalBox();          // палець ЩЕ на екрані — міряємо живий стан

  // 🔴 ГОЛОВНА ПЕРЕВІРКА. На зламаному коді тут було translate(-50%,…) → left ≈ −195.
  ok('свайп вниз НЕ зсуває аркуш убік', mid && Math.abs(mid.left - rest.left) <= 2,
     mid ? `left ${rest.left} → ${mid.left}` : 'модалки немає');
  // Аркуш іде за пальцем: верх опустився приблизно на пройдений шлях.
  ok('аркуш іде за пальцем по вертикалі', mid && Math.abs((mid.top - rest.top) - DY) <= 12,
     mid ? `top ${rest.top} → ${mid.top} (очікували +${DY})` : 'модалки немає');

  await touch('touchEnd', gripXY.x, gripXY.y + DY);
  await p.waitForTimeout(500);
}

// ── 2. Короткий рух (нижче порогу) — аркуш мусить стати рівно на місце ───────
await closeAd();
await openAd(901);
const rest2 = await modalBox();
const grip2 = await p.evaluate(() => {
  const g = document.querySelector('.cm-board-modal-note .cm-board-modal-grip');
  if (!g) return null;
  const r = g.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
});
if (grip2) {
  await touch('touchStart', grip2.x, grip2.y);
  for (let s = 10; s <= 30; s += 10) { await touch('touchMove', grip2.x, grip2.y + s); await p.waitForTimeout(16); }
  await touch('touchEnd', grip2.x, grip2.y + 30);
  await p.waitForTimeout(600);
  const back = await modalBox();
  ok('короткий рух повертає аркуш рівно на місце',
     back && Math.abs(back.top - rest2.top) <= 2 && Math.abs(back.left - rest2.left) <= 2,
     back ? `${rest2.left},${rest2.top} → ${back.left},${back.top}` : 'модалки немає');
}

// ── 3. Оголошення БЕЗ фото — 18% нашої Дошки, у макета такого кадру немає ────
await closeAd();
ok('оголошення без фото відкривається', await openAd(902));
const noPhoto = await modalBox();
ok('без фото аркуш теж на всю ширину і не зсунутий',
   noPhoto && noPhoto.left <= 1 && noPhoto.w >= 388,
   noPhoto ? `left=${noPhoto.left} w=${noPhoto.w}` : 'модалки немає');
// 3 оголошення з 17 не мають фото — макет такого кадру не показує, тож правило наше:
// шару фото немає взагалі, аркуш іде майже на весь екран, але смужка затемнення згори
// лишається (без неї це вже не «аркуш» і зникає підказка «мене можна стягнути»).
const geoNo = await p.evaluate(() => {
  const H = window.innerHeight;
  const s = document.querySelector('.cm-ad-sheet');
  return {
    екран: H,
    шар_фото_є: !!document.querySelector('.cm-ad-photo'),
    аркуш_верх: s ? Math.round(s.getBoundingClientRect().top) : null,
    кнопок_у_шапці: document.querySelectorAll('.cm-ad-sheet .cm-ad-round').length,
  };
});
ok('без фото шару фото немає взагалі', geoNo.шар_фото_є === false);
ok('без фото аркуш вище, але не в стик із верхом',
   geoNo.аркуш_верх > 20 && geoNo.аркуш_верх < geoNo.екран * 0.20,
   `top=${geoNo.аркуш_верх} з ${geoNo.екран}`);
ok('без фото кнопки дій переїхали в шапку аркуша', geoNo.кнопок_у_шапці === 3,
   `${geoNo.кнопок_у_шапці} з 3`);

// ── 4. Сторож DRY: свайп модалки оголошення описаний РІВНО ОДИН раз ──────────
// Саме друга копія й розійшлась із першою. Рахуємо по коду, а не по поведінці:
// поведінковий стенд не побачить другого шляху, поки той не відкриють із чату.
// ⚠️ Міряємо КОД, а не прозу: коментарі знімаються перед пошуком. Перша версія цієї
// перевірки падала на власному ж поясненні бага («було translate(-50%, …)») — тобто
// ловила текст, а не поведінку. Це рівно та пастка, про яку каже правило проєкту
// «критерій має міряти наслідок, а не форму запису».
const src = projectFile('src/tabs/board.js')
  .replace(/\/\*[\s\S]*?\*\//g, '')      // блокові коментарі
  .replace(/^[ \t]*\/\/.*$/gm, '');      // рядкові коментарі (цілим рядком)
const centered = (src.match(/centeredRemaining\s*\(/g) || []).length;
ok('centeredRemaining більше не вживається для аркуша оголошення', centered === 0,
   `знайдено ${centered}`);
const halfShift = (src.match(/translate\(-50%,\s*calc\(-50%/g) || []).length;
ok('математики центрованої картки в модалці оголошення немає', halfShift === 0,
   `знайдено ${halfShift}`);

// ── 5. Контроль: перевірка мусить ЛОВИТИ зсув, а не просто мовчати ──────────
// Без цього «усе зелено» нічого не доводить — так само виглядав би зламаний стенд.
await closeAd();
await openAd(901);
const ctrlBefore = await modalBox();
await p.evaluate(() => {
  const m = document.querySelector('.cm-board-modal-note');
  if (!m) return;
  m.style.transition = 'none';                       // інакше зсув їхав би 240мс
  m.style.transform = 'translate(-50%, 0)';          // навмисно відтворюємо баг
});
await p.waitForTimeout(60);                          // дати браузеру перерахувати геометрію
const ctrlAfter = await modalBox();
ok('контроль: зсув убік СПРАВДІ помітний виміром',
   ctrlBefore && ctrlAfter && Math.abs(ctrlAfter.left - ctrlBefore.left) > 100,
   ctrlBefore && ctrlAfter ? `left ${ctrlBefore.left} → ${ctrlAfter.left}` : 'модалки немає');

await b.close(); await stop();
done();
