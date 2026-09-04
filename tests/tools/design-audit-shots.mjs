// tests/tools/design-audit-shots.mjs — ЗНІМКИ ВСІХ ЕКРАНІВ ПІД ДИЗАЙН-АУДИТ (03.09.2026).
//
// Замовлення Вови (03.09, дослівно): «проведи дуже детальний аудит всього застосунку
// з точки зору дизайну… не тільки вкладок таббара, а всіх вкладок і сторінок і
// модалок… зробити не "дитячий" вигляд, а преміальний».
//
// Це ПРИЛАД, не стенд — нічого не «падає». Обходить екрани у Chromium 390×844 з
// підробленою базою (насичені дані: фото, дописи, питання, чат, збори) і кладе:
//   • PNG кожної сцени → <out>/NN-назва.png
//   • JSON обчислених стилів на кожній сцені → <out>/measure.json
//     (тіні, радіуси, кеглі, ваги, tracking, кольори тла/тексту — ЧИСЛА, не CSS-текст:
//     у проєкті вже коштувало помилок читати наміри в коді замість обчислених значень)
//
// 🔴 Фото новин живуть на чужих доменах (konkurent, pravda, volynpost…) — з пісочниці
// вони не доїдуть, і картки були б із сірими дірками. Тому ЧУЖІ картинки підміняються
// нашими з `photos/` — аудит про форму картки, а не про чужий CDN.
//
// Запуск: node tests/tools/design-audit-shots.mjs [тека-виводу]

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { launch, serve, ROOT } from '../_lib.mjs';
import { mockSupabase } from '../_board-fixture.mjs';

const OUT = process.argv[2] || join(ROOT, 'tests', 'tools', '_out', 'design-audit');
mkdirSync(OUT, { recursive: true });

// ── Фікстури ────────────────────────────────────────────────────────────────
const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const ME = { id: 'u-me', email: 'me@example.com', user_metadata: { name: 'Володимир' } };
const P = (n) => `/photos/olyka.day-${n}.jpg`;
const PE = (n) => `/photos/olyka.evening-${n}.jpg`;

const PROFILES = [
  { uid: 'u-me',     name: 'Володимир Шевчук', avatar_url: P(1) },
  { uid: 'u-olena',  name: 'Олена Кравчук',     avatar_url: P(2) },
  { uid: 'u-petro',  name: 'Петро Коваль',      avatar_url: '' },
  { uid: 'u-viktor', name: 'Віктор Пилипчук',   avatar_url: PE(1) },
  { uid: 'u-oksana', name: 'Оксана Ковальчук',  avatar_url: '' },
];

const bd = (id, extra) => ({
  id, type: 'board', category: 'продам', title: 'Продаю автомобіль', currency: 'UAH',
  text: 'Терміново продам автомобіль у гарному стані, один власник, торг можливий при огляді.',
  photos: [], price: null, location: 'Олика', author: 'Петро', owner_uid: 'u-petro',
  status: 'published', ts: NOW - 3600e3, created_at: iso(NOW - 3600e3), bumped_at: iso(NOW - 3600e3),
  published_at: iso(NOW - 3600e3), contact: '+380 50 000 00 00', ...extra,
});
const qa = (id, text, uid, author, dt) => ({
  id, type: 'chat', text, title: null, author, owner_uid: uid, status: 'published', location: null, tags: [],
  ts: NOW - dt, created_at: iso(NOW - dt), published_at: iso(NOW - dt),
});
const POSTS = [
  bd(901, { title: 'Велосипед дорослий, 28"', category: 'продам', price: 2500, photos: [P(3), P(4)], photo: P(3),
    text: 'Робочий стан, гальма нові, камери замінені цього літа. Віддам недорого, бо купив інший.' }),
  bd(902, { title: 'Ремонт взуття', category: 'послуги', price: null, location: 'Олика',
    text: 'Швидко і якісно. Набійки, заміна блискавок, розтяжка. Майстерня біля ринку.', owner_uid: 'u-me', author: 'Володимир' }),
  bd(903, { title: 'Віддам цуценя в добрі руки', category: 'віддам', photos: [PE(2)], photo: PE(2),
    text: 'Добрий спокійний пес шукає дім. Щеплений, 4 місяці.', location: 'Метельне', owner_uid: 'u-olena', author: 'Олена' }),
  bd(904, { title: 'Куплю дрова, 5 складометрів', category: 'куплю', price: null, price_negotiable: true, location: 'Жорнище' }),
  bd(905, { title: 'Будинок в Залісочому', category: 'продам', price: 850000, photos: [P(2), PE(3), PE(4)], photo: P(2),
    location: 'Залісоче', text: 'Цегляний будинок 96 м², 25 соток, газ, вода, гараж. Документи готові.' }),
  bd(906, { title: 'Загублено ключі біля школи', category: 'знайдено', price: null, text: 'Знайшов звʼязку ключів з брелоком-замком. Віддам власнику.', owner_uid: 'u-viktor', author: 'Віктор' }),
  qa(701, 'Коли буде концерт на День міста?', 'u-olena', 'Олена', 5 * 864e5),
  qa(702, 'Хтось знає, коли ремонтуватимуть дорогу в Метельному? Ями вже по коліно.', 'u-petro', 'Петро', 2 * 864e5),
  qa(703, 'Де в Олиці можна здати макулатуру?', 'u-viktor', 'Віктор', 6 * 3600e3),
  qa(704, 'Чи працює амбулаторія у суботу?', 'u-me', 'Володимир', 3 * 3600e3),
];
const COMMENTS = [
  { id: 5001, post_id: 701, author: 'Віктор Пилипчук', text: 'Начебто 24 серпня, біля замку.', sender_uid: 'u-viktor',
    reply_to_id: null, created_at: iso(NOW - 4 * 864e5), edited_at: null, deleted_at: null, client_tag: null },
  { id: 5002, post_id: 701, author: 'Марія', text: 'Так, підтверджую — бачила афішу біля клубу.', sender_uid: 'u-oksana',
    reply_to_id: 5001, created_at: iso(NOW - 3.9 * 864e5), edited_at: null, deleted_at: null, client_tag: null },
  { id: 5003, post_id: 701, author: 'Оксана Ковальчук', text: 'Афішу вже повісили, початок о 18:00.', sender_uid: 'u-oksana',
    reply_to_id: null, created_at: iso(NOW - 3.5 * 864e5), edited_at: null, deleted_at: null, client_tag: null },
  { id: 5004, post_id: 702, author: 'Володимир', text: 'У раді казали — після 15 вересня.', sender_uid: 'u-me',
    reply_to_id: null, created_at: iso(NOW - 1 * 864e5), edited_at: null, deleted_at: null, client_tag: null },
];
const THREADS = [
  { id: 't-1', post_id: 902, author_uid: 'u-me', buyer_uid: 'u-petro', author_name: 'Володимир', buyer_name: 'Петро Коваль',
    last_message_at: iso(NOW - 600e3), last_message_text: 'Ще актуально? Можу підійти завтра.', post: { id: 902, title: 'Ремонт взуття', status: 'published' } },
  { id: 't-2', post_id: 901, author_uid: 'u-petro', buyer_uid: 'u-me', author_name: 'Петро Коваль', buyer_name: 'Володимир',
    last_message_at: iso(NOW - 864e5), last_message_text: 'Домовились, дякую!', post: { id: 901, title: 'Велосипед дорослий, 28"', status: 'published' } },
];
const MESSAGES = [
  { id: 'm1', thread_id: 't-1', sender_uid: 'u-petro', text: 'Добрий день! Ще актуально?', created_at: iso(NOW - 900e3), photo_url: null },
  { id: 'm2', thread_id: 't-1', sender_uid: 'u-me', text: 'Так, актуально. Приходьте після 14:00.', created_at: iso(NOW - 800e3), photo_url: null },
  { id: 'm3', thread_id: 't-1', sender_uid: 'u-petro', text: 'Ще актуально? Можу підійти завтра.', created_at: iso(NOW - 600e3), photo_url: null },
];
const PAGES = [
  { id: 1, name: 'Олицька міська рада', sort_order: 0, avatar_url: P(1), banner_url: PE(1), is_system: false, description: 'Офіційна сторінка громади', slug: 'rada' },
  { id: 2, name: 'Olyka Castle',        sort_order: 1, avatar_url: P(3), banner_url: P(2),  is_system: false, description: 'Чим цікава Олика сьогодні', slug: 'castle' },
  { id: 3, name: 'Молодіжна рада',      sort_order: 2, avatar_url: null, banner_url: null,  is_system: false, description: 'Події для молоді', slug: 'youth' },
  { id: 6, name: 'Історія Громади',     sort_order: 3, avatar_url: PE(2), banner_url: PE(3), is_system: false, description: 'Що тут було колись', slug: 'history' },
];
const pp = (id, page_id, text, dt, фото = []) => ({
  id, page_id, text, created_at: iso(NOW - dt), status: 'published',
  image_url: фото[0] || null, image_urls: фото, author_uid: 'u-me', show_author: true, pinned_at: null,
  pages: { name: PAGES.find(p => p.id === page_id).name, avatar_url: PAGES.find(p => p.id === page_id).avatar_url },
});
const PAGE_POSTS = [
  pp(31, 2, '🏰 ЗАМОК РАДЗИВІЛЛІВ ОЖИВАЄ\n\nЦими вихідними — екскурсії щогодини з 11:00 до 17:00. Приходьте родинами: у нас є що показати і про що розповісти кожному, хто цікавиться історією рідного краю.', 2 * 3600e3, [P(1), P(2)]),
  pp(32, 1, 'Шановні жителі! У четвер, 5 вересня, з 09:00 до 13:00 не буде води на вул. Замковій та Шевченка у звʼязку з ремонтом мережі.', 5 * 3600e3),
  pp(33, 6, 'У 1586 році навколо Олики постала ординація князів Радзивіллів — одна з трьох на Волині. Замок став її серцем на три століття.', 864e5, [PE(3)]),
  pp(34, 3, 'Збираємо команду на турнір з міні-футболу 14 вересня. Запис у коментарях!', 2 * 864e5, [P(4)]),
  pp(35, 2, 'Вечірня Олика з висоти замкової вежі.', 3 * 864e5, [PE(1), PE(2), PE(4)]),
];
const FUND = [{
  id: 1, title: 'Дрони для 14 ОМБр', org: 'Волонтерський штаб Олики', url: 'https://send.monobank.ua/jar/A',
  goal: 250000, photo: P(3), note: 'Збираємо на чотири FPV-дрони для підрозділу, у якому служать хлопці з нашої громади. Кожен внесок наближає їх повернення додому.',
  kind: 'military', until: '2026-09-30', place: 'Олика', verified: true, active: true, sort_order: 0,
}, {
  id: 2, title: 'Лікування Марійки', org: 'Родина Ковальчуків', url: 'https://send.monobank.ua/jar/B',
  goal: 120000, photo: null, note: 'Дівчинці 6 років, потрібна операція у Львові.', kind: 'health', until: '2026-10-15',
  place: 'Метельне', verified: false, active: true, sort_order: 1,
}];

// ── Погода (Open-Meteo) — підроблена відповідь, щоб віджет був живим ────────
const H = 48;
const WEATHER = {
  current: { temperature_2m: 21.4, weather_code: 2, wind_speed_10m: 12, relative_humidity_2m: 58, apparent_temperature: 21 },
  hourly: {
    time: Array.from({ length: H }, (_, i) => iso(Math.floor(NOW / 3600e3) * 3600e3 + i * 3600e3).slice(0, 16)),
    temperature_2m: Array.from({ length: H }, (_, i) => +(17 + 6 * Math.sin((i - 6) / 24 * Math.PI * 2)).toFixed(1)),
    apparent_temperature: Array.from({ length: H }, (_, i) => +(16 + 6 * Math.sin((i - 6) / 24 * Math.PI * 2)).toFixed(1)),
    precipitation_probability: Array.from({ length: H }, (_, i) => (i % 9 === 0 ? 40 : 5)),
    relative_humidity_2m: Array.from({ length: H }, () => 60),
    weather_code: Array.from({ length: H }, (_, i) => (i % 9 === 0 ? 61 : i % 5 === 0 ? 3 : 1)),
    wind_speed_10m: Array.from({ length: H }, () => 11), wind_direction_10m: Array.from({ length: H }, () => 240),
  },
  daily: {
    time: Array.from({ length: 7 }, (_, i) => iso(NOW + i * 864e5).slice(0, 10)),
    temperature_2m_max: [24, 22, 19, 21, 23, 25, 24], temperature_2m_min: [13, 12, 11, 12, 13, 14, 14],
    weather_code: [2, 3, 61, 1, 0, 0, 2],
    sunrise: Array.from({ length: 7 }, (_, i) => iso(NOW + i * 864e5).slice(0, 10) + 'T06:24'),
    sunset:  Array.from({ length: 7 }, (_, i) => iso(NOW + i * 864e5).slice(0, 10) + 'T19:41'),
  },
};

// ── Збирач обчислених стилів (виконується в браузері) ───────────────────────
const MEASURE = () => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || parseFloat(s.opacity) <= 0.02) return false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const as = getComputedStyle(a);
      if (as.visibility === 'hidden' || parseFloat(as.opacity) <= 0.02 || as.display === 'none') return false;
    }
    return true;
  };
  const nm = (el) => {
    const cls = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls;
  };
  const cnt = (m, k) => { m[k] = (m[k] || 0) + 1; };
  const shadows = {}, radii = {}, sizes = {}, weights = {}, tracks = {}, bgs = {}, inks = {}, borders = {};
  const shadowNodes = [], radiusNodes = [], buttons = [], texts = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (s.boxShadow !== 'none') { cnt(shadows, s.boxShadow); if (shadowNodes.length < 60) shadowNodes.push({ n: nm(el), v: s.boxShadow, w: Math.round(r.width), h: Math.round(r.height) }); }
    if (r.width >= 40 && r.height >= 24 && s.borderRadius !== '0px') { cnt(radii, s.borderRadius); if (radiusNodes.length < 80) radiusNodes.push({ n: nm(el), v: s.borderRadius, w: Math.round(r.width), h: Math.round(r.height) }); }
    if (r.width >= 80 && r.height >= 40) {
      const bg = s.backgroundColor; if (bg && !/rgba\(0, 0, 0, 0\)/.test(bg)) cnt(bgs, bg);
      if (s.borderTopWidth !== '0px' && s.borderTopStyle !== 'none') cnt(borders, `${s.borderTopWidth} ${s.borderTopColor}`);
    }
    let own = ''; for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
    if (own.trim()) {
      cnt(sizes, s.fontSize); cnt(weights, s.fontWeight); cnt(tracks, s.letterSpacing); cnt(inks, s.color);
      if (texts.length < 120) texts.push({ n: nm(el), t: own.trim().replace(/\s+/g, ' ').slice(0, 30), fs: parseFloat(s.fontSize), fw: s.fontWeight, ls: s.letterSpacing, lh: s.lineHeight, c: s.color, tt: s.textTransform });
    }
    if (el.matches('button,a,[role=button]') && r.width >= 24) {
      buttons.push({ n: nm(el), t: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24), w: Math.round(r.width), h: Math.round(r.height), r: s.borderRadius, bg: s.backgroundColor, fs: s.fontSize, fw: s.fontWeight, sh: s.boxShadow !== 'none' });
    }
  }
  const top = (m, n = 12) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);
  return { shadows: top(shadows, 20), radii: top(radii, 16), sizes: top(sizes, 20), weights: top(weights), tracks: top(tracks),
    bgs: top(bgs, 14), inks: top(inks, 14), borders: top(borders), shadowNodes, radiusNodes, buttons: buttons.slice(0, 40), texts };
};

// ── Навігація ───────────────────────────────────────────────────────────────
const wait = (p, ms) => p.waitForTimeout(ms);
const tab = async (p, t, ms = 1400) => { await p.evaluate(t => window.switchTab && window.switchTab(t), t); await wait(p, ms); };
const click = async (p, sel, ms = 900) => {
  const ok = await p.evaluate(s => { const el = document.querySelector(s); if (!el) return false; el.click(); return true; }, sel);
  await wait(p, ms); return ok;
};
const scrollMain = async (p, y) => {
  await p.evaluate(y => {
    const cands = [document.querySelector('.app-main'), document.scrollingElement, ...document.querySelectorAll('.nh-list,.shub-body,.acc-cab-scroll,.app-modal-sheet,.cm-ad-sheet,.pm-screen-body,.fd-screen,.qa-screen,.fs-screen')];
    for (const c of cands) { if (c && c.scrollHeight > c.clientHeight + 8) { c.scrollTo({ top: y, behavior: 'instant' }); } }
  }, y);
  await wait(p, 500);
};
// 🔴 Скидання = ПЕРЕЗАВАНТАЖЕННЯ. Перша редакція шукала кнопки закриття за класами —
// і аркуш «Збережені» з переглядачем фото лишались відкритими на 20 сцен поспіль,
// накриваючи все, що знімалось після них. Чиста сторінка надійніша за будь-який
// перелік селекторів; згода й правила Дошки живуть у localStorage, тож не повертаються.
let BASE_URL = '';
const reset = async (p) => {
  await p.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await wait(p, 2200);
  await p.evaluate(() => { document.getElementById('splash')?.remove(); document.querySelector('.consent-accept')?.click(); });
  await wait(p, 300);
};

let idx = 0;
const shots = [];
const measure = {};
async function shot(p, name, opts = {}) {
  idx++;
  const file = `${String(idx).padStart(2, '0')}-${name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')}.png`;
  await p.screenshot({ path: join(OUT, file), fullPage: !!opts.full });
  shots.push({ idx, name, file });
  try { measure[name] = await p.evaluate(MEASURE); } catch (e) { measure[name] = { error: e.message }; }
  console.log(`📸 ${String(idx).padStart(2, '0')} ${name}`);
}

const SCENES = [
  // ── вкладки ──
  ['Громада — верх', async p => { await tab(p, 'community', 2200); await scrollMain(p, 0); }],
  ['Громада — прокрутка 1', async p => { await scrollMain(p, 760); }],
  ['Громада — прокрутка 2', async p => { await scrollMain(p, 1520); }],
  ['Громада — прокрутка 3', async p => { await scrollMain(p, 2280); }],
  ['Громада — прокрутка 4 (низ)', async p => { await scrollMain(p, 4000); }],
  ['Стрічка — верх', async p => { await tab(p, 'shotam', 2000); await scrollMain(p, 0); }],
  ['Стрічка — прокрутка', async p => { await scrollMain(p, 700); }],
  ['Питання — список', async p => { await tab(p, 'discussions', 1800); }],
  ['Дошка — верх', async p => { await tab(p, 'board', 1800); await scrollMain(p, 0); }],
  ['Дошка — прокрутка', async p => { await scrollMain(p, 500); }],
  ['Автобуси — верх', async p => { await tab(p, 'buses', 1800); await scrollMain(p, 0); }],
  ['Автобуси — прокрутка', async p => { await scrollMain(p, 700); }],
  ['Автобуси — усі рейси', async p => { await click(p, '#bus-show-all-btn', 900); await scrollMain(p, 300); }],
  // ── шари з Громади ──
  ['Погода — аркуш', async p => { await tab(p, 'community', 1200); await scrollMain(p, 0); await click(p, '.hm-wx-toggle, [data-wx-toggle]', 1100); }],
  ['Погода — аркуш прокрутка', async p => { await scrollMain(p, 500); }],
  ['Стаття — модалка', async p => { await reset(p); await tab(p, 'community', 900); await click(p, '.nc[data-article-id]', 1400); }],
  ['Стаття — прокрутка', async p => { await scrollMain(p, 600); }],
  ['Новини — хаб (Громада)', async p => { await reset(p); await click(p, '#sidebar-toggle', 600); await click(p, '[data-nav="news"]', 1400); }],
  ['Новини — хаб Волинь', async p => { await click(p, '.nh-tab:nth-child(2), [data-nh-group]:nth-child(2)', 900); }],
  ['Новини — хаб прокрутка', async p => { await scrollMain(p, 900); }],
  ['Збори — екран', async p => { await reset(p); await click(p, '#sidebar-toggle', 600); await click(p, '[data-nav="fund"]', 1400); }],
  ['Збори — модалка збору', async p => { await click(p, '[data-fund-id]', 1000); }],
  ['Збережені — хаб', async p => { await reset(p); await click(p, '#sidebar-toggle', 600); await click(p, '[data-nav="saved"]', 1200); }],
  ['Збережені — статті', async p => { await click(p, '[data-shub-cat="articles"]', 900); }],
  ['Бургер-меню', async p => { await reset(p); await tab(p, 'community', 700); await click(p, '#sidebar-toggle', 800); }],
  ['Телефони громади', async p => { await click(p, '[data-nav="contacts"]', 1200); }],
  ['Підтримка (інфо)', async p => { await click(p, '#sidebar-toggle', 500); await click(p, '[data-nav="support"]', 900); }],
  ['Політика і приватність', async p => { await reset(p); await click(p, '#sidebar-toggle', 500); await click(p, '[data-nav="policy"]', 900); }],
  ['Правила Дошки', async p => { await reset(p); await click(p, '#sidebar-toggle', 500); await click(p, '[data-nav="boardrules"]', 900); }],
  // ── кабінет ──
  ['Кабінет жителя', async p => { await reset(p); await tab(p, 'community', 700); await scrollMain(p, 0); await click(p, '[data-account-btn]', 1600); }],
  ['Кабінет — прокрутка', async p => { await scrollMain(p, 700); }],
  ['Профіль — редагування', async p => { await click(p, '[data-go="edit"]', 1000); }],
  ['Картка профілю (тап по аватару)', async p => { await reset(p); await tab(p, 'discussions', 1200); await click(p, '[data-av-uid]', 1200); }],
  // ── Стрічка: шари ──
  ['Стрічка — екран спільноти', async p => { await reset(p); await tab(p, 'shotam', 1200); await click(p, '.fd-circle', 1400); }],
  ['Стрічка — екран спільноти прокрутка', async p => { await scrollMain(p, 600); }],
  ['Стрічка — коментарі', async p => { await reset(p); await tab(p, 'shotam', 1000); await scrollMain(p, 0); await click(p, '.fd-cbtn', 1300); }],
  ['Стрічка — композер', async p => { await reset(p); await tab(p, 'shotam', 900); await click(p, '.fd-circle', 1200); await click(p, '.fd-compose-open', 1100); }],
  ['Стрічка — перегляд фото', async p => { await reset(p); await tab(p, 'shotam', 900); await scrollMain(p, 0); await click(p, '.fd-photo, .fd-gal-slide', 1100); }],
  // ── Дошка: шари ──
  ['Оголошення — картка', async p => { await reset(p); await tab(p, 'board', 1200); await scrollMain(p, 0); await click(p, '#board-content .cm-board-note', 1500); }],
  ['Оголошення — картка прокрутка', async p => { await scrollMain(p, 700); }],
  ['Оголошення — скарга', async p => { await click(p, '[data-ad-report]', 1000); }],
  ['Дошка — меню FAB', async p => { await reset(p); await tab(p, 'board', 1000); await click(p, '#board-trigger', 600); }],
  ['Дошка — подати оголошення', async p => { await click(p, '#board-fab-menu [data-fab="post"]', 1500); }],
  ['Дошка — подати: прокрутка', async p => { await scrollMain(p, 500); }],
  ['Повідомлення — список', async p => { await reset(p); await tab(p, 'board', 900); await click(p, '#board-trigger', 500); await click(p, '#board-fab-menu [data-fab="messages"]', 1500); }],
  ['Повідомлення — чат', async p => { await click(p, '.pm-thread, [data-thread]', 1400); }],
  ['Мої оголошення', async p => { await reset(p); await tab(p, 'board', 900); await click(p, '#board-trigger', 500); await click(p, '#board-fab-menu [data-fab="mine"]', 1500); }],
  ['Збережені оголошення', async p => { await reset(p); await tab(p, 'board', 900); await click(p, '#board-trigger', 500); await click(p, '#board-fab-menu [data-fab="saved"]', 1500); }],
  // ── Питання: шари ──
  ['Питання — екран питання', async p => { await reset(p); await tab(p, 'discussions', 1200); await click(p, '[data-question-open]', 1400); }],
  ['Питання — поставити питання', async p => { await reset(p); await tab(p, 'discussions', 1000); await click(p, '#board-trigger', 600); await click(p, '[data-fab="disc-create"]', 1300); }],
  // ── Автобуси: шари ──
  ['Автобуси — відстеження рейсу', async p => { await reset(p); await tab(p, 'buses', 1400); await scrollMain(p, 0); await click(p, '.bhv4-hero-track-btn, .bs-track-btn', 1500); }],
];

// ── Прогін ──────────────────────────────────────────────────────────────────
const { url, stop } = await serve();
BASE_URL = url;
const b = await launch(chromium);
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

async function newPage(opts = {}) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    serviceWorkers: 'block', userAgent: UA, locale: 'uk-UA', timezoneId: 'Europe/Kyiv',
  });
  const p = await ctx.newPage();
  await mockSupabase(p, {
    posts: POSTS, comments: COMMENTS, announcements: [], threads: THREADS, messages: MESSAGES, thread_user_state: [],
    pages: PAGES, page_posts: PAGE_POSTS, fundraisers: FUND, fundraiser_requests: [], saved_posts: [], user_seen_marks: [],
    reactions: [], page_admins: [{ page_id: 2, uid: 'u-me', role: 'owner' }],
  }, { user: opts.guest ? null : ME, profiles: PROFILES });
  // ⚠️ ПОРЯДОК ПЕРЕХОПЛЮВАЧІВ: Playwright питає їх ВІД ОСТАННЬОГО до першого, тож
  // загальний «глушити все чуже» мусить стояти ПЕРШИМ, а точкові — після нього.
  // Перша редакція ставила його останнім — і погода з фото мовчки гинули в ньому.
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)[^/]+\//, r => r.abort());
  await p.route('**://api.open-meteo.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(WEATHER) }));
  // Чужі картинки → наші фото (по колу), щоб картки новин мали справжній вигляд.
  let k = 0;
  const PH = ['olyka.day-1.jpg', 'olyka.day-2.jpg', 'olyka.day-3.jpg', 'olyka.day-4.jpg', 'olyka.evening-1.jpg', 'olyka.evening-2.jpg'];
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)[^/]+\/.*\.(jpe?g|png|webp|gif)(\?.*)?$/i, r => {
    const f = PH[k++ % PH.length];
    r.fulfill({ contentType: 'image/jpeg', body: readFileSync(join(ROOT, 'photos', f)) });
  });
  if (!opts.guest) {
    // Ключі — справжні, з `install-banner.js` і `join-invite.js`: банер «Встанови» і
    // запрошення увійти мають окремі сцени, а на решті знімків вони лише заважають.
    await p.addInitScript(() => {
      try {
        localStorage.setItem('cstl-install-snooze-v1', String(Date.now()));
        localStorage.setItem('cstl-join-invite-v1', String(Date.now()));
      } catch {}
    });
  }
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await wait(p, 2600);
  await p.evaluate(() => { document.querySelector('.consent-accept')?.click(); document.getElementById('splash')?.remove(); });
  await wait(p, 300);
  await tab(p, 'board', 1200);
  await p.evaluate(() => document.querySelector('.brules-ok')?.click());
  await wait(p, 600);
  await p.evaluate(() => { document.querySelectorAll('.pwa-cta, .pwa-cta-x').forEach(x => x.classList?.contains('pwa-cta-x') && x.click()); });
  return { ctx, p };
}

const { ctx, p } = await newPage();
for (const [name, go] of SCENES) {
  try { await go(p); } catch (e) { console.log(`⚠️  ${name}: ${e.message.split('\n')[0]}`); }
  try { await shot(p, name); } catch (e) { console.log(`⚠️  знімок ${name}: ${e.message.split('\n')[0]}`); }
}
await ctx.close();

// ── Гість: перший запуск, згода, банер встановлення, запрошення увійти, екран входу ──
{
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    serviceWorkers: 'block', userAgent: UA, locale: 'uk-UA', timezoneId: 'Europe/Kyiv' });
  const g = await ctx2.newPage();
  await mockSupabase(g, { posts: POSTS, comments: COMMENTS, announcements: [], pages: PAGES, page_posts: PAGE_POSTS, fundraisers: FUND, threads: [], messages: [], thread_user_state: [] }, { user: null, profiles: PROFILES });
  await g.route(/^https?:\/\/(?!127\.0\.0\.1)[^/]+\//, r => r.abort());
  await g.route('**://api.open-meteo.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(WEATHER) }));
  await g.goto(url, { waitUntil: 'domcontentloaded' });
  await wait(g, 900);
  try { await shot(g, 'Гість — заставка (splash)'); } catch {}
  await wait(g, 3200);
  try { await shot(g, 'Гість — перший екран + згода'); } catch {}
  await g.evaluate(() => document.querySelector('.consent-accept')?.click()); await wait(g, 1600);
  try { await shot(g, 'Гість — банер «Встанови»'); } catch {}
  await click(g, '.pwa-cta-go', 1200);
  try { await shot(g, 'Гість — інструкція встановлення'); } catch {}
  await g.evaluate(() => document.querySelector('.pwa-guide-x')?.click()); await wait(g, 400);
  await tab(g, 'shotam', 900); await tab(g, 'board', 900); await g.evaluate(() => document.querySelector('.brules-ok')?.click()); await wait(g, 500);
  await tab(g, 'discussions', 900); await tab(g, 'community', 1800);
  try { await shot(g, 'Гість — запрошення увійти'); } catch {}
  await g.evaluate(() => { document.querySelectorAll('.ji-x, .ji-later, [data-ji-close]').forEach(b => b.click?.()); }); await wait(g, 400);
  await tab(g, 'community', 600); await scrollMain(g, 0);
  await click(g, '[data-account-btn]', 1400);
  try { await shot(g, 'Гість — екран входу'); } catch {}
  await click(g, '[data-go="mail"]', 900);
  try { await shot(g, 'Гість — вхід поштою'); } catch {}
  await ctx2.close();
}

// ── Адмінка ──
{
  const ctx3 = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', userAgent: UA, locale: 'uk-UA' });
  const a = await ctx3.newPage();
  await mockSupabase(a, { posts: POSTS, comments: COMMENTS, announcements: [], cms_articles: [], ad_reports: [], admins: [{ uid: 'u-me' }], fundraisers: FUND, ai_spend: [] }, { user: ME, profiles: PROFILES });
  await a.route(/^https?:\/\/(?!127\.0\.0\.1)[^/]+\//, r => r.abort());
  await a.goto(url + '/admin.html', { waitUntil: 'domcontentloaded' });
  await wait(a, 2500);
  try { await shot(a, 'Адмінка — головна'); } catch {}
  await ctx3.close();
}

writeFileSync(join(OUT, 'measure.json'), JSON.stringify({ знято: new Date().toISOString(), shots, measure }, null, 1));
writeFileSync(join(OUT, 'index.json'), JSON.stringify(shots, null, 1));
console.log(`\n💾 ${shots.length} знімків → ${OUT}`);
await b.close(); await stop();
