// Стенд: РЕЖИМ «ЗБЕРЕЖЕНІ» НА ДОШЦІ — ЕКРАН, А НЕ ГОЛИЙ СПИСОК.
//
// 🗣️ Скарга Вови 05.09«b» зі знімка: «а що з вкладкою "збережені" в дошці? Вона
// ніби змінила вигляд, пошук притиснутий до верху, UI UX взагалі немає».
//
// 🔴 ЧОМУ ЦЕ СТАЛОСЬ — І ЧОМУ САМЕ ТАКИЙ СТЕНД. Того ж дня я прибрав дубль-екран
// `openSavedAds` і спрямував пункт меню в ЦЕЙ режим, попередньо звіривши, що він
// уміє все ФУНКЦІОНАЛЬНО: пошук, повні картки з фото, зняття закладки. І жодного
// разу не подивився на його ХРОМ. А `showCategories` там false, тобто бордовий
// блок не малювався взагалі: у шапці лишався голий рядок пошуку заввишки 41px —
// без назви екрана, без лічильника і без ВИХОДУ (вийти з режиму було ніяк:
// `activeType` скидався лише при виході з акаунта).
// ➡️ Тому стенд міряє не розмітку, а те, чого бракувало людині: чи знає вона,
// ДЕ вона, СКІЛЬКИ тут і ЯК вийти.

import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const ts = Date.now() - 2 * 864e5;
const iso = t => new Date(t).toISOString();
const мк = (id, cat, t, off) => ({
  id, type: 'board', category: cat, title: t, text: 'Опис оголошення.', photos: [],
  price: null, currency: 'UAH', location: 'Олика', author_name: 'Віктор',
  owner_uid: 'u' + id, status: 'published', ts: ts + off,
  created_at: iso(ts + off), bumped_at: iso(ts + off),
});
const POSTS = [
  мк(7001, 'продам', 'Продам піч-буржуйку, стан хороший', 0),
  мк(7002, 'віддам', 'Віддам кошенят у добрі руки', 6e5),
  мк(7010, 'продам', 'Дрова рубані метрові', 7e5),
];
const USER = { id: 'uid-a', email: 'a@example.com', user_metadata: { full_name: 'Володимир' } };

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });

/** Відкрити Дошку в режимі «Збережені» ШЛЯХОМ ЛЮДИНИ: меню «+» → «Збережені». */
async function відкрити(saved) {
  const p = await ctx.newPage();
  await mockSupabase(p, { posts: POSTS, saved_posts: saved, profiles: [] }, { user: USER });
  await p.route('**://api.open-meteo.com/**', r => r.abort());
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  await p.evaluate(() => document.querySelector('.consent-accept')?.click());
  await p.waitForTimeout(400);
  await p.evaluate(() => window.switchTab && window.switchTab('board'));
  await p.waitForTimeout(2200);
  // Аркуш правил Дошки — перший візит; без нього далі нічого не натиснути.
  await p.evaluate(() => [...document.querySelectorAll('button')]
    .find(x => /Ознайомився/.test(x.textContent))?.click());
  await p.waitForTimeout(700);
  await p.evaluate(() => document.querySelector('.board-fab,.bd-fab,[class*="fab"]')?.click());
  await p.waitForTimeout(600);
  await p.evaluate(() => document.querySelector('[data-fab="saved"]')?.click());
  await p.waitForTimeout(1200);
  return p;
}

// ── 1. НЕПОРОЖНІЙ РЕЖИМ ────────────────────────────────────────────────────
const p = await відкрити([{ uid: 'uid-a', post_id: 7001 }, { uid: 'uid-a', post_id: 7002 }]);

ok('режим «Збережені» відкрився', await p.evaluate(() =>
  document.querySelector('.bd-search-input')?.placeholder === 'Пошук у збережених...'));

// 🔴 Саме ця перевірка ловить ту ваду, яку зняв Вова: у шапці була РІВНО ОДНА
// дитина — рядок пошуку. Бордового блоку не існувало.
ok('🔴 шапка — не голий рядок пошуку (є бордовий блок)',
   await p.evaluate(() => !!document.querySelector('.bd-controls .bd-titlebar')));

ok('🔴 екран називає себе («Збережені»)',
   'Збережені' === await p.evaluate(() =>
     document.querySelector('.bd-hero-title')?.textContent.trim() || ''));

// 🔑 Число мусить збігатися з тим, що НА ЕКРАНІ. Лічильник, який більший за
// список, — це та сама вада, що применшене число в капсулах (`HOT_RULES` №12),
// лише в інший бік.
const збіг = await p.evaluate(() => {
  const sub = document.querySelector('.bd-hero-sub')?.textContent || '';
  const n = Number((sub.match(/^\s*(\d+)/) || [])[1]);
  const карток = document.querySelectorAll('#board-content .cm-board-note, .bd-body .cm-board-note').length;
  return { n, карток, sub: sub.trim() };
});
ok('🔑 лічильник у шапці збігається зі списком',
   збіг.n === збіг.карток && збіг.n === 2, `${збіг.n} проти ${збіг.карток} · «${збіг.sub}»`);

// ── 2. ВИХІД — ГОЛОВНЕ, ЧОГО НЕ БУЛО ───────────────────────────────────────
ok('🔴 у шапці є кнопка виходу', await p.evaluate(() => !!document.querySelector('#bd-saved-exit')));

// 📐 Ціль міряється ВЛУЧАННЯМ, а не рамкою вузла: видимий кружечок 36px, ціль
// розширена `::after` до 44 — рамка цього не показує, і перевірка по ній
// збрехала б у наш бік (заміряно 05.09 на кнопці зняття в хабі).
const ціль = await p.evaluate(() => {
  const b = document.querySelector('#bd-saved-exit'); if (!b) return 0;
  const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const влучає = (dx, dy) => { const e = document.elementFromPoint(cx + dx, cy + dy);
    return !!(e && (e === b || b.contains(e) || e.closest?.('#bd-saved-exit') === b)); };
  let s = 0; for (let i = 12; i <= 26; i++) if (влучає(i - 0.6, 0) && влучає(0, i - 0.6)) s = i;
  return s * 2;
});
ok('📐 ціль виходу під палець ≥ 44px', ціль >= 44, `${ціль}px`);

await p.evaluate(() => document.querySelector('#bd-saved-exit')?.click());
await p.waitForTimeout(900);
ok('🔴 вихід повертає до ВСІХ оголошень', await p.evaluate(() =>
  document.querySelector('.bd-hero-title')?.textContent.trim() === 'Дошка оголошень'
  && document.querySelector('.bd-search-input')?.placeholder === 'Пошук по дошці...'));
await p.close();

// ── 3. ПОРОЖНІЙ СТАН — НЕ ТУПИК ────────────────────────────────────────────
const p2 = await відкрити([]);
ok('порожній режим теж має шапку і назву', await p2.evaluate(() =>
  !!document.querySelector('.bd-controls .bd-titlebar')
  && document.querySelector('.bd-hero-title')?.textContent.trim() === 'Збережені'));

// 🛑 Підказка «тап по закладці знімає» при НУЛІ обіцяла б дію, якої нема над чим
// робити — той самий клас, що фальшиве підтвердження вимикачів (B-33).
ok('🛑 порожній стан не обіцяє зняття закладки',
   !/знімає/.test(await p2.evaluate(() => document.querySelector('.bd-hero-sub')?.textContent || '')),
   await p2.evaluate(() => document.querySelector('.bd-hero-sub')?.textContent.trim() || '—'));

ok('🔴 у порожньому стані є ДІЯ, а не лише текст',
   await p2.evaluate(() => !!document.querySelector('[data-bd-saved-exit]')));

// ⚠️ Кнопка мусить стояти на ВЛАСНОМУ рядку: `.bd-empty-reset` має
// `display: inline-block`, і в потоці вона затікала в останній рядок тексту
// («…зʼявиться тут. [До всіх оголошень]»). У розмітці це виглядало бездоганно —
// видно було лише на знімку.
// 🛑 05.09 — ПЕРША РЕДАКЦІЯ ЦІЄЇ ПЕРЕВІРКИ БУЛА БРЕХЛИВА (десятий випадок за
// три доби). Вона тикала `elementFromPoint` ліворуч від кнопки і питала, чи це
// вузол із текстом — але текст порожнього стану лежить ПРЯМИМИ текстовими
// вузлами в тому самому контейнері, тож ліворуч завжди повертався сам
// контейнер, і перевірка червоніла над уже виправленим кодом.
// ➡️ Міряємо те, що справді означає «на своєму рядку»: жоден ПРЯМОКУТНИК
// ТЕКСТУ (через `Range` по текстових вузлах) не перетинає смугу кнопки по
// вертикалі. Це визначення не залежить від того, як саме влаштована розмітка.
const затікає = await p2.evaluate(() => {
  const btn = document.querySelector('[data-bd-saved-exit]');
  const box = btn?.closest('.bd-empty') || btn?.parentElement?.parentElement;
  if (!btn || !box) return 'немає кнопки';
  const b = btn.getBoundingClientRect();
  const рядки = [];
  for (const вузол of box.childNodes) {
    if (вузол.nodeType !== Node.TEXT_NODE || !вузол.textContent.trim()) continue;
    const r = document.createRange(); r.selectNodeContents(вузол);
    рядки.push(...Array.from(r.getClientRects()));
  }
  const перетин = рядки.find(r => r.bottom > b.top + 2 && r.top < b.bottom - 2);
  return перетин ? `текст на висоті кнопки: ${Math.round(перетин.top)}–${Math.round(перетин.bottom)} проти ${Math.round(b.top)}–${Math.round(b.bottom)}` : '';
});
ok('⚠️ кнопка на власному рядку, не затікає в текст', !затікає, затікає || 'чисто');

await p2.evaluate(() => document.querySelector('[data-bd-saved-exit]')?.click());
await p2.waitForTimeout(900);
ok('кнопка порожнього стану теж веде до всіх оголошень', await p2.evaluate(() =>
  document.querySelector('.bd-hero-title')?.textContent.trim() === 'Дошка оголошень'));

await b.close();
await stop();
done();
