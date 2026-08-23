// Стенд №56: ОФІЦІЙНА ГАЛОЧКА ВИДНА ВСЮДИ, ДЕ ПИШЕ ІМʼЯ.
//
// 🔴 ЗАМОВЛЕННЯ ВОВИ (09.08, дослівно): *«якщо вона є, вона має відображатися
// ВСЮДИ де пише ім'я користувача, тобто не тільки в карточці… бо хтось може
// зареєструватися під таким іменем, а користувачі можуть просто прочитати, але
// не тапнути і не відкрити картку жителя, розумієш?»*
//
// 🔑 ЩО САМЕ ЦЕ ЗМІНЮЄ В ПОСТАНОВЦІ. Перша редакція малювала галочку в картці
// профілю і в авторі оголошення — тобто там, куди треба ЗАЙТИ. А підробку
// помічають не там: людина читає СПИСОК розмов і шапку чату, нікуди не тапаючи.
// Галочка, яку видно лише після тапу, не захищає від того, заради чого заведена.
//
// ЩО МІРЯЄМО — наявність знака поруч із конкретним іменем на конкретних екранах,
// а не «чи є в коді функція». Плюс контроль: у звичайного жителя знака нема.
//
// 🔑 ЧОМУ ЦЕ ВЗАГАЛІ ОДИН СТЕНД, А НЕ ПʼЯТЬ. Галочка їде тим самим шляхом, що
// живе імʼя: вузол несе `data-name-uid`, а `hydrateNames` ставить знак. Тобто
// перевіряємо не кожен екран окремо, а те, що механізм працює на двох різних
// поверхнях — цього досить, щоб решта отримала знак задарма.
//
// ⚠️ `serviceWorkers: 'block'` — інакше запити йдуть повз `page.route`
// (восьмий випадок брехливої перевірки в цьому проєкті).
// 🔴 КОНТРОЛЬ: BUNDLE_REV=origin/main node tests/official-badge.mjs
// На коді до цього потоку 🔴-перевірки мусять УПАСТИ.
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const REV = process.env.BUNDLE_REV || '';

const ME       = { id: 'u-me', email: 'me@example.com', user_metadata: { name: 'Вова' } };
const ОФІЦІЙНИЙ = 'u-holova';    // голова ради — саме випадок, який назвав Вова
const ЗВИЧАЙНИЙ = 'u-susid';     // контроль: пересічний житель
const NOW = new Date().toISOString();

const THREADS = [
  { id: 't-1', post_id: 'p-1', author_uid: ОФІЦІЙНИЙ, buyer_uid: ME.id,
    author_name: 'Житель', buyer_name: 'Вова',
    last_message_at: NOW, last_message_text: 'Добрий день',
    post: { id: 'p-1', title: 'ОГОЛОШЕННЯ', status: 'published' } },
  { id: 't-2', post_id: 'p-1', author_uid: ЗВИЧАЙНИЙ, buyer_uid: ME.id,
    author_name: 'Житель', buyer_name: 'Вова',
    last_message_at: NOW, last_message_text: 'Привіт',
    post: { id: 'p-1', title: 'ОГОЛОШЕННЯ', status: 'published' } },
];
const POSTS = [{
  id: 'p-1', type: 'board', category: 'sell', title: 'ВЕЛОСИПЕД',
  text: 'Робочий стан.', price: '2500', location: 'Олика', author: 'Житель',
  owner_uid: ОФІЦІЙНИЙ, contact: '', photos: [], status: 'published',
  published_at: NOW, created_at: NOW,
}];
// 🔑 `official` приїжджає тим самим рядком, що імʼя і фото — саме так його
// віддає `get_avatars` після міграції `scripts/supabase_official_badge.sql`.
const PROFILES = [
  { uid: ОФІЦІЙНИЙ, name: 'Олександр Прендецький', avatar_url: '', official: true },
  { uid: ЗВИЧАЙНИЙ, name: 'Петро Коваль',          avatar_url: '', official: false },
  { uid: ME.id,     name: 'Вова',                  avatar_url: '', official: false },
];

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  serviceWorkers: 'block',
});
const p = await ctx.newPage();

await mockSupabase(p,
  { posts: POSTS, threads: THREADS, messages: [], thread_user_state: [], announcements: [] },
  { user: ME, profiles: PROFILES });
await p.route('**://api.open-meteo.com/**', r => r.abort());
if (REV) {
  const body = projectFile('bundle.js', REV);
  await p.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body }));
}

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(200);
await p.evaluate(() => window.switchTab && window.switchTab('board'));
await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('.brules-ok')?.click());
await p.waitForTimeout(1500);

// Знак шукаємо СУСІДОМ вузла імені — саме так його ставить `markOfficial`,
// і саме так він переживає оновлення живого імені через `textContent`.
const знакПоруч = (uid) => p.evaluate((u) => {
  const el = document.querySelector(`[data-name-uid="${u}"]`);
  if (!el) return { є: false, знайдено: false, імʼя: '' };
  const next = el.nextElementSibling;
  return {
    знайдено: true,
    імʼя: el.textContent.trim(),
    є: !!(next && next.classList && next.classList.contains('cstl-verified')),
    // Скільки знаків поспіль — ловить подвійне малювання (два різні шляхи).
    скільки: [...el.parentElement.querySelectorAll('.cstl-verified')].length,
  };
}, uid);

await p.evaluate(() => document.getElementById('board-trigger')?.click());
await p.waitForTimeout(300);
await p.evaluate(() => document.querySelector('#board-fab-menu [data-fab="messages"]')?.click());
await p.waitForTimeout(1600);

// ── 1. СПИСОК РОЗМОВ — головне місце з замовлення Вови ──────────────────────
// Саме тут людина читає імена, нікуди не заходячи.
const оф = await знакПоруч(ОФІЦІЙНИЙ);
ok('Список розмов: імʼя офіційного взагалі показане', оф.знайдено && /Прендецький/.test(оф.імʼя),
   оф.імʼя || '(вузла немає)');
ok('🔴 Список розмов: у офіційного Є галочка', оф.є);
ok('🔴 Галочка не подвоєна', оф.скільки === 1, `знаків: ${оф.скільки}`);

// ── 2. КОНТРОЛЬ — у звичайного жителя знака нема ────────────────────────────
// Без цієї перевірки «галочка всюди» могло б означати «галочка у всіх».
const зв = await знакПоруч(ЗВИЧАЙНИЙ);
ok('Контроль: імʼя звичайного жителя показане', зв.знайдено && /Коваль/.test(зв.імʼя),
   зв.імʼя || '(вузла немає)');
ok('🔴 Контроль: у звичайного жителя галочки НЕМА', !зв.є);

// ── 3. ШАПКА ЧАТУ — друга поверхня, той самий механізм ──────────────────────
// Тапаємо саме той рядок, у якому стоїть імʼя офіційної людини — інакше
// відкрилась би випадкова розмова і перевірка міряла б не те, що обіцяє.
// ⚠️ 23.08 — селектор став НАЩАДКОМ (пробіл), а не тим самим вузлом. Маркер
// `data-name-uid` переїхав усередину гнізда імені (`nameSlot`), і саме гніздо
// тримає розмір та вирівнювання знака. Механізм «знак — сусід вузла імені»
// не змінився: сусідом він тепер стоїть усередині гнізда.
await p.evaluate((u) => {
  const nameEl = document.querySelector(`.pm-thread-name [data-name-uid="${u}"]`);
  nameEl?.closest('.pm-thread')?.click();
}, ОФІЦІЙНИЙ);
await p.waitForTimeout(1400);
const шапка = await p.evaluate(() => {
  const el = document.querySelector('.pm-head-name [data-name-uid]');
  if (!el) return { знайдено: false, є: false, імʼя: '' };
  const next = el.nextElementSibling;
  return { знайдено: true, імʼя: el.textContent.trim(),
           є: !!(next && next.classList && next.classList.contains('cstl-verified')) };
});
ok('Шапка чату: імʼя співрозмовника показане', шапка.знайдено, шапка.імʼя || '(вузла немає)');
// ⚠️ М'яка умова: у чат могла відкритись будь-яка з двох розмов (порядок рядків
// залежить від часу). Перевіряємо узгодженість: галочка є ТОДІ І ЛИШЕ ТОДІ, коли
// це офіційна людина. Так перевірка міряє правило, а не випадковий порядок.
ok('🔴 Шапка чату: галочка збігається з тим, чий це профіль',
   шапка.знайдено && (шапка.є === /Прендецький/.test(шапка.імʼя)),
   `імʼя=${шапка.імʼя} знак=${шапка.є}`);

await b.close();
await stop();
done();
