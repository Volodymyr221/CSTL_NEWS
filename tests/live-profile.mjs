// Стенд №48: ЧУЖЕ ІМʼЯ І ФОТО ОНОВЛЮЮТЬСЯ БЕЗ ПЕРЕЗАПУСКУ ЗАСТОСУНКУ.
//
// 🔴 ЗАМОВЛЕННЯ ВОВИ (07.08, дослівно): «Зайшов з другого акаунту і змінив імʼя
// та встановив фото на профіль, але мені не оновило це відразу в додатку,
// приходиться закрити додаток повністю і зайти… хоча б коли вони перейшли на
// іншу вкладку і назад. Це питання треба комплексно закрити раз і назавжди».
//
// ЩО МІРЯЄМО — рівно обіцяний контракт, не більше й не менше:
//   «повернувся на вкладку → бачиш свіже».
// Сцена: у списку розмов видно співрозмовника. Поки застосунок ВІДКРИТИЙ, той
// співрозмовник міняє в себе імʼя і ставить фото. Ми йдемо на іншу вкладку і
// повертаємось. Нове імʼя і фото мусять бути на екрані.
//
// 🔑 ЧОМУ ЦЕЙ СТЕНД ВЗАГАЛІ СТАВ МОЖЛИВИЙ ЛИШЕ 07.08. До цього фікстура Дошки
// відповідала на БУДЬ-ЯКИЙ rpc `{ data: null }` — тобто `get_avatars` мовчки
// віддавав нічого, `_nameCache` не заповнювався, і стенд бачив лише вморожені
// імена. Увесь механізм живих імен і фото не був покритий нічим.
//
// 🔴 КОРІНЬ, ЯКИЙ ЦЕЙ СТЕНД СТЕРЕЖЕ (знайдено розвідкою потоку):
//   `_avatarCache` / `_nameCache` (`core/supabase.js`) — звичайні `Map`, які
//   НІКОЛИ не протухають: `fetchAvatars` бере лише ще невідомі uid. Плюс
//   `hydrateNames`/`hydrateAvatars` позначають вузол `data-*-done` і більше до
//   нього не повертаються. Разом це означає: дізнались імʼя один раз — тримаємо
//   його до кінця життя вкладки. Саме тому Вові й доводилось закривати додаток
//   ПОВНІСТЮ: інших способів очистити ці дві Map у коді не існує.
//
// ⚠️ Доступ до даних тут НІ ДО ЧОГО і міняти його не треба: `get_avatars`
// (SECURITY DEFINER, `scripts/supabase_avatars_public.sql`) уже віддає чуже імʼя
// і фото будь-кому. Стенд це теж перевіряє окремо — щоб наступна сесія не пішла
// «відкривати RLS», якої проблеми немає.
//
// ⚠️ `serviceWorkers: 'block'` — інакше запити йдуть через `sw.js` повз
// `page.route` (восьмий випадок брехливої перевірки в цьому проєкті).
// 🔴 КОНТРОЛЬ (обовʼязковий):
//     BUNDLE_REV=origin/main node tests/live-profile.mjs
// підсовує сторінці `bundle.js` із зазначеної ревізії. На коді ДО цього потоку
// дві 🔴-перевірки мусять УПАСТИ — інакше стенд міряє не те, що обіцяє.
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const REV = process.env.BUNDLE_REV || '';

const ME    = { id: 'u-me',    email: 'me@example.com', user_metadata: { name: 'Вова' } };
const OTHER = 'u-other';
const NOW = new Date().toISOString();

// Імʼя в самому треді — ВМОРОЖЕНЕ і навмисно застаріле: так і лежить у базі,
// бо `threads.author_name` пишеться один раз у момент створення розмови.
const THREADS = [{
  id: 't-1', post_id: 'p-1', author_uid: OTHER, buyer_uid: ME.id,
  author_name: 'Житель', buyer_name: 'Вова',
  last_message_at: NOW, last_message_text: 'Ще актуально?',
  post: { id: 'p-1', title: 'ВЕЛОСИПЕД', status: 'published' },
}];
const POSTS = [{
  id: 'p-1', type: 'board', category: 'sell', title: 'ВЕЛОСИПЕД ДОРОСЛИЙ',
  text: 'Робочий стан.', price: '2500', location: 'Олика', author: 'Житель',
  owner_uid: OTHER, contact: '', photos: [], status: 'published',
  published_at: NOW, created_at: NOW,
}];

// Профіль співрозмовника ДО зміни: імʼя вже інше за вморожене, фото немає.
const PROFILES = [
  { uid: OTHER, name: 'Петро Коваль', avatar_url: '' },
  { uid: ME.id, name: 'Вова', avatar_url: '' },
];

const ФОТО = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

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

// Відкрити список розмов (пункт FAB «Повідомлення»).
const відкритиСписок = async () => {
  await p.evaluate(() => document.getElementById('board-trigger')?.click());
  await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('#board-fab-menu [data-fab="messages"]')?.click());
  await p.waitForTimeout(1400);
};
const іменаУСписку = () => p.evaluate(() => {
  const row = document.querySelector('.pm-thread-name');
  const av  = document.querySelector('.pm-list [data-av-uid="u-other"], .pm-screen [data-av-uid="u-other"]');
  return { імʼя: row ? row.textContent.trim() : '', фото: !!av?.querySelector('img') };
});

// ── КОНТРОЛЬ ПЕРШОГО ПОРЯДКУ: живі імена взагалі працюють ───────────────────
// Якщо ця перевірка червона — далі міряти нічого: зламано не оновлення, а сам
// показ. Заразом це і є доказ, що доступ до чужого імені Є (RLS чіпати не треба):
// у самому треді лежить вморожене «Житель», а на екрані має бути імʼя з профілю.
await відкритиСписок();
const спершу = await іменаУСписку();
ok('доступ до чужого імені є: список показує профільне імʼя, а не вморожене',
   /Коваль/.test(спершу.імʼя) && !/Житель/.test(спершу.імʼя), спершу.імʼя || '(порожньо)');

// Закрили список — далі повторимо шлях цілком, як робить людина.
await p.evaluate(() => document.querySelector('.pm-screen--list [data-pm-back]')?.click());
await p.waitForTimeout(700);

// ── СЦЕНА: співрозмовник міняє імʼя і ставить фото, поки застосунок відкритий ─
await p.evaluate((ф) => {
  window.__cstlProfiles = [
    { uid: 'u-other', name: 'Петро Мельник', avatar_url: ф },
    { uid: 'u-me',    name: 'Вова',          avatar_url: '' },
  ];
}, ФОТО);

// ⏱ Витримати поріг антифлуду (MIN_GAP у `core/refresh-on-return.js`). Це не
// «підганяння під тест»: поріг існує навмисно, і сцена мусить його ПЕРЕЖИТИ, а не
// обійти. Якщо колись поріг піднімуть так, що звичайне «пішов і повернувся» в
// нього не влазить — саме тут стенд і почервоніє, і це буде правильно.
await p.waitForTimeout(5200);

// Пішли на іншу вкладку і повернулись — рівно той жест, який назвав Вова.
await p.evaluate(() => window.switchTab && window.switchTab('shotam'));
await p.waitForTimeout(800);
await p.evaluate(() => window.switchTab && window.switchTab('board'));
await p.waitForTimeout(1800);

await відкритиСписок();
const потім = await іменаУСписку();

ok('🔴 після повернення на вкладку видно НОВЕ імʼя співрозмовника',
   /Мельник/.test(потім.імʼя), потім.імʼя || '(порожньо)');
ok('🔴 після повернення на вкладку видно щойно поставлене ФОТО',
   потім.фото, потім.фото ? 'є <img>' : 'лишилась літера');

// ── ЩО НЕ МАЄ СТАТИСЬ: шквал запитів ────────────────────────────────────────
// «Оновлювати завжди і всюди» — не рішення, а інша поломка. Кожне повернення на
// вкладку не має бити в базу за профілями, якщо з минулого разу минуло кілька
// секунд. Міряємо кількість викликів RPC на трьох швидких перемиканнях поспіль.
//
// ⚠️ ЧЕСНО ПРО ЦЮ ПЕРЕВІРКУ: сама по собі вона зелена і на КОДІ БЕЗ ОНОВЛЕННЯ
// взагалі (нуль запитів — теж «не шквал»). Сенс вона має ЛИШЕ в парі з двома
// 🔴-перевірками вище: ті кажуть «свіже доїхало», ця — «не ціною шквалу».
// Читати їх окремо — той самий клас самообману, від якого в цьому проєкті вже
// брехали перевірки дев'ять разів.
const доПерем = await p.evaluate(() => window.__cstlRpcCalls || 0);
for (let i = 0; i < 3; i++) {
  await p.evaluate(() => window.switchTab && window.switchTab('shotam'));
  await p.waitForTimeout(150);
  await p.evaluate(() => window.switchTab && window.switchTab('board'));
  await p.waitForTimeout(150);
}
await p.waitForTimeout(500);
const післяПерем = await p.evaluate(() => window.__cstlRpcCalls || 0);
ok('антифлуд: три швидкі перемикання не дають трьох походів у базу',
   (післяПерем - доПерем) <= 1, `викликів get_avatars: ${післяПерем - доПерем}`);

await ctx.close(); await b.close(); await stop();
done();
