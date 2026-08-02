// tests/ad-nophoto.mjs — ЦІЛІСТЬ ЕКРАНА ОГОЛОШЕННЯ: з фото і без фото однаково.
//
// НАВІЩО (скарга Вови 02.08, скрін IMG_3814): «Чому модалка без фото поламана? Чому ти
// не можеш побудувати логічно модалку з фото чи без, немає різниці».
//
// КОРІНЬ, знайдений ПЕРЕД написанням цього стенда (заміряно, не на око). Контейнер
// модалки `.cm-ad-screen` — ПРОЗОРИЙ: він нічого не малює, а розраховує, що вміст сам
// закриє екран. Поки аркуш мав `min-height: 100dvh`, це трималось. Полірування 02.08
// зняло цю висоту (пряме замовлення: «висота по вмісту») — і на 390×844 проступило:
//
//     фон контейнера   rgba(0,0,0,0)
//     аркуш            верх 56, низ 597 при екрані 844
//     діра знизу       247px — крізь неї видно картки Дошки, кнопку «+», банер куки
//     діра зверху      56px  — кнопка «✕» висить поверх ЖИВОЇ шапки застосунку
//     разом            303px = 36% екрана
//
// ЧОМУ ОКРЕМИЙ СТЕНД, А НЕ ЩЕ ОДНА ПЕРЕВІРКА В `ad-sheet-swipe`. Той стенд міряє ЖЕСТ і
// відступи — тобто наслідки правок. Цей міряє інше питання, яке жоден сторож не ставив:
// **чи екран узагалі суцільний**. Саме брак цього питання і пропустив баг у прод.
//
// 🔑 ЯК МІРЯЄМО — і чому НЕ `elementFromPoint`. Перша версія цього стенда питала
// `elementFromPoint` і рахувала точку покритою, якщо там ловиться щось усередині модалки.
// Вона майже збрехала: у діру ловився `.cm-ad-scroll` — це елемент МОДАЛКИ, тобто
// формально «покрито», а насправді він ПРОЗОРИЙ і крізь нього видно Дошку. Перевірка
// міряла влучання пальця, а не видиме оку (та сама пастка, що вже коштувала проєкту
// шести хибних вимірів 27.07).
//
// Тому міряємо СТОВПЧИК ЕЛЕМЕНТІВ: `elementsFromPoint` віддає весь стос у точці, від
// переднього до заднього. Ідемо ним і шукаємо ПЕРШИЙ елемент, який реально щось малює
// (непрозорий фон або картинка). Якщо цей перший непрозорий шар лежить у модалці —
// точка закрита. Якщо раніше за нього трапляється Дошка чи шапка застосунку — діра.
//
// ⚠️ Три випадки, бо діра залежить від висоти вмісту, а не від наявності фото:
//   902 — БЕЗ ФОТО, короткий опис (рівно скрін IMG_3814);
//   903 — З ФОТО, короткий опис (той самий ризик, просто ще не побачений);
//   901 — З ФОТО, довгий опис (стан, який Вова вже приймав як добрий, — контроль).

import { chromium } from 'playwright';
import { launch, serve, projectFile, reporter } from './_lib.mjs';

const { ok, done } = reporter();

const PHOTO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><rect width="1200" height="1600" fill="#8a6"/></svg>');

const ts = Date.now() - 3 * 864e5;
const mk = (id, extra) => ({
  id, type: 'board', category: 'куплю', title: 'КУПЛЮ МОТОЦИКЛ',
  text: 'Куплю мотоцикл у робочому стані.', photos: [], price: null, currency: 'UAH',
  location: 'Вся Олицька громада', author: 'Тест', author_name: 'Тест', owner_uid: 'u1',
  status: 'published', ts, created_at: new Date(ts).toISOString(),
  bumped_at: new Date(ts).toISOString(), ...extra,
});
const POSTS = [
  mk(901, { category: 'продам', title: 'ПРОДАМ БУДИНОК', photos: [PHOTO, PHOTO], photo: PHOTO,
            text: 'Просторий будинок у тихому місці. '.repeat(60), price: 450000, location: 'Жорнище' }),
  mk(902, { price_negotiable: true }),                      // без фото, короткий — сам баг
  mk(903, { photos: [PHOTO], photo: PHOTO, price: 100 }),    // з фото, короткий
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
// Банер згоди про куки перекриває низ екрана і дав би 7 «протікань» у КОЖНОМУ випадку,
// зокрема в контрольному. Це шум виміру, а не наш баг: у Вови банер прийнятий давно.
// Правило проєкту: шумовий поріг має бути 0, інакше порівняння нічого не доводить.
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(300);

const openAd = async id => {
  const hit = await p.evaluate(pid => {
    const el = document.querySelector(`#board-content [data-post-id="${pid}"]`);
    if (!el) return false;
    el.scrollIntoView({ block: 'center' }); el.click(); return true;
  }, id);
  await p.waitForTimeout(750);
  return hit;
};
const closeAd = async () => {
  await p.evaluate(() => {
    const btn = document.querySelector('.cm-board-modal-note [data-ad-close]');
    if (btn) btn.click(); else document.querySelector('#board-backdrop')?.click();
  });
  await p.waitForFunction(() => !document.querySelector('.cm-board-modal-note'), null, { timeout: 3000 })
        .catch(() => {});
  await p.waitForTimeout(350);
};

// ── Головний вимір: чи є на екрані хоч одна точка НЕ з модалки ────────────────
// Сітка 9 × 17 = 153 точки. Крок по вертикалі дрібніший, бо діра саме вертикальна.
// Повертаємо не «так/ні», а СКІЛЬКИ точок протекло і що саме в них — щоб падіння
// стенда одразу казало, де дірка, а не «щось не так».
const holes = () => p.evaluate(() => {
  const modal = document.querySelector('.cm-board-modal-note');
  if (!modal) return { немає: true };
  const W = window.innerWidth, H = window.innerHeight;
  // Чи МАЛЮЄ цей елемент щось непрозоре. Картинка — так за визначенням; для решти
  // дивимось альфу фону. 0.95, а не 1: майже-непрозорий шар оку теж закриває.
  const paints = el => {
    if (!el) return false;
    if (el.tagName === 'IMG') return true;
    const cs = getComputedStyle(el);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
    const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor || '');
    if (!m) return false;
    const parts = m[1].split(',').map(s => parseFloat(s));
    return (parts.length < 4 ? 1 : parts[3]) >= 0.95;
  };
  const out = [];
  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 16; j++) {
      const x = Math.min(W - 1, Math.round(i * W / 8));
      const y = Math.min(H - 1, Math.round(j * H / 16));
      const stack = document.elementsFromPoint(x, y);
      const first = stack.find(paints);
      if (first && (modal === first || modal.contains(first))) continue;
      out.push({ x, y, видно: first ? (String(first.className || '').slice(0, 26) || first.tagName) : 'НІЧОГО' });
    }
  }
  return { всього: 9 * 17, протекло: out.length, приклади: out.slice(0, 4) };
});

const shape = () => p.evaluate(() => {
  const q = s => document.querySelector(s), rc = e => e ? e.getBoundingClientRect() : null;
  const modal = q('.cm-board-modal-note'), sheet = q('.cm-ad-sheet'), sc = q('.cm-ad-scroll');
  const author = q('.cm-ad-author'), since = q('[data-ad-since]');
  return {
    фон: modal ? getComputedStyle(modal).backgroundColor : null,
    повний_клас: !!q('.cm-ad-sheet--full'),
    рисочок: document.querySelectorAll('.cm-ad-screen .cm-board-modal-bar').length,
    аркуш_верх: sheet ? Math.round(rc(sheet).top) : null,
    роль: modal ? modal.getAttribute('role') : null,
    модальність: modal ? modal.getAttribute('aria-modal') : null,
    фон_автора: author ? getComputedStyle(author).backgroundColor : null,
    ціна_текст: (() => { const e = q('.cm-ad-price'); return e ? e.textContent.trim() : null; })(),
    ціна_тиха: !!q('.cm-ad-price--quiet'),
    розмір_ціни: (() => { const e = q('.cm-ad-price'); return e ? parseFloat(getComputedStyle(e).fontSize) : null; })(),
    розмір_назви: (() => { const e = q('.cm-ad-title'); return e ? parseFloat(getComputedStyle(e).fontSize) : null; })(),
    підпис_автора: since ? (since.textContent || '').trim() : null,
    скролер_є: !!sc,
  };
});

// ── 1. БЕЗ ФОТО — той самий екран, що на скріні IMG_3814 ─────────────────────
ok('оголошення БЕЗ ФОТО відкрилось', await openAd(902));
const hNo = await holes();
ok('БЕЗ ФОТО: екран суцільний — нічого чужого не просвічує',
   hNo.протекло === 0, `протекло ${hNo.протекло} з ${hNo.всього}: ${JSON.stringify(hNo.приклади)}`);
const sNo = await shape();
ok('БЕЗ ФОТО: контейнер НЕпрозорий', sNo.фон !== 'rgba(0, 0, 0, 0)' && !/^transparent$/.test(sNo.фон || ''), sNo.фон);
// Замовлення Вови: «побудуй логічно, з фото чи без — немає різниці».
ok('окремого класу «--full» більше немає', sNo.повний_клас === false, String(sNo.повний_клас));
ok('рисочки немає і тут', sNo.рисочок === 0, `${sNo.рисочок}`);
ok('аркуш починається від самого верху', sNo.аркуш_верх <= 1, `${sNo.аркуш_верх}px`);

// Картка автора — дві скарги Вови одним заходом.
ok('картка автора БЕЗ сірого боксу',
   sNo.фон_автора === 'rgba(0, 0, 0, 0)' || sNo.фон_автора === 'transparent', sNo.фон_автора);
ok('підпис автора є ЗАВЖДИ (не порожній рядок)',
   !!sNo.підпис_автора && sNo.підпис_автора.length > 3, JSON.stringify(sNo.підпис_автора));

// «Договірна» — це ВІДСУТНІСТЬ ціни. Заміряно було: назва 21px, «Договірна» 28px
// багряним, тобто найгучніше на 94% екранів написано «я не знаю ціни» (скарга Вови:
// «все накидано, незрозуміло що до чого»).
ok('«Договірна» подана тихо, а не як заголовок', sNo.ціна_тиха === true, sNo.ціна_текст);
ok('тиха ціна щонайменше в півтора раза дрібніша за назву',
   sNo.розмір_ціни <= sNo.розмір_назви / 1.4, `ціна ${sNo.розмір_ціни}px проти назви ${sNo.розмір_назви}px`);

// Доступність — знахідки власного аудиту, що лишались відкритими.
ok('модалка представлена як діалог', sNo.роль === 'dialog', String(sNo.роль));
ok('діалог модальний (aria-modal)', sNo.модальність === 'true', String(sNo.модальність));

// Escape мусить закривати — інакше на зовнішній клавіатурі виходу немає.
await p.keyboard.press('Escape');
await p.waitForTimeout(450);
ok('Escape закриває екран', await p.evaluate(() => !document.querySelector('.cm-board-modal-note')));
await closeAd();

// ── 2. З ФОТО, але короткий опис — той самий ризик, ще не побачений оком ─────
ok('оголошення З ФОТО і коротким описом відкрилось', await openAd(903));
const hShort = await holes();
ok('З ФОТО + короткий опис: екран суцільний',
   hShort.протекло === 0, `протекло ${hShort.протекло}: ${JSON.stringify(hShort.приклади)}`);
const sShort = await shape();
ok('З ФОТО: рисочки немає', sShort.рисочок === 0, `${sShort.рисочок}`);
ok('З ФОТО: контейнер НЕпрозорий', sShort.фон !== 'rgba(0, 0, 0, 0)', sShort.фон);
await closeAd();

// ── 3. З ФОТО, довгий опис — КОНТРОЛЬ: стан, який Вова вже приймав ───────────
ok('оголошення З ФОТО і довгим описом відкрилось', await openAd(901));
const hLong = await holes();
ok('З ФОТО + довгий опис: екран суцільний (контроль)',
   hLong.протекло === 0, `протекло ${hLong.протекло}`);
await closeAd();

// ── 4. ЖЕСТ ОДНАКОВИЙ НА ОБОХ ЕКРАНАХ ───────────────────────────────────────
// Скарга Вови «немає різниці» стосується і жесту: до цього заходу екран без фото
// закривався вниз, а з фото — вбік. Тепер обидва — вбік, і `asPage` як поняття зникло.
const cdp = await ctx.newCDPSession(p);
const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
  type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
const swipeFromEdge = async () => {
  await touch('touchStart', 8, 420);
  for (let x = 40; x <= 260; x += 40) { await touch('touchMove', x, 424); await p.waitForTimeout(16); }
  await touch('touchEnd', 260, 424);
  await p.waitForTimeout(600);
};
for (const [id, назва] of [[902, 'БЕЗ ФОТО'], [903, 'З ФОТО']]) {
  await openAd(id);
  await swipeFromEdge();
  ok(`свайп від лівого краю закриває ${назва}`,
     await p.evaluate(() => !document.querySelector('.cm-board-modal-note')));
  await closeAd();
}

// ── 5. Сторож DRY: розгалуження на «є фото / немає фото» не мусить відроджуватись ──
// До цього заходу їх було ПʼЯТЬ (галерея, клас аркуша, рисочка, вигляд кнопок, жест) —
// четвертий випадок «двох копій» у проєкті. Лишається рівно одне: колір кнопок.
// ⚠️ Рахуємо по КОДУ, а не по файлу: перша версія лічила й коментарі, і сторож червонів
// на пояснення, написане поруч із самою правкою. Це та сама пастка «міряти форму запису
// замість наслідку», яка вже коштувала проєкту шести хибних вимірів 27.07.
const code = projectFile('src/tabs/board.js')
  .split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const hero = (code.match(/hasHero/g) || []).length;
ok('розгалужень на hasHero щонайбільше два', hero <= 2, `${hero} у коді`);
const asPage = (code.match(/asPage/g) || []).length;
ok('поняття «asPage» прибрано з жесту', asPage === 0, `${asPage} у коді`);

await b.close();
stop();
done();
