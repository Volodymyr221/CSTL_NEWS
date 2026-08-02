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
    text: 'Просторий будинок у тихому місці. '.repeat(60),   // досить довгий, щоб назва встигла поїхати за верх
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
// Лічильник слухачів `resize` на window — сторож витоку, знайденого аудитом 02.08.
await ctx.addInitScript(() => {
  window.__lcResize = 0;
  const orig = window.addEventListener.bind(window);
  window.addEventListener = function (t, f, o) { if (t === 'resize') window.__lcResize++; return orig(t, f, o); };
});
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

// ── 1б. ОДИН НАТИВНИЙ СКРОЛЕР ────────────────────────────────────────────────
// Третій захід (02.08). Скарга Вови: «все дуже глючить, не плавно». Корінь був у тому,
// що прокрутку рухав НАШ код. Тепер її веде браузер, а фото — просто перший блок вмісту.
const st = () => p.evaluate(() => {
  const q = s => document.querySelector(s), rc = e => e ? e.getBoundingClientRect() : null;
  const sc = q('.cm-ad-scroll'), photo = q('.cm-ad-photo'), sheet = q('.cm-ad-sheet');
  const bar = q('.cm-ad-bottom'), mini = q('.cm-ad-mini'), rep = q('.cm-ad-report');
  const rnd = q('.cm-ad-top .cm-ad-round'), modal = q('.cm-ad-screen');
  return {
    екран: window.innerHeight,
    скролерів: document.querySelectorAll('.cm-ad-screen .cm-ad-scroll').length,
    жест_скролера: sc ? getComputedStyle(sc).touchAction : null,
    прокрутка: sc ? Math.round(sc.scrollTop) : null,
    вміст: sc ? sc.scrollHeight : null,
    вікно: sc ? sc.clientHeight : null,
    фото_верх: photo ? Math.round(rc(photo).top) : null,
    фото_радіус: photo ? getComputedStyle(photo).borderTopLeftRadius : null,
    аркуш_радіус: sheet ? parseFloat(getComputedStyle(sheet).borderTopLeftRadius) : null,
    наїжджає: photo && sheet ? Math.round(rc(photo).bottom - rc(sheet).top) : null,
    панель_низ: bar ? Math.round(rc(bar).bottom) : null,
    панель_радіус: bar ? parseFloat(getComputedStyle(bar).borderTopLeftRadius) : null,
    тінь_шарів: bar ? (getComputedStyle(bar).boxShadow.match(/rgba?\(/g) || []).length : 0,
    просвіт_до_кнопок: (bar && rep) ? Math.round(rc(bar).top - rc(rep).bottom) : null,
    шапка_видно: mini ? +getComputedStyle(mini).opacity > 0.5 : null,
    шапка_поза_скролером: mini ? !sc.contains(mini) : null,
    кнопка: rnd ? Math.round(rc(rnd).width) : null,
    зсув_модалки: modal ? getComputedStyle(modal).transform : null,
    фото_прилипає: photo ? getComputedStyle(photo).position : null,
    чіп_від_верху: (() => { const c = q('.cm-ad-head .cm-board-cat'); return (c && sheet) ? Math.round(rc(c).top - rc(sheet).top) : null; })(),
    чіп_до_назви: (() => { const c = q('.cm-ad-head .cm-board-cat'), t = q('.cm-ad-title'); return (c && t) ? Math.round(rc(t).top - rc(c).bottom) : null; })(),
    капс_назви: (() => { const t = q('.cm-ad-title'); return t ? getComputedStyle(t).textTransform : null; })(),
    розмір_назви: (() => { const t = q('.cm-ad-title'); return t ? parseFloat(getComputedStyle(t).fontSize) : null; })(),
    капс_локації: (() => { const l = q('.cm-ad-meta-loc'); return l ? getComputedStyle(l).textTransform : null; })(),
    межа_під_описом: (() => { const t = q('.cm-ad-text'); return t ? parseFloat(getComputedStyle(t).borderBottomWidth) : null; })(),
    аркуш_висота: sheet ? Math.round(rc(sheet).height) : null,
    рисочок: document.querySelectorAll('.cm-ad-screen .cm-board-modal-bar').length,
    шапка_фон: mini ? getComputedStyle(mini).backgroundColor : null,
  };
});
const s0 = await st();
// 🔴 ГОЛОВНЕ РІШЕННЯ ЗАХОДУ: прокрутка ОДНА і РІДНА.
ok('скролер у модалці рівно один', s0.скролерів === 1, `${s0.скролерів}`);
// `pan-y` — це НЕ перехоплення: вертикаль явно віддана браузеру (лишається рідною),
// а горизонталь забрана під жест «назад». Перехоплення вертикалі (`none`) і давало ривки.
ok('вертикаль веде БРАУЗЕР (touch-action: pan-y)', s0.жест_скролера === 'pan-y', s0.жест_скролера);
ok('ФОТО від самого верху екрана і без заокруглень',
   s0.фото_верх === 0 && s0.фото_радіус === '0px', `top=${s0.фото_верх} radius=${s0.фото_радіус}`);
// Замовлення Вови: «фотографія просто стоїть на місці, а блок опису наскролюється доверху».
ok('ФОТО стоїть на місці (sticky), а не їде з текстом', s0.фото_прилипає === 'sticky', s0.фото_прилипає);
// ── Полірування 02.08 (шість пунктів від Вови) ───────────────────────────────
ok('чіп не приліплений до верхнього краю аркуша', s0.чіп_від_верху >= 14, `${s0.чіп_від_верху}px`);
ok('чіп і назва читаються однією групою', s0.чіп_до_назви <= 12, `${s0.чіп_до_назви}px`);
ok('назва КАПСОМ', s0.капс_назви === 'uppercase', s0.капс_назви);
ok('назва не більша за 22px', s0.розмір_назви <= 22, `${s0.розмір_назви}px`);
ok('населений пункт КАПСОМ', s0.капс_локації === 'uppercase', s0.капс_локації);
ok('опис відділений від картки автора лінією', s0.межа_під_описом >= 1, `${s0.межа_під_описом}px`);
// «Забрати рисочку» — на сторінці з фото вона вже нічого не означає.
ok('на сторінці з фото рисочки немає', s0.рисочок === 0, `${s0.рисочок}`);
// Баг зі скріна IMG_3811: крізь напівпрозору шапку просвічував текст, що проїжджав.
ok('компактна шапка НЕпрозора', s0.шапка_фон === 'rgb(255, 255, 255)', s0.шапка_фон);
ok('АРКУШ заокруглений і наїжджає на фото',
   s0.аркуш_радіус >= 20 && s0.наїжджає > 0, `radius=${s0.аркуш_радіус} наїзд=${s0.наїжджає}px`);
ok('ПАНЕЛЬ ДІЙ у межах екрана, заокруглена, тінь двошарова',
   s0.панель_низ <= s0.екран + 1 && s0.панель_радіус >= 16 && s0.тінь_шарів >= 2,
   `низ ${s0.панель_низ}, radius ${s0.панель_радіус}, шарів ${s0.тінь_шарів}`);
// Знайдено власним аудитом 02.08: було 36px при нормі Apple HIG 44.
ok('кругла кнопка не менша за тап-ціль Apple HIG', s0.кнопка >= 44, `${s0.кнопка}px`);
ok('старт: компактної шапки не видно', s0.шапка_видно === false);
ok('компактна шапка ПОЗА скролером (не може штовхнути текст)', s0.шапка_поза_скролером === true);
ok('вміст прокручується (є що читати)', s0.вміст > s0.вікно, `${s0.вміст} з ${s0.вікно}`);

// Прокрутка до кінця: текст не має ховатись за кнопками, а назву заступає компактна шапка.
await p.evaluate(() => { const s = document.querySelector('.cm-ad-scroll'); s.scrollTop = s.scrollHeight; });
await p.waitForTimeout(300);
const sEnd = await st();
ok('останній рядок тексту НЕ впирається у кнопки', sEnd.просвіт_до_кнопок > 8, `${sEnd.просвіт_до_кнопок}px`);
// 🔴 НАЙВАЖЛИВІШИЙ ПУНКТ ПОЛІРУВАННЯ. Вова: «не повинно бути ситуації, коли після
// „Поскаржитися“ відкривається ще кілька сотень пікселів порожнього простору».
// Прокрутка мусить закінчуватись на останньому елементі, а не на довільній позиції.
ok('після останнього елемента НЕМАЄ порожнечі', sEnd.просвіт_до_кнопок < 60,
   `${sEnd.просвіт_до_кнопок}px порожнечі`);
ok('коли назва поїхала — компактна шапка заступає її', sEnd.шапка_видно === true);
// А поки назва на екрані — компактної шапки бути не повинно (інакше назва двічі поспіль).
await p.evaluate(() => { const s = document.querySelector('.cm-ad-scroll'); s.scrollTop = 60; });
await p.waitForTimeout(250);
ok('поки назва видима — компактної шапки немає',
   (await st()).шапка_видно === false);

// ── 1в. ДВА БАГИ З АУДИТУ 02.08 ─────────────────────────────────────────────
// 🔴 №1: перерваний жест лишав модалку зсунутою назавжди (заміряно translateY(60px)).
await p.evaluate(() => { const s = document.querySelector('.cm-ad-scroll'); s.scrollTop = 0; });
await p.waitForTimeout(200);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 500, id: 1 }] });
for (let i = 1; i <= 4; i++) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 500 + i * 20, id: 1 }] });
  await p.waitForTimeout(20);
}
// другий палець посеред руху — саме він і залишав модалку висіти
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',
  touchPoints: [{ x: 195, y: 580, id: 1 }, { x: 250, y: 580, id: 2 }] });
await p.waitForTimeout(30);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await p.waitForTimeout(600);
const sBroken = await st();
ok('перерваний жест НЕ лишає модалку зсунутою',
   sBroken.зсув_модалки === 'none' || sBroken.зсув_модалки === 'matrix(1, 0, 0, 1, 0, 0)',
   `${sBroken.зсув_модалки}`);

// 🔴 №2: витік слухачів — по два на кожне відкриття, і вони не знімались ніколи.
// Заміряно в аудиті: 24 слухачі `resize` на window замість 4 після десяти відкриттів.
const leak = await p.evaluate(async () => {
  const before = window.__lcResize || 0;
  for (let i = 0; i < 6; i++) {
    document.querySelector('.cm-ad-screen [data-ad-close]')?.click();
    await new Promise(r => setTimeout(r, 300));
    document.querySelector('#board-content [data-post-id="901"]')?.click();
    await new Promise(r => setTimeout(r, 300));
  }
  return (window.__lcResize || 0) - before;
});
ok('відкриття модалки не додає слухачів на window', leak === 0, `додано ${leak}`);

// ── 1г. ЖЕСТ ВІДПОВІДАЄ ТОМУ, ЧИМ ЕКРАН ВИГЛЯДАЄ ────────────────────────────
// Рішення Вови після живої перевірки: «це якби сторінка, а не модалка».
//   з фото  → закриває свайп ЗЛІВА, вертикального закриття немає;
//   без фото→ закриває свайп УНИЗ, бічного немає.
const swipeFrom = async (x, y, dx, dy, steps = 8) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',
      touchPoints: [{ x: x + Math.round(dx * i / steps), y: y + Math.round(dy * i / steps), id: 1 }] });
    await p.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(700);
};
const isOpen = () => p.evaluate(() => !!document.querySelector('.cm-ad-screen'));

// Сторінка з фото: свайп УНИЗ від верху вмісту НЕ повинен закривати.
await p.evaluate(() => { const s = document.querySelector('.cm-ad-scroll'); if (s) s.scrollTop = 0; });
await p.waitForTimeout(200);
await swipeFrom(195, 400, 0, 260);
ok('сторінка з фото НЕ закривається свайпом униз', await isOpen() === true);
const afterDown = await st();
ok('невдалий свайп униз не лишає слідів', 
   afterDown.зсув_модалки === 'none' || afterDown.зсув_модалки === 'matrix(1, 0, 0, 1, 0, 0)',
   `${afterDown.зсув_модалки}`);
// Свайп ЗЛІВА (від краю вправо) — закриває.
await swipeFrom(8, 420, 260, 0);
ok('сторінка з фото закривається свайпом ЗЛІВА', await isOpen() === false);

// Оголошення БЕЗ ФОТО: дзеркально.
await p.waitForTimeout(300);
ok('оголошення без фото відкрилось', await openAd(902));
await swipeFrom(8, 420, 260, 0);
ok('аркуш без фото НЕ закривається свайпом зліва', await isOpen() === true);
const noPhoto = await p.evaluate(() => ({
  рисочок: document.querySelectorAll('.cm-ad-screen .cm-board-modal-bar').length,
  фото: !!document.querySelector('.cm-ad-photo'),
}));
ok('без фото шару фото немає, а рисочка є',
   noPhoto.фото === false && noPhoto.рисочок === 1, JSON.stringify(noPhoto));
await swipeFrom(195, 400, 0, 260);
ok('аркуш без фото закривається свайпом УНИЗ', await isOpen() === false);


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
// 🔴 Сторож проти повернення ривків. Непасивний `touchmove` над областю прокрутки
// змушує браузер питати JavaScript перед КОЖНИМ кадром — і вимикає швидку прокрутку
// цілком, навіть коли нічого не скасовується. Саме це й дало «все ривками» 02.08.
const nonPassive = (src.match(/passive:\s*false/g) || []).length;
ok('непасивних слухачів дотику в Дошці не лишилось', nonPassive === 0, `знайдено ${nonPassive}`);

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
