// tests/tap-targets-hig.mjs — ЗОНИ ДОТИКУ 44×44 НА ГОЛОВНИХ ЕКРАНАХ (04.09.2026).
//
// 🔴 ЧОМУ ЦЕ ОКРЕМИЙ ФАЙЛ, А НЕ ДОПИС У `tests/tap-targets.mjs`. Сусідній сторож
// (09.08) міряє те саме `elementFromPoint`, але на ІНШИХ елементах і з ІНШОЮ
// домовленою ціллю: крапки тижня Автобусів стоять із кроком 11px, і 44×44 там
// НЕДОСЯЖНІ в принципі — зони перекрили б сусідні крапки, а «спрацювало не те»
// гірше за «важко попасти». Той файл це чесно й називає. Тут же сім елементів,
// у яких місце ПРИНЦИПОВО є, тож ціль — повні 44. Два різні критерії в одному
// файлі читались би як суперечність; тому файли два, і кожен посилається на
// інший. ⚠️ Спільне правило одне: зона не сміє красти дотик у сусіда.
//
// 🗣️ Замовлення Вови: «зробити не "дитячий" вигляд, а преміальний… навіть по
// дрібницях». Дизайн-аудит 03.09 заміряв **475 елементів дрібніших за 44×44**,
// тобто нижче норми Apple HIG. Це крок 5 черги («роби все крім 4»).
//
// 🔴 ЧОМУ ЦЕ НЕ «ЗРОБИТИ КНОПКИ БІЛЬШИМИ». Вигляд лишається як був — росте лише
// НЕВИДИМА зона влучання. Тому перевіряти розмір коробки елемента безглуздо: вона
// й мусить лишитись 28px. Питання одне: чи ловить кнопка палець за 22px від свого
// центру.
//
// 🔑 МІРЯЄМО `elementFromPoint`, А НЕ CSS. `padding` можна написати бездоганно і
// не отримати нічого: батько з `overflow: hidden` обріже розширення, сусід із
// вищим z-index перехопить дотик, а `pointer-events` зніме зону зовсім. Усі три
// випадки читанням стилів не видно — вони народжуються у СКЛАДАННІ.
//
// 🛑 І ЗУСТРІЧНА ПЕРЕВІРКА, БЕЗ ЯКОЇ ЦЕЙ СТОРОЖ БУВ БИ ШКІДЛИВИЙ: розширена зона
// не сміє КРАСТИ дотики в сусідів. Збільшити зону легко — і так само легко
// накрити нею сусідню кнопку, а це гірше за дрібну ціль: людина влучає, і
// спрацьовує не те. Тому кожен сусід окремо перевіряється на власний центр.
//
// Контроль: CSS_REV=origin/main node tests/tap-targets-hig.mjs

import { chromium } from 'playwright';
import { readdirSync } from 'fs';
import { join } from 'path';
import { launch, serve, ROOT, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const REV = process.env.CSS_REV || '';
const { ok, done } = reporter();
const fail = (name, info) => ok(name, false, info);
const files = readdirSync(join(ROOT, 'style')).filter(f => f.endsWith('.css'));
const readAll = rev => files.map(f => {
  try { return projectFile('style/' + f, rev); } catch (_) { return ''; }
}).join('\n');

const HIG = 44;                       // Apple HIG: мінімальна ціль 44×44 pt
const NOW = Date.now(), iso = ms => new Date(ms).toISOString();
const ME = { id: 'u-me', email: 'me@example.com', user_metadata: { name: 'Володимир' } };

const POSTS = [
  { id: 901, type: 'board', category: 'продам', title: 'Велосипед дорослий, 28"', price: 2500,
    text: 'Робочий стан, гальма нові.', photos: [], location: 'Олика', author: 'Петро', owner_uid: 'u-p',
    status: 'published', ts: NOW - 3600e3, created_at: iso(NOW - 3600e3), published_at: iso(NOW - 3600e3) },
];
// ⚠️ Форму рядка беремо з `tests/tools/design-audit-shots.mjs` — там вона вже
// доведена живою сценою. Головне, що легко забути: `status: 'published'` і
// вкладений `pages` (назва й аватар спільноти), без якого картка не малюється.
const PAGES = [
  { id: 2, name: 'Olyka Castle', sort_order: 1, avatar_url: null, banner_url: null,
    is_system: false, description: 'Чим цікава Олика сьогодні', slug: 'castle' },
];
const PAGE_POSTS = [
  { id: 5001, page_id: 2, text: 'Сьогодні в Олиці відкрили нову зупинку біля школи.',
    created_at: iso(NOW - 7200e3), status: 'published', image_url: null, image_urls: [],
    author_uid: 'u-me', show_author: true, pinned_at: null,
    pages: { name: 'Olyka Castle', avatar_url: null } },
];

// Погода — свій відгук, інакше загальний глушник ріже Open-Meteo і кнопка
// розгортання просто не зʼявляється (віджет малює стан «недоступно»).
const H = 48;
const WEATHER = {
  current: { temperature_2m: 21.4, weather_code: 2, wind_speed_10m: 12,
             relative_humidity_2m: 58, apparent_temperature: 21 },
  hourly: {
    time: Array.from({ length: H }, (_, i) => iso(Math.floor(NOW / 3600e3) * 3600e3 + i * 3600e3).slice(0, 16)),
    temperature_2m: Array.from({ length: H }, () => 20),
    apparent_temperature: Array.from({ length: H }, () => 19),
    precipitation_probability: Array.from({ length: H }, () => 10),
    relative_humidity_2m: Array.from({ length: H }, () => 60),
    weather_code: Array.from({ length: H }, () => 1),
    wind_speed_10m: Array.from({ length: H }, () => 11),
    wind_direction_10m: Array.from({ length: H }, () => 240),
  },
  daily: {
    time: Array.from({ length: 7 }, (_, i) => iso(NOW + i * 864e5).slice(0, 10)),
    temperature_2m_max: Array.from({ length: 7 }, () => 23),
    temperature_2m_min: Array.from({ length: 7 }, () => 13),
    weather_code: Array.from({ length: 7 }, () => 2),
    precipitation_probability_max: Array.from({ length: 7 }, () => 20),
    sunrise: Array.from({ length: 7 }, (_, i) => iso(NOW + i * 864e5).slice(0, 11) + '06:20'),
    sunset: Array.from({ length: 7 }, (_, i) => iso(NOW + i * 864e5).slice(0, 11) + '19:40'),
  },
};

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  serviceWorkers: 'block', locale: 'uk-UA' });
const p = await ctx.newPage();
await mockSupabase(p, { posts: POSTS, comments: [], announcements: [], pages: PAGES,
  page_posts: PAGE_POSTS, page_comments: [], page_reactions: [], threads: [], messages: [],
  thread_user_state: [] }, { user: ME, profiles: [] });
// ⚠️ ПОРЯДОК ПЕРЕХОПЛЮВАЧІВ: Playwright питає їх ВІД ОСТАННЬОГО до першого, тож
// загальний «глушити все чуже» мусить стояти ПЕРШИМ, а точковий — після нього.
// Поставиш навпаки — глушник зʼїсть погоду, і кнопки розгортання не буде.
await p.route(/^https?:\/\/(?!127\.0\.0\.1)[^/]+\//, r => r.abort());
await p.route('**://api.open-meteo.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(WEATHER) }));
await p.goto(url, { waitUntil: 'domcontentloaded' });
// 🔴 Контроль мусить УМІТИ ВПАСТИ: при CSS_REV свіжі стилі вимикаються повністю,
// інакше нові правила лишились би чинними і сторож зеленів би на старому коді.
if (REV) {
  await p.evaluate(() => document.querySelectorAll('link[rel=stylesheet]').forEach(l => l.disabled = true));
  await p.addStyleTag({ content: readAll(REV) });
}
await p.waitForTimeout(2200);
await p.evaluate(() => { document.getElementById('splash')?.remove(); document.querySelector('.consent-accept')?.click(); });
await p.waitForTimeout(400);

// ── ПРИЛАД ───────────────────────────────────────────────────────────────────
// Пʼять точок квадрата HIG навколо ЦЕНТРА елемента: чотири кути (з відступом 1px,
// бо рівно на межі округлення дає то той, то той бік) і сам центр. Влучанням
// вважається сам елемент або будь-який його нащадок — палець по іконці всередині
// кнопки це влучання по кнопці.
const probe = (sel, side) => {
  const el = document.querySelector(sel);
  if (!el) return { є: false };
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return { є: false };
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2, h = side / 2 - 1;
  const pts = [[cx, cy], [cx - h, cy - h], [cx + h, cy - h], [cx - h, cy + h], [cx + h, cy + h]];
  let влучань = 0, поза = 0;
  for (const [x, y] of pts) {
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) { поза++; continue; }
    const hit = document.elementFromPoint(x, y);
    if (hit && (hit === el || el.contains(hit))) влучань++;
  }
  return { є: true, влучань, поза, всього: pts.length,
           коробка: `${Math.round(r.width)}×${Math.round(r.height)}` };
};

const goTab = async t => {
  await p.evaluate(x => window.switchTab && window.switchTab(x), t);
  await p.waitForTimeout(1100);
  if (t === 'board') { await p.evaluate(() => document.querySelector('.brules-ok')?.click()); await p.waitForTimeout(500); }
};

// Селектори з таблиці аудиту 1.6 — найчастіші порушники.
const ЦІЛІ = [
  { sel: '#saved-hub-btn',  вкладка: 'community', що: 'закладка в шапці' },
  { sel: '#sidebar-toggle', вкладка: 'community', що: 'бургер' },
  { sel: '.hm-wx-toggle',   вкладка: 'community', що: 'розгортання погоди' },
  { sel: '#board-content .bd-bookmark', вкладка: 'board', що: 'закладка на картці Дошки' },
  { sel: '.fd-like',        вкладка: 'shotam',    що: 'лайк допису' },
  { sel: '.fd-cbtn',        вкладка: 'shotam',    що: 'коментарі допису' },
  { sel: '.fd-share',       вкладка: 'shotam',    що: 'поділитись' },
];

let знайдено = 0;
for (const ц of ЦІЛІ) {
  await goTab(ц.вкладка);
  // Прилад їде в браузер текстом — там немає жодного нашого модуля.
  const r = await p.evaluate(({ s, h, src }) =>
    new Function('return ' + src)()(s, h), { s: ц.sel, h: HIG, src: probe.toString() });
  if (!r.є) { ok(`ПРИЛАД: ${ц.що} є на сцені`, false, `${ц.sel} не намальовано`); continue; }
  знайдено++;
  ok(`${ц.що} ловить палець у квадраті ${HIG}px`,
     r.влучань + r.поза === r.всього,
     `влучань ${r.влучань}/${r.всього}${r.поза ? ` (${r.поза} поза екраном)` : ''} · коробка ${r.коробка}`);
}
ok('ПРИЛАД: сцена показала хоч якісь цілі', знайдено >= 5, `${знайдено} із ${ЦІЛІ.length}`);

// ── ЗУСТРІЧНА ПЕРЕВІРКА: зона не краде дотики в сусідів ──────────────────────
// 🛑 Без цього сторож був би ШКІДЛИВИЙ: він винагороджував би нескінченне
// розширення зон, а розширена зона, що накрила сусіда, гірша за дрібну ціль —
// людина влучає, і спрацьовує не те.
await goTab('shotam');
const сусіди = await p.evaluate(({ src }) => {
  const probe = new Function('return ' + src)();
  return ['.fd-like', '.fd-cbtn', '.fd-share'].map(s => ({ s, ...probe(s, 2) }));
}, { src: probe.toString() });
const цілі = сусіди.filter(x => x.є);
ok('ПРИЛАД: три кнопки допису на сцені', цілі.length === 3, `${цілі.length}/3`);
for (const c of цілі) {
  ok(`центр ${c.s} лишився за ним самим (сусід не вкрав)`, c.влучань === c.всього,
     `${c.влучань}/${c.всього}`);
}

await stop(); await b.close();
done();
