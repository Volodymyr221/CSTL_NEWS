// Стенд: ХАБ «ЗБЕРЕЖЕНІ» — редизайн 05.09.
//
// 🗣️ Замовлення Вови 05.09: «редизайн модалки збережені і всіх категорій… там є
// старіші колюрації, бежеві такі, плюс вона виглядає несучасно, структурувати
// якось це так по категоріях… і передивитися логіку».
//
// 🔴 НАВІЩО ОКРЕМИЙ СТЕНД, КОЛИ Є `modal-surface.mjs`. Той читає CSS ТЕКСТОМ —
// і це його свідома межа (більшість модалок будується з даних Supabase). Тут же
// аркуш підіймається по-справжньому, тож міряється ОБЧИСЛЕНИЙ колір і жива
// геометрія. Два різні прилади на одну поверхню — не дубль: текстовий ловить
// новий hex у файлі, живий ловить те, що текст побачити не може (успадкований
// фон, перекритий десь іншим правилом, зсунуту ціль під палець).
//
// 🛑 УРОК, ЧЕРЕЗ ЯКИЙ ЦЕЙ ФАЙЛ ІСНУЄ. Беж дожив тут до вересня не тому, що його
// не помітили, а тому, що сторож модалок дивився повз: його взірець селекторів
// не знав префікса `shub-`. Тобто правило було, прилад був, а місце — поза
// полем зору. Тому нижче стоїть КОНТРОЛЬ на справжньому старому CSS.

import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const ts = Date.now() - 3 * 864e5;
const iso = t => new Date(t).toISOString();

// 📐 Сцена навмисно НЕ мінімальна: чотири категорії і довга назва статті.
// На одній короткій картці не видно ні ритму списку, ні переносу — а саме на
// складній сцені 05.09 знайшлись дві вади, яких прості стенди не показували.
// ⚠️ ДВА оголошення, а не одне: на одному лічильник «2 → 1» не перевіряється
// взагалі, а категорія зникає вже після першого зняття — і перевірки лічильників
// зеленіли б ні на чому. Саме на цьому 05.09 спіймався перший варіант стенда.
const POSTS = [
  { id: 7001, type: 'board', title: 'Продам піч-буржуйку, стан хороший',
    text: '.', status: 'published', ts, created_at: iso(ts), owner_uid: 'u2' },
  { id: 7002, type: 'board', title: 'Віддам кошенят у добрі руки',
    text: '.', status: 'published', ts, created_at: iso(ts), owner_uid: 'u3' },
  { id: 7003, type: 'chat', title: 'Коли відновлять освітлення на вулиці Замковій?',
    text: 'Світло не горить третій тиждень.', status: 'published', ts,
    created_at: iso(ts), owner_uid: 'u4' },
];
const ARTICLES = [
  { id: 5001, title: 'В Олиці відремонтували дорогу до замку', excerpt: '.', content: '.', geo: 'Громада', ts },
  { id: 5002, title: 'Волинь отримала нові автобуси на приміські маршрути',
    excerpt: '.', content: '.', geo: 'Волинь', ts },
];
const USER = { id: 'uid-a', email: 'a@example.com', user_metadata: { full_name: 'Володимир' } };

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
await mockSupabase(p, {
  posts: POSTS,
  saved_posts: [{ uid: 'uid-a', post_id: 7001 }, { uid: 'uid-a', post_id: 7002 },
               { uid: 'uid-a', post_id: 7003 }],
  saved_articles: [{ uid: 'uid-a', article_id: 5001, created_at: iso(ts) },
                   { uid: 'uid-a', article_id: 5002, created_at: iso(ts) }],
  profiles: [],
}, { user: USER });
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.route('**/data/articles.json*', r => r.fulfill({ status: 200,
  contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
  body: JSON.stringify(ARTICLES) }));
// Автобус досівається у сховище: це лише СЦЕНА (щоб категорій було чотири), а не
// доказ чогось — урок 31.08 про посів, який «доводив» ваду, створену самим посівом.
await p.addInitScript(() => localStorage.setItem('bus_track_v2:uid-a', JSON.stringify({
  routes: [{ routeId: 'r1', trackDate: '2026-09-06', from: 'Олика', to: 'Луцьк',
             title: 'Олика → Луцьк', dayLabel: 'Завтра', timeStr: '07:20' }] })));
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(400);
await p.evaluate(() => document.getElementById('saved-hub-btn')?.click());
await p.waitForTimeout(1500);

ok('аркуш «Збережені» відкрився', await p.evaluate(() => !!document.querySelector('.shub-sheet')));

// ── 1. ТЕПЛОТА — ЖИВИМ ВИМІРОМ, НЕ ЧИТАННЯМ ФАЙЛУ ──────────────────────────
// Критерій той самий, що в `modal-surface.mjs` і `board-cream.mjs`: R−B ≤ 3.
const теплота = async () => p.evaluate(() => {
  const rb = el => {
    const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
    if (!m || (m[3] !== undefined && +m[3] === 0)) return null;   // прозоре не рахуємо
    return +m[0] - +m[2];
  };
  const out = {};
  for (const sel of ['.shub-sheet', '.shub-handle', '.shub-cat-row', '.shub-cat-ic', '.shub-back']) {
    const el = document.querySelector(sel);
    if (el) out[sel] = rb(el);
  }
  return out;
});
const t1 = await теплота();
const теплі = Object.entries(t1).filter(([, w]) => w !== null && w > 3);
ok('🔴 жодна поверхня хабу не тепла (обчислений колір, R−B ≤ 3)',
   теплі.length === 0, теплі.map(([s, w]) => `${s} +${w}`).join(', ') || JSON.stringify(t1));

// ── 1-БІС. 🔴 КОНТРОЛЬ, ЩО НЕ ЗАЛЕЖИТЬ ВІД ГІЛКИ ──────────────────────────
//
// 🛑 ВИПРАВЛЕННЯ ВЛАСНОЇ ПОМИЛКИ. Перша редакція підкидала в сторінку
// `style/account.css` з `origin/main` і вимагала побачити там беж. Це працювало
// рівно доти, доки редизайн не влився в `main`: після мерджу бежу там немає, і
// контроль почав падати НАЗАВЖДИ — зламався від власного успіху.
// ➡️ Тепер підкидаємо ВІДОМИЙ беж (`#F4F1E6` — той самий, що тут і був до
// редизайну). Перевірка стабільна на будь-якій гілці й доводить, що живий вимір
// справді відрізняє тепле від нейтрального, а не зеленіє на порожньому місці.
await p.addStyleTag({ content: '.shub-cat-row { background: #F4F1E6 !important; }' });
await p.waitForTimeout(200);
const підкинутий = await теплота();
ok('🔴 КОНТРОЛЬ: живий вимір бачить підкинутий беж',
   (підкинутий['.shub-cat-row'] ?? 0) > 3, `.shub-cat-row = ${підкинутий['.shub-cat-row']}`);

// Прибираємо підкидання, щоб далі міряти справжній екран.
await p.evaluate(() => document.querySelectorAll('style').forEach(s => {
  if (s.textContent.includes('#F4F1E6')) s.remove();
}));
await p.waitForTimeout(200);
const назад = await теплота();
ok('КОНТРОЛЬ знято — поверхня знову нейтральна',
   (назад['.shub-cat-row'] ?? null) === null || назад['.shub-cat-row'] <= 3,
   `.shub-cat-row = ${назад['.shub-cat-row']}`);

const кат = await p.evaluate(() =>
  [...document.querySelectorAll('.shub-cat-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim()));
// ⚠️ Імена лише кирилицею: змішана розкладка в ідентифікаторі (латинська «k»
// поруч із кирилицею) потім не знаходиться грепом — у проєкті це вже кусало.
const категоріїОк = k => k.length === 4 && k.every(s => /\d/.test(s));
ok('категорії показані з лічильниками', категоріїОк(кат), кат.join(' | '));

ok('🛑 заголовок НЕ дублюється (одна шапка, не дві)',
   await p.evaluate(() => document.querySelectorAll('.shub-head').length === 1
                       && !document.querySelector('.shub-detail-head')));

// ── 3. ЛОГІКА ПЕРЕХОДУ І «НАЗАД» ───────────────────────────────────────────
await p.evaluate(() => document.querySelector('[data-shub-cat="articles"]')?.click());
await p.waitForTimeout(500);
ok('тап по категорії відкриває її список',
   await p.evaluate(() => document.querySelectorAll('.shub-card').length === 2));
ok('шапка називає відкриту категорію',
   /Статті/.test(await p.evaluate(() => document.querySelector('.shub-head')?.textContent || '')));

// 🔴 Ось те, заради чого шапку зводили в одну: «назад» лежав У СКРОЛЕРІ, тобто
// зникав при прокрутці довгого списку. Перевірка не на розмітку, а на факт.
ok('🔴 «назад» ПОЗА скролером (не зникає при прокрутці списку)',
   await p.evaluate(() => {
     const b = document.querySelector('.shub-back'), s = document.querySelector('#shub-body');
     return !!b && !!s && !s.contains(b);
   }));

// 📐 Ціль під палець міряється ВЛУЧАННЯМ, а не `getBoundingClientRect`: видимий
// кружечок 36px, а ціль розширена невидимим `::after` до 44 — рамка вузла цього
// не показує, і перевірка по ній збрехала б у наш бік.
const ціль = await p.evaluate(() => {
  const b = document.querySelector('.shub-back'); if (!b) return 0;
  const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const влучає = (dx, dy) => { const e = document.elementFromPoint(cx + dx, cy + dy);
    return !!(e && (e === b || b.contains(e) || e.closest?.('.shub-back') === b)); };
  let s = 0; for (let i = 12; i <= 26; i++) if (влучає(i - 0.6, 0) && влучає(0, i - 0.6)) s = i;
  return s * 2;
});
ok('📐 ціль «назад» під палець ≥ 44px', ціль >= 44, `${ціль}px`);

ok('«назад» повертає до списку категорій', await (async () => {
  await p.evaluate(() => document.querySelector('[data-shub-back]')?.click());
  await p.waitForTimeout(400);
  return p.evaluate(() => document.querySelectorAll('.shub-cat-row').length === 4);
})());

// ── 4. Аркуш не їде вбік ───────────────────────────────────────────────────
// Скролер із `overflow-y: auto` за правилом CSS дістає й горизонтальну
// прокрутку — саме тому рядки НЕ виносяться за поля відʼємним `margin`.
ok('🛑 тіло аркуша не прокручується вбік',
   await p.evaluate(() => { const s = document.querySelector('#shub-body');
     return s.scrollWidth <= s.clientWidth; }));

// ── 5. ЗНЯТТЯ ЗБЕРЕЖЕННЯ ПРЯМО В ХАБІ (замовлення Вови 05.09) ──────────────
await p.evaluate(() => document.querySelector('[data-shub-cat="boards"]')?.click());
await p.waitForTimeout(500);
const карток = () => p.evaluate(() => document.querySelectorAll('.shub-card').length);
ok('кнопка зняття є на КОЖНІЙ картці',
   await p.evaluate(() => document.querySelectorAll('.shub-row').length > 0
     && document.querySelectorAll('.shub-row').length === document.querySelectorAll('.shub-unsave').length));

// 📐 Та сама пара, що в «назад»: видимий значок малий, ціль 44. І та сама причина
// міряти ВЛУЧАННЯМ — `::after` не входить у рамку вузла.
const цільЗняття = await p.evaluate(() => {
  const b = document.querySelector('.shub-unsave'); if (!b) return 0;
  const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const влучає = (dx, dy) => { const e = document.elementFromPoint(cx + dx, cy + dy);
    return !!(e && (e === b || b.contains(e) || e.closest?.('.shub-unsave') === b)); };
  let s = 0; for (let i = 12; i <= 26; i++) if (влучає(i - 0.6, 0) && влучає(0, i - 0.6)) s = i;
  return s * 2;
});
ok('📐 ціль зняття під палець ≥ 44px', цільЗняття >= 44, `${цільЗняття}px`);

// 🛑 КНОПКА В КНОПЦІ — ЗАБОРОНЕНА РОЗМІТКА, і браузери «лікують» її по-різному
// (аж до подвійного спрацювання тапу). Тому зняття лежить ПОРУЧ із карткою.
ok('🛑 кнопка зняття НЕ вкладена в кнопку картки',
   await p.evaluate(() => ![...document.querySelectorAll('.shub-unsave')]
     .some(b => b.closest('.shub-card'))));

const булоКарток = await карток();
await p.evaluate(() => document.querySelector('.shub-unsave')?.click());
await p.waitForTimeout(900);
ok('🔴 тап по зняттю прибирає рядок зі списку',
   (await карток()) === булоКарток - 1, `${булоКарток} → ${await карток()}`);
ok('лічильник у шапці оновився',
   await p.evaluate(() => document.querySelector('.shub-head-count')?.textContent.trim() === '1'),
   await p.evaluate(() => document.querySelector('.shub-head-count')?.textContent.trim() || '—'));

await p.evaluate(() => document.querySelector('[data-shub-back]')?.click());
await p.waitForTimeout(400);
ok('лічильник категорії теж оновився',
   /Оголошення\s*1/.test(await p.evaluate(() =>
     document.querySelector('[data-shub-cat="boards"]')?.textContent.replace(/\s+/g, ' ') || '')),
   await p.evaluate(() => document.querySelector('[data-shub-cat="boards"]')?.textContent.replace(/\s+/g,' ').trim() || '—'));

// 🗣️ Рішення Вови 05.09 на питання «показувати порожні категорії»: «Ні, не
// показуєм, там як зараз». Знімаємо останнє збереження і перевіряємо саме це.
await p.evaluate(() => document.querySelector('[data-shub-cat="boards"]')?.click());
await p.waitForTimeout(400);
await p.evaluate(() => document.querySelector('.shub-unsave')?.click());
await p.waitForTimeout(900);
await p.evaluate(() => document.querySelector('[data-shub-back]')?.click());
await p.waitForTimeout(400);
ok('🗣️ порожня категорія НЕ показується (рішення Вови)',
   await p.evaluate(() => !document.querySelector('[data-shub-cat="boards"]')));

// ── 6. 🔴 ТАП ВЕДЕ В САМ ЗАПИС, А НЕ В СПИСОК ─────────────────────────────
// Було: тап по збереженому оголошенню перемикав Дошку в режим «Збережені»,
// тобто відкривав ПЕРЕЛІК замість того запису, який людина торкнулась.
// 🔑 Перевірка дивиться на ФАКТ — чи видно на екрані повну картку саме цього
// оголошення. Якщо хтось поверне старий виклик, модалки не буде і рядок впаде.
await p.evaluate(() => document.querySelector('[data-shub-cat="chats"]')?.click());
await p.waitForTimeout(400);
const єПитання = await p.evaluate(() => !!document.querySelector('.shub-card'));
if (єПитання) {
  await p.evaluate(() => document.querySelector('.shub-card')?.click());
  await p.waitForTimeout(2000);
  // 🛑 05.09 — ПЕРША РЕДАКЦІЯ ЦЬОГО РЯДКА БУЛА БРЕХЛИВОЮ, і варто знати як саме.
  // Вона шукала екран за класами `.bd-chat-modal, [class*=chat-modal], .pm-screen`
  // і червоніла над СПРАВНИМ кодом: питання відкривається в `.qa-screen`, якого
  // в тому переліку не було. Тобто прилад «доводив» ваду, якої не існувало, і я
  // мало не пішов лагодити правильну функцію.
  // ⚠️ І другий бік тієї ж помилки: шукати ЗАГОЛОВОК питання на екрані теж не
  // можна — екран питання показує його ТЕКСТ, а картка хабу показує заголовок.
  // Тому міряємо: екран питання існує і несе текст саме цього запису.
  const наЕкрані = await p.evaluate(() =>
    (document.querySelector('.qa-screen')?.innerText || '').replace(/\s+/g, ' '));
  ok('🔴 тап по збереженому питанню відкриває САМЕ ЙОГО',
     наЕкрані.includes('Світло не горить третій тиждень'), наЕкрані.slice(0, 70) || 'екрана немає');
  ok('🛑 і аркуш хабу при цьому закрився',
     await p.evaluate(() => !document.querySelector('.shub-sheet')));
}

await b.close();
await stop();
done();
