// tests/profile-ads.mjs — ОГОЛОШЕННЯ АВТОРА В КАРТЦІ ПРОФІЛЮ.
//
// Замовлення Вови 06.08: «при відкритті модалки перегляду акаунту треба додати
// туди оголошення і всі оголошення автора, але щоб це було компактно».
//
// 🔑 ЩО САМЕ МІРЯЄМО І ЧОМУ ТАК.
// Шлях у стенді — той самий, що в людини: відкрити оголошення → тапнути автора
// → побачити картку. Не викликаємо `openProfileCard()` напряму: половина
// цінності цієї фічі саме в тому, що вона доступна З ОГОЛОШЕННЯ, і виклик
// функції в обхід інтерфейсу перевіряв би функцію, а не фічу.
//
// ⚠️ МЕЖА ЦЬОГО СТЕНДА, ЯКУ ТРЕБА ЗНАТИ. Підроблена база (`_board-fixture.mjs`)
// віддає всі рядки таблиці й ІГНОРУЄ `.eq()`. Тому «чужі `pending` не показуємо»
// тут перевірити НЕМОЖЛИВО — фільтр `status = 'published'` живе в запиті, і його
// стереже окрема статична перевірка внизу файлу. Це слабший рубіж, і він названий
// слабким навмисно: краще чесна межа, ніж перевірка, яка вдає, що щось довела.

import { chromium } from 'playwright';
import { launch, serve, projectFile, reporter } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();

const ts = Date.now() - 2 * 864e5;
const мк = (id, title, extra = {}) => ({
  id, type: 'board', category: 'продам', title,
  text: 'Опис оголошення для стенда.',
  photos: [], price: null, price_negotiable: true, currency: 'UAH',
  location: 'Олика', author: 'Микола', author_name: 'Микола', owner_uid: 'u7',
  status: 'published', ts, created_at: new Date(ts).toISOString(),
  bumped_at: new Date(ts).toISOString(), ...extra,
});

// П'ять оголошень ОДНОГО автора: більше за стелю показу (3) — інакше кнопка
// «Показати всі» не з'явилась би і лишилась неперевіреною.
const POSTS = [
  мк(701, 'ПРОДАМ КОРОВУ'),
  мк(702, 'ПРОДАМ ТРАКТОР', { price: 120000, price_negotiable: false }),
  мк(703, 'ПРОДАМ СІНО'),
  мк(704, 'ПРОДАМ ДРОВА'),
  // Без назви — заголовок мусить прийти з тексту (`cardTitleText`), а не бути порожнім.
  мк(705, '', { text: 'Віддам кошенят у добрі руки. Дуже ласкаві, привчені до лотка.' }),
];

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
await mockSupabase(p, { posts: POSTS, announcements: [] });
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.evaluate(() => window.switchTab && window.switchTab('board'));
await p.waitForTimeout(1500);

// ── Відкриваємо оголошення і тапаємо автора ─────────────────────────────────
const відкрито = await p.evaluate(() => {
  const el = document.querySelector('#board-content [data-post-id="701"]');
  if (!el) return false;
  el.scrollIntoView({ block: 'center' });
  el.click();
  return true;
});
await p.waitForTimeout(700);
ok('оголошення відкрилось', відкрито);

const тапАвтора = await p.evaluate(() => {
  const a = document.querySelector('.cm-ad-author[data-av-uid]');
  if (!a) return false;
  a.click();
  return true;
});
await p.waitForTimeout(900);
ok('тап по автору відкрив картку профілю', тапАвтора && await p.evaluate(() => !!document.querySelector('.pcard')));

// ── Що показує секція ────────────────────────────────────────────────────────
const st = () => p.evaluate(() => {
  const q = s => document.querySelector(s), rc = e => e ? e.getBoundingClientRect() : null;
  const box = q('.pcard-ads');
  const rows = [...document.querySelectorAll('.pcard-ad')];
  return {
    секція_є: !!box && !box.hidden,
    рядків: rows.length,
    кнопка_ще: (() => { const m = q('.pcard-ads-more'); return m ? m.textContent.trim() : null; })(),
    заголовок: (() => { const h = q('.pcard-ads-h'); return h ? h.textContent.trim() : null; })(),
    висота_рядка: rows.length ? Math.round(rc(rows[0]).height) : null,
    назви: rows.map(r => (r.querySelector('.pcard-ad-title') || {}).textContent || ''),
    ціни: rows.map(r => { const c = r.querySelector('.pcard-ad-price'); return c ? c.textContent.trim() : null; }),
    // Іконка категорії замість фото — колір мусить бути КЛАСОМ, не інлайном.
    без_фото_клас: (() => {
      const n = q('.pcard-ad-ph--none');
      return n ? { клас: [...n.classList].some(c => c.startsWith('cat-c-')), інлайн: n.style.color || '' } : null;
    })(),
    назва_в_один_рядок: (() => {
      const t = q('.pcard-ad-title');
      return t ? getComputedStyle(t).whiteSpace : null;
    })(),
  };
});

const s = await st();
ok('секція оголошень зʼявилась', s.секція_є === true, `рядків ${s.рядків}`);
// Компактно = видно 3, решта за кнопкою. Стеля не «щоб було менше», а щоб секція
// не витіснила з екрана те, заради чого картку профілю й відкрили.
ok('видно рівно 3 оголошення, решта — за кнопкою', s.рядків === 3, `${s.рядків}`);
ok('кнопка називає ПОВНЕ число, а не «ще N»', s.кнопка_ще === 'Показати всі 5', s.кнопка_ще);
ok('секція підписана і показує кількість', s.заголовок === 'Оголошення · 5', s.заголовок);
// 📐 Компактність числом, а не на око: рядок Дошки — 98px, тут мусить бути помітно нижче.
ok('рядок компактний (нижчий за 60px проти 98px на Дошці)',
   s.висота_рядка !== null && s.висота_рядка <= 60, `${s.висота_рядка}px`);
ok('назва в один рядок з трикрапкою', s.назва_в_один_рядок === 'nowrap', s.назва_в_один_рядок);
ok('ціна показується, коли вона є', s.ціни.some(c => c && /\d/.test(c)), JSON.stringify(s.ціни));

// ── «Показати всі» ───────────────────────────────────────────────────────────
await p.evaluate(() => document.querySelector('.pcard-ads-more').click());
await p.waitForTimeout(250);
const s2 = await st();
ok('«Показати всі» розкриває решту в тій самій картці', s2.рядків === 5, `${s2.рядків}`);
ok('після розкриття кнопки більше немає', s2.кнопка_ще === null, String(s2.кнопка_ще));
// 🔑 9 із 19 оголошень у живій базі не мають назви. Без спільного `cardTitleText`
// у рядок ліз би весь текст (рекорд — 1296 символів) або порожньо.
ok('безназвене оголошення дістало заголовок із тексту',
   s2.назви.some(n => n.trim().startsWith('Віддам кошенят')),
   JSON.stringify(s2.назви.map(n => n.slice(0, 30))));

// Колір іконки категорії — класом. `catColor()` віддає ІМʼЯ токена ('white'),
// а не CSS-колір: інлайн дав би білу іконку на білому.
ok('колір іконки категорії заданий класом, не інлайном',
   s2.без_фото_клас === null || (s2.без_фото_клас.клас === true && !s2.без_фото_клас.інлайн),
   JSON.stringify(s2.без_фото_клас));

// ── Тап по рядку веде на оголошення ─────────────────────────────────────────
const перехід = await p.evaluate(async () => {
  const rows = [...document.querySelectorAll('.pcard-ad')];
  const row = rows.find(r => r.dataset.pcardAd === '702');
  if (!row) return { помилка: 'рядка немає' };
  row.click();
  await new Promise(r => setTimeout(r, 900));
  // ⚠️ ОСТАННЯ модалка, а не перша. Оголошення відкривається ШАРОМ поверх того,
  // з якого прийшли (стек: оголошення А → профіль → оголошення Б, «назад» веде
  // до А — так само поводиться OLX). Перша версія стенда брала
  // `querySelector('.cm-ad-title')`, тобто НИЖНЮ модалку, і «доводила», що
  // відкрилось не те оголошення. Класична пастка: перевірка міряла порядок у
  // DOM, а людина бачить верхній шар.
  const шари = [...document.querySelectorAll('.cm-ad-screen')];
  const верх = шари[шари.length - 1];
  return {
    картка_закрилась: !document.querySelector('.pcard'),
    шарів: шари.length,
    назва: verhNazva(верх),
  };
  function verhNazva(el) {
    const t = el && el.querySelector('.cm-ad-title');
    return t ? t.textContent.trim() : '';
  }
});
// 🔑 Картка мусить ЗАКРИТИСЬ перед відкриттям оголошення: вона малюється класом
// `app-modal--top`, тобто ПОВЕРХ УСЬОГО — інакше нове оголошення лягло б під нею
// і людина дивилась би на профіль замість щойно відкритого оголошення.
ok('тап по рядку закрив картку профілю', перехід.картка_закрилась === true, JSON.stringify(перехід));
ok('нове оголошення лягло ШАРОМ поверх старого (жест «назад» поверне до нього)',
   перехід.шарів === 2, `шарів ${перехід.шарів}`);
ok('і на верхньому шарі саме те оголошення, яке тапнули',
   /ТРАКТОР/i.test(перехід.назва), перехід.назва.slice(0, 40));

// ── Статичний рубіж: приватність запиту ─────────────────────────────────────
// Слабший за вимір, і названий слабким свідомо (див. шапку файлу). Але без нього
// не лишилось би ЖОДНОЇ перевірки на те, що стороннім не показують чужі
// оголошення «на модерації» — а це вже не косметика, а доступ до даних.
const src = projectFile('src/core/supabase.js');   // віддає ВМІСТ, не шлях
const fn = src.slice(src.indexOf('export async function fetchAuthorAds'));
const тіло = fn.slice(0, fn.indexOf('\n}'));
const єStatus = /\.eq\('status',\s*'published'\)/.test(тіло);
const єType   = /\.eq\('type',\s*'board'\)/.test(тіло);
ok('запит оголошень автора бере ЛИШЕ опубліковані', єStatus,
   єStatus ? "у запиті стоїть .eq('status','published')" : 'ФІЛЬТРА НЕМАЄ — сторонній побачить чужі pending');
ok('і лише оголошення (не обговорення)', єType,
   єType ? "у запиті стоїть .eq('type','board')" : 'ФІЛЬТРА НЕМАЄ — в список полізуть обговорення');

await b.close();
await stop();
done();
