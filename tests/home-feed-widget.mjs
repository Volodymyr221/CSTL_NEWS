// Стенд: ВІДЖЕТ СТРІЧКИ НА ГРОМАДІ («У стрічці громади», секція `#hm-feed`).
//
// 🔴 НАВІЩО ВІН ЗАВЕДЕНИЙ (25.08.2026). Блок жив із 04.08 і НЕ БУВ ПОКРИТИЙ
// ЖОДНИМ стендом — `grep hm-fd-` по всій теці tests/ давав нуль. Тобто його
// можна було зламати мовчки, і жодна перевірка б не почервоніла. Заводиться
// разом із перебудовою блока, а не після неї.
//
// 🔑 ЩО САМЕ ВІН СТЕРЕЖЕ — ПОРЯДОК СПІЛЬНОТ ЗА СВІЖІСТЮ.
// Замовлення Вови: «аранжування цих спільнот має відбуватися по тому, хто який
// пост закинув останній». Тому сцена навмисно зроблена так, щоб `sort_order` у
// базі СУПЕРЕЧИВ свіжості: якщо віджет вишикує спільноти за старим полем, це
// впаде тут, а не на телефоні.
//
// 🔴 І ГОЛОВНА ДІРКА, ЯКУ ЦЕЙ СТЕНД ЗАКРИВАЄ. До 25.08 віджет брав
// `fetchPagePosts(null, 12)` — 12 найсвіжіших дописів УСІЄЇ стрічки. У сцені
// нижче одна спільнота («Olyka Castle») написала 12 разів поспіль, тобто в ту
// вибірку не потрапляв більше НІХТО. На живих даних це виглядало б як
// «віджет показує одну спільноту й завис».
import { chromium } from 'playwright';
import { chromiumPath, serve } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const хв = n => new Date(Date.now() - n * 60000).toISOString();

// ── СЦЕНА ────────────────────────────────────────────────────────────────────
// `sort_order` навмисно НЕ збігається з порядком за свіжістю (див. шапку).
const PAGES = [
  { id: 1, name: 'Туристичний центр',   sort_order: 0, avatar_url: null, is_system: false },
  { id: 2, name: 'Молодіжна рада',      sort_order: 1, avatar_url: null, is_system: false },
  { id: 3, name: 'Олицька міська рада', sort_order: 2, avatar_url: null, is_system: false },
  { id: 4, name: 'Olyka Castle',        sort_order: 3, avatar_url: null, is_system: false },
  { id: 5, name: 'КЦ «Центр»',          sort_order: 4, avatar_url: null, is_system: false },
  // 🔑 Спільнота БЕЗ жодного допису. У віджет входити НЕ має: впорядкування за
  // свіжістю не має для неї ключа, і будь-яке її місце в ряду було б довільним.
  { id: 6, name: 'Порожня спільнота',   sort_order: 5, avatar_url: null, is_system: false },
];

const ПОСТ = (id, page_id, text, коли) => ({
  id, page_id, text, created_at: коли, status: 'published',
  image_url: null, image_urls: [], author_uid: 'u1', show_author: true,
  pages: { name: (PAGES.find(p => p.id === page_id) || {}).name, avatar_url: null },
});

const POSTS = [
  // Olyka Castle — ДВАНАДЦЯТЬ дописів поспіль, усі найсвіжіші.
  ...Array.from({ length: 12 }, (_, i) => ПОСТ(100 + i, 4, `Допис Olyka Castle №${12 - i}`, хв(1 + i))),
  // Решта — по одному, старіші, у порядку, що суперечить `sort_order`.
  ПОСТ(200, 3, 'Оголошення Олицької міської ради', хв(60)),
  ПОСТ(201, 2, 'Молодіжна рада запрошує',          хв(180)),
  ПОСТ(202, 5, 'Афіша культурного центру',         хв(600)),
  ПОСТ(203, 1, 'Туристичний центр про екскурсії',  хв(2000)),
];

// Очікуваний порядок ряду — рівно за свіжістю останнього допису кожної.
const ОЧІКУЮ = ['Olyka Castle', 'Олицька міська рада', 'Молодіжна рада', 'КЦ «Центр»', 'Туристичний центр'];

const { url, stop } = await serve();
const ep = chromiumPath();
const b = await chromium.launch({ ...(ep ? { executablePath: ep } : {}) });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('pageerror: ' + e.message));

await mockSupabase(p, { pages: PAGES, page_posts: POSTS });
// Погода і геокодер — швидкі заглушки: без них сторінка чекає фолбеку 4с, і
// стенд платив би за це на кожному прогоні.
await p.route('**://nominatim.openstreetmap.org/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ address: { village: 'Олика' } }) }));
await p.route('**://api.open-meteo.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({
  utc_offset_seconds: 10800, current: { temperature_2m: 18, weather_code: 3, apparent_temperature: 17 },
  hourly: { time: [], temperature_2m: [], precipitation_probability: [], weather_code: [] },
  daily: { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [] } }) }));

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);
await p.evaluate(() => document.querySelector('.consent-ok, [data-consent-ok], .pwa-cta button')?.click());
await p.evaluate(() => window.switchTab && window.switchTab('community'));
await p.waitForTimeout(3000);

const R = []; const ok = (n, c, i = '') => { R.push(!!c); console.log(`${c ? '✅' : '❌'} ${n}${i ? '  — ' + i : ''}`); };

const зріз = await p.evaluate(() => {
  const sec = document.getElementById('hm-feed');
  const кола = [...document.querySelectorAll('.hm-fd-c')];
  return {
    видима: !!sec && !sec.hidden,
    імена: кола.map(c => (c.querySelector('.hm-fd-c-name')?.textContent || '').trim()),
    зКільцем: кола.filter(c => c.classList.contains('hm-fd-c--new')).map(c => (c.querySelector('.hm-fd-c-name')?.textContent || '').trim()),
    авторКартки: (document.querySelector('.hm-fd-p-name')?.textContent || '').trim(),
    текстКартки: (document.querySelector('.hm-fd-p-txt')?.textContent || '').trim(),
  };
});

ok('секція віджета видима', зріз.видима);

// 🔴 ГОЛОВНЕ: одна активна спільнота більше НЕ витісняє решту.
ok('🔴 у ряду більше однієї спільноти (12 дописів однієї не з\'їдають вибірку)',
   зріз.імена.length > 1, `${зріз.імена.length} шт.`);

ok('порядок спільнот — за свіжістю останнього допису, а не за sort_order',
   зріз.імена.join(' | ') === ОЧІКУЮ.join(' | '), зріз.імена.join(' | '));

ok('спільнота без жодного допису у віджет не входить',
   !зріз.імена.includes('Порожня спільнота'), зріз.імена.join(' | '));

ok('спільнот у ряду рівно стільки, скільки має дописи (5)',
   зріз.імена.length === 5, String(зріз.імена.length));

// 🔴 РЯД І КАРТКА НЕ РОЗХОДЯТЬСЯ. Міряємо проти ФАКТИЧНО першого кружечка, а не
// проти очікуваного списку — інакше перевірка називалась би одним, а міряла інше.
// 🔬 Знайдено контрольним прогоном 25.08: на старому коді ряд починався з
// «Молодіжна рада», картка показувала Olyka Castle — тобто розсинхрон БУВ, а
// перевірка (написана проти ОЧІКУЮ[0]) його не бачила і зеленіла.
ok('🔴 картка показує допис ПЕРШОЇ спільноти в ряду (ряд і картка — одне джерело)',
   !!зріз.авторКартки && зріз.авторКартки === зріз.імена[0],
   `ряд: ${зріз.імена[0]} · картка: ${зріз.авторКартки}`);
ok('у картці саме ОСТАННІЙ допис цієї спільноти',
   зріз.текстКартки.includes('№12'), зріз.текстКартки.slice(0, 40));

// Кільце «є нове за добу» лишається тим, чим було: порядок його не замінює.
// Туристичний центр писав 2000 хв тому (>24 год) — кільця в нього бути не може.
ok('кільце «є нове» не з\'явилось у спільноти зі старим дописом',
   !зріз.зКільцем.includes('Туристичний центр'), зріз.зКільцем.join(' | ') || '—');
ok('кільце «є нове» є в тих, хто писав за останню добу',
   зріз.зКільцем.includes('Olyka Castle') && зріз.зКільцем.includes('Олицька міська рада'),
   зріз.зКільцем.join(' | ') || '—');

ok('жодної помилки в консолі', errs.length === 0, errs.join(' · ').slice(0, 160) || '—');

await b.close(); await stop();
const пройшло = R.filter(Boolean).length;
console.log(`\n${пройшло === R.length ? '✅' : '❌'} ${пройшло}/${R.length} перевірок пройдено`);
process.exit(пройшло === R.length ? 0 : 1);
