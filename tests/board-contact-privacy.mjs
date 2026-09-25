// Стенд: ТЕЛЕФОН ЖИТЕЛЯ НЕ ЇДЕ В ЗАГАЛЬНІЙ ВИБІРЦІ ДОШКИ.
//
// 🔴 ЩО САМЕ СТЕРЕЖЕ, І ЧОМУ ЦЕ ЗАВЕДЕНО (25.09.2026).
// Заміряно 24.09 на живій базі від ролі `anon`:
//     set role anon; select count(*), count(contact) from posts;  →  12 і 6
// Тобто шість телефонів жителів качав будь-хто, кому вистачило публічного
// ключа з `bundle.js`, — не відкриваючи жодного оголошення, одним запитом.
// Половина лікування вже стояла в коді з 09.08 (RPC `get_post_contact` із
// рейт-лімітом і кнопка «Показати номер»), але саму колонку ніхто не закрив:
// номер однаково приїжджав у списку, і кнопка просто не вмикалась.
//
// Лікує пара міграцій: `0001a` заводить вітрину `posts_public` (ті самі рядки
// без колонки `contact`, натомість булеве `has_contact`), `0001b` закриває
// читання самої таблиці для стороннього.
//
// ЩО МІРЯЄ — НАСЛІДОК, А НЕ НАЯВНІСТЬ КОДУ:
//   1. клієнт питає ВІТРИНУ, а саму таблицю `posts` для списку не питає;
//   2. телефону немає в тому, що прийшло від бази (жоден рядок не має `contact`);
//   3. телефону немає в РОЗМІТЦІ — ні в списку, ні у відкритій картці;
//   4. на оголошенні З номером кнопка «Показати номер» Є (інакше ми просто
//      сховали б номер від людини, якій він потрібен, і це не перемога);
//   5. ЗУСТРІЧНА МЕЖА: на оголошенні БЕЗ номера кнопки НЕМАЄ — інакше тап по
//      ній закінчувався б порожнечею.
//
// 🛑 КОНТРОЛЬ НА САМ ПРИЛАД стоїть ПЕРШИМ і він обовʼязковий: фікстура мусить
// СПРАВДІ містити телефон. Без цієї перевірки «телефону ніде немає» доводило б
// лише те, що стенд забув його покласти, — і сторож зеленів би над відкритою
// дірою. Рівно та хвороба, яку цей проєкт ловив уже двадцять разів.
//
// 🔴 КОНТРОЛЬ НА КОД: `BUNDLE_REV=origin/main node tests/board-contact-privacy.mjs`
// на ревізії до 25.09 дає **9/13** — червоніють рівно чотири: обидві перевірки
// «куди ходив клієнт», телефон у відкритій картці і відсутня кнопка «Показати
// номер» (там замість неї одразу «Подзвонити» з живим номером).
//
// ⚠️ І ОДРАЗУ ПРО МЕЖУ, ЯКУ ПОКАЗАВ САМЕ ЦЕЙ КОНТРОЛЬ: перевірка «телефону
// немає в розмітці СПИСКУ» зелена і на СТАРОМУ бандлі — картка списку номера
// ніколи й не друкувала. Тобто сама по собі вона не доводить нічого: витік був
// не в розмітці, а в ТОМУ, ЩО ПРИЇХАЛО. Вона лишається як зустрічна межа
// (щоб майбутня правка не почала друкувати номер у списку), але вагу несуть
// перевірки запитів і розкрою вітрини. Не переписуй стенд «коротше», лишивши
// саму лише розмітку, — вийде сторож, який стереже порожнечу.
//
// ⚠️ `serviceWorkers: 'block'` — інакше запити йдуть через `sw.js` повз `page.route`.
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const REV = process.env.BUNDLE_REV || '';

const NOW = new Date().toISOString();
const ТЕЛЕФОН = '+380501112233';
const P = (id, title, contact) => ({
  id, type: 'board', category: 'продам', location: 'Олика', title,
  text: 'опис оголошення', price: '100', currency: 'UAH', author: 'Сусід',
  owner_uid: 'u-other', contact, photos: [], status: 'published',
  published_at: NOW, created_at: NOW, bumped_at: NOW,
});

const З_НОМЕРОМ = P('ad-tel', 'ПРОДАМ ВЕЛОСИПЕД', ТЕЛЕФОН);
const БЕЗ_НОМЕРА = P('ad-none', 'ПРОДАМ ДРОВА', '');
const POSTS = [З_НОМЕРОМ, БЕЗ_НОМЕРА];

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  serviceWorkers: 'block',
});
const p = await ctx.newPage();

await mockSupabase(p, { posts: POSTS, threads: [], messages: [], announcements: [] });
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
await p.waitForTimeout(1200);

// ── 0. КОНТРОЛЬ НА ПРИЛАД ───────────────────────────────────────────────────
// Якщо телефона немає в самій фікстурі, решта стенда доводить порожнечу.
ok('🛑 КОНТРОЛЬ: у фікстурі СПРАВДІ лежить телефон',
   POSTS.some(r => r.contact === ТЕЛЕФОН), ТЕЛЕФОН);

const карток = await p.evaluate(() =>
  document.querySelectorAll('#board-content [data-post-id]').length);
ok('сцена: Дошка побудувалась із двох оголошень', карток === 2, карток);

// ── 1. КУДИ САМЕ ХОДИВ КЛІЄНТ ───────────────────────────────────────────────
const запити = await p.evaluate(() => ({ ...(window.__cstlQueries || {}) }));
ok('🔴 клієнт питав ВІТРИНУ posts_public', (запити.posts_public || 0) > 0,
   'posts_public: ' + (запити.posts_public || 0));
ok('🔴 саму таблицю posts для списку НЕ питав', !(запити.posts > 0),
   'posts: ' + (запити.posts || 0));

// ── 2. ЩО САМЕ ПРИЇХАЛО ВІД БАЗИ ────────────────────────────────────────────
// Міряємо не розмітку, а дані: номер міг би приїхати й лежати невидимим у
// памʼяті — для того, хто відкрив devtools, це той самий витік.
// Головна перевірка даних — через саму заглушку: вона віддає рівно те, що
// віддав би PostgREST, тож достатньо спитати, чи є `contact` у розкрої вітрини.
const розкрій = await p.evaluate(async () => {
  const c = window.supabase.createClient('http://stand', 'k');
  const { data } = await c.from('posts_public').select('*');
  const r = (data || [])[0] || {};
  return { поля: Object.keys(r), has_contact: r.has_contact };
});
ok('🔴 у вітрині НЕМАЄ колонки contact',
   !розкрій.поля.includes('contact'), розкрій.поля.length + ' полів');
ok('🔴 натомість є has_contact («є що просити»)',
   розкрій.поля.includes('has_contact'), 'has_contact=' + розкрій.has_contact);

// ── 3. ЧОГО НЕ ВИДНО НА ЕКРАНІ ──────────────────────────────────────────────
const цифри = ТЕЛЕФОН.replace(/[^\d]/g, '');
const єНаЕкрані = async () => p.evaluate(d => {
  const t = document.body.innerHTML.replace(/[^\d]/g, '');
  return t.includes(d);
}, цифри);
ok('🔴 телефону немає в розмітці СПИСКУ', !(await єНаЕкрані()));

const відкрити = async id => {
  const hit = await p.evaluate(pid => {
    const el = document.querySelector(`#board-content [data-post-id="${pid}"]`);
    if (!el) return false;
    el.scrollIntoView({ block: 'center' }); el.click(); return true;
  }, id);
  await p.waitForTimeout(800);
  return hit;
};
const закрити = async () => {
  await p.goBack().catch(() => {});
  await p.waitForTimeout(600);
};

ok('сцена: оголошення з номером відкрилось', await відкрити('ad-tel'));
ok('🔴 телефону немає і у ВІДКРИТІЙ картці', !(await єНаЕкрані()));

// ── 4. І ПРИ ЦЬОМУ НОМЕР НЕ ЗНИК ДЛЯ ЛЮДИНИ ─────────────────────────────────
const кнопкаЄ = await p.evaluate(() => {
  const el = document.querySelector('[data-show-phone]');
  return el ? el.textContent.trim() : '';
});
ok('🔴 кнопка «Показати номер» Є на оголошенні з телефоном',
   /Показати номер/.test(кнопкаЄ), кнопкаЄ || '—');
await закрити();

// ── 5. ЗУСТРІЧНА МЕЖА ───────────────────────────────────────────────────────
ok('сцена: оголошення без номера відкрилось', await відкрити('ad-none'));
const кнопкаБезНомера = await p.evaluate(() => !!document.querySelector('[data-show-phone]'));
ok('🛑 на оголошенні БЕЗ телефону кнопки НЕМАЄ (тап не веде в порожнечу)',
   !кнопкаБезНомера);

const помилки = [];
p.on('pageerror', e => помилки.push(e.message));
ok('жодної помилки в застосунку', помилки.length === 0, помилки[0] || '—');

await stop(); await b.close();
done();
