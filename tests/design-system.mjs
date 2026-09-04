// tests/design-system.mjs — СТОРОЖ ДИЗАЙН-СИСТЕМИ (03.09.2026).
//
// 🗣️ Замовлення Вови: «зробити не "дитячий" вигляд, а преміальний… не керуйся
// тим що є, типу "бо ми вже так зробили"».
//
// 🔴 ЩО САМЕ ЦЕЙ СТОРОЖ ТРИМАЄ. Дизайн-аудит 03.09 заміряв на 59 живих екранах:
// 53 різні тіні · 29 радіусів · 33 кеглі · 97 вузлів КАПСОМ на кеглі ≥13px ·
// 41% тексту вагою ≥700 · `--ink-mute` з контрастом 2.69 на сірому тлі.
// Це не набір окремих вад — це відсутність системи, і саме вона читалась як
// «дитячий вигляд». Правки внесені; без сторожа вони розповзуться назад за
// місяць, бо кожне окреме «ще один відтінок» виглядає нешкідливо.
//
// 🔑 МІРЯЄМО ЖИВІ ЕКРАНИ, А НЕ ТЕКСТ CSS. У проєкті вже коштувало помилок читати
// наміри в коді: коментар стверджував, що в картки є обідок, а `border-top-width`
// дорівнював 0. Тут так само: правило `text-transform` могло б стояти в CSS і
// перекриватись іншим — важливо, що бачить ЛЮДИНА.
//
// ⚠️ Частина перевірок (половинні кеглі, ваги, кольорові тіні) читає САМЕ CSS —
// і це навмисно: вони про ДЖЕРЕЛО, тобто про те, що напише наступна сесія.
// Живий екран показав би лише ті вузли, які зараз намальовані.
//
// Контроль: CSS_REV=origin/main node tests/design-system.mjs

import { chromium } from 'playwright';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { launch, serve, ROOT, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const REV = process.env.CSS_REV || '';
const { ok, done } = reporter();
// reporter().ok(назва, умова, інфо) — сигнатура з `_lib.mjs`; окремого `fail` немає.
const fail = (name, info) => ok(name, false, info);

// ── Частина А: ДЖЕРЕЛО (усі style/*.css) ────────────────────────────────────
const files = readdirSync(join(ROOT, 'style')).filter(f => f.endsWith('.css'));
// 🔴 УСІ файли стилів, а не дві зони. Перша редакція брала `zoneCss()` (лише
// community+board) — і контроль виходив БРЕХЛИВИЙ: половина правил, які сторож
// стереже, живе в інших файлах.
const readAll = rev => files.map(f => {
  try { return projectFile('style/' + f, rev); } catch (_) { return ''; }
}).join('\n');
const allCss = readAll(REV);

// A1. Половинні кеглі — «12.5px проти 13px» око не бачить, а ритм від них розсипається.
// 🔴 04.09 — ПЕРЕВІРКА ЛОВИЛА ЛИШЕ `font-size:`, І ЧЕРЕЗ ЦЕ ПРОПУСТИЛА `11.5px`
// у скороченому записі `font: 400 11.5px/1.3 …` (мета картки контакту). Тобто
// сторож був зелений над рівно тією вадою, яку заведений ловити: 03.09 я
// відзвітував «половинних кеглів 0», а їх було не нуль.
// ➡️ Тепер шукається САМЕ ЧИСЛО перед `px`, у будь-якому записі — і в
// `font-size:`, і в скороченні. Урок ширший за цей файл: пишеш перевірку на
// CSS — перевіряй ВЛАСТИВІСТЬ у всіх формах, якими її можна записати.
const halves = [...allCss.matchAll(/(?:font-size:\s*|font:[^;{}]*?\s)(\d+\.5)px/g)].map(m => m[1]);
halves.length
  ? fail('половинних кеглів у CSS немає', `${halves.length} шт.: ${[...new Set(halves)].join(', ')}`)
  : ok('половинних кеглів у CSS немає', true);

// A2. Вага 800/900 — у системному шрифті на 11-20px різниця з 700 майже невидима,
// а 900 («Black») в інтерфейсі ролі не має взагалі.
// 🔴 04.09 — ТА САМА ДІРКА, ЩО В A1: ловилось лише `font-weight:`, а `font: 800 …`
// проходило повз. Через це звіт 03.09 казав «ваг 800/900 — 0», тоді як їх було
// **19**. Тепер обидва записи.
const heavy = [...allCss.matchAll(/(?:font-weight:\s*|font:\s*)(800|900)\b/g)].map(m => m[1]);
heavy.length
  ? fail('ваги 800/900 у CSS немає', `${heavy.length} шт.`)
  : ok('ваги 800/900 у CSS немає', true);

// A3. Кольорові тіні висоти. 🛑 ВИНЯТОК рівно один і названий: центральна кнопка
// «Громада» — Вова 08.08 прямо просив повернути її світло-бордовий відтінок.
const colored = [...allCss.matchAll(/box-shadow:\s*([^;]*rgba\(114[^;]*)/g)]
  .map(m => m[1].trim())
  .filter(v => !/^0\s+0\s+0\s/.test(v));           // `0 0 0 Npx` — ореол фокуса, не тінь
const allowed = colored.filter(v => v.includes('0.5)') || v.includes('0.6)'));
colored.length - allowed.length === 0
  ? ok(`кольорових тіней висоти немає (виняток — кнопка «Громада», ${allowed.length})`, true)
  : fail('кольорових тіней висоти немає', `${colored.length - allowed.length} зайвих: ${colored[0]?.slice(0, 60)}`);

// A4. Токени системи оголошені.
for (const t of ['--elev-1', '--elev-2', '--elev-3', '--elev-4', '--r-sm', '--r-md', '--r-lg']) {
  allCss.includes(t + ':') ? ok(`токен ${t} оголошений`, true) : fail(`токен ${t} оголошений`, 'немає');
}

// A5. `--ink-mute` мусить бути НЕЙТРАЛЬНИМ і доступним.
// 📐 Було `#9C9080`: теплота R−B = +28 (беж, скасований 11.08) і контраст 2.69
// на `--app-bg` — нижче навіть за мʼяку норму 3.0.
const mute = /--ink-mute:\s*#([0-9A-Fa-f]{6})/.exec(allCss)?.[1];
const rgb = h => [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
const lum = c => { const f = v => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
if (!mute) fail('--ink-mute оголошений', 'не знайдено');
else {
  const c = rgb(mute), warm = c[0] - c[2], r = ratio(c, [236, 238, 241]);
  warm <= 0 ? ok(`--ink-mute нейтральний (R−B = ${warm})`, true)
            : fail('--ink-mute нейтральний', `теплота +${warm} — це беж, скасований 11.08`);
  r >= 4.5 ? ok(`--ink-mute доступний на --app-bg (${r.toFixed(2)}:1)`, true)
           : fail('--ink-mute доступний на --app-bg', `${r.toFixed(2)}:1 при нормі 4.5`);
}

// ── Частина Б: ЖИВІ ЕКРАНИ ──────────────────────────────────────────────────
const NOW = Date.now(), iso = ms => new Date(ms).toISOString();
const ME = { id: 'u-me', email: 'me@example.com', user_metadata: { name: 'Володимир' } };
const POSTS = [
  { id: 901, type: 'board', category: 'продам', title: 'Велосипед дорослий, 28"', price: 2500,
    text: 'Робочий стан, гальма нові.', photos: [], location: 'Олика', author: 'Петро', owner_uid: 'u-p',
    status: 'published', ts: NOW - 3600e3, created_at: iso(NOW - 3600e3), published_at: iso(NOW - 3600e3) },
  { id: 701, type: 'chat', text: 'Коли буде концерт?', title: null, author: 'Олена', owner_uid: 'u-o',
    status: 'published', location: null, tags: [], ts: NOW - 864e5,
    created_at: iso(NOW - 864e5), published_at: iso(NOW - 864e5) },
];

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  serviceWorkers: 'block', locale: 'uk-UA' });
const p = await ctx.newPage();
await mockSupabase(p, { posts: POSTS, comments: [], announcements: [], pages: [], page_posts: [],
  threads: [], messages: [], thread_user_state: [] }, { user: ME, profiles: [] });
await p.route(/^https?:\/\/(?!127\.0\.0\.1)[^/]+\//, r => r.abort());
await p.goto(url, { waitUntil: 'domcontentloaded' });
// 🔴 КОНТРОЛЬ МУСИТЬ УМІТИ ВПАСТИ. Перша редакція вклеювала лише `zoneCss(REV)`
// ПОВЕРХ свіжих стилів — свіжі правила лишались чинними, і три живі перевірки
// світились зеленим навіть на старому коді. Тепер при CSS_REV усі наявні
// <link rel=stylesheet> вимикаються, а замість них вкидається CSS ревізії.
if (REV) {
  await p.evaluate(() => document.querySelectorAll('link[rel=stylesheet]').forEach(l => l.disabled = true));
  await p.addStyleTag({ content: readAll(REV) });
}
await p.waitForTimeout(2200);
await p.evaluate(() => { document.getElementById('splash')?.remove(); document.querySelector('.consent-accept')?.click(); });
await p.waitForTimeout(300);

const SCAN = () => {
  const vis = el => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) > 0.02;
  };
  const caps = [], weights = { h: 0, all: 0 };
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    let own = ''; for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
    if (!own.trim()) continue;
    const s = getComputedStyle(el), fs = parseFloat(s.fontSize);
    weights.all++; if (+s.fontWeight >= 700) weights.h++;
    // 🔑 Капс дозволений лише як ДРІБНА МІТКА-КАТЕГОРІЯ. 12.5px — межа, узята з
    // живих даних: усе, що більше, читалось як заголовок і кричало.
    if (s.textTransform === 'uppercase' && fs >= 13) {
      caps.push({ n: el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0], fs, t: own.trim().slice(0, 22) });
    }
  }
  return { caps, weights };
};

const tabs = ['community', 'shotam', 'discussions', 'board', 'buses'];
let allCaps = [], hv = 0, tot = 0;
for (const t of tabs) {
  await p.evaluate(x => window.switchTab && window.switchTab(x), t);
  await p.waitForTimeout(1200);
  if (t === 'board') { await p.evaluate(() => document.querySelector('.brules-ok')?.click()); await p.waitForTimeout(600); }
  const r = await p.evaluate(SCAN);
  allCaps = allCaps.concat(r.caps); hv += r.weights.h; tot += r.weights.all;
}

allCaps.length === 0
  ? ok('🔴 на живих вкладках немає КАПСУ з кеглем ≥13px', true)
  : fail('🔴 на живих вкладках немає КАПСУ з кеглем ≥13px',
         `${allCaps.length} шт., напр. ${allCaps[0].n} ${allCaps[0].fs}px «${allCaps[0].t}»`);

const pct = Math.round(hv * 100 / Math.max(tot, 1));
// 📐 СТЕЛЯ ЗАМІРЯНА, А НЕ ВИГАДАНА. Контроль `CSS_REV=origin/main` на цій самій
// вибірці (5 вкладок) дає **54%**, свіжий код — **44%**. Стеля 45% тримає
// досягнуте і не дає сповзти назад.
// 🛑 44% — це НЕ ціль, а проміжний стан: у преміальних інтерфейсах жирного
// ~20-25%. Дальше зниження вимагає ручного перегляду кожного `700` (де воно
// тримає ієрархію, а де просто «щоб було помітніше») — окрема робота.
// ⚠️ Стелю НЕ піднімати. Піднята стеля означає, що правило перестало захищати.
pct <= 45
  ? ok(`частка жирного тексту (≥700) — ${pct}% (було 54%, стеля 45%)`, true)
  : fail('частка жирного тексту (≥700)', `${pct}% при стелі 45% (контроль на origin/main дає 54%)`);

// Підпис таб-бару: не дрібніший за 11px — це головна навігація.
//
// 🛑 ВИНЯТОК, НАЗВАНИЙ ЯВНО: «ГРОМАДА» КАПСОМ — пряме замовлення Вови 04.09
// («в таб-барі, там, де знаходиться вкладка Громада, треба всі букви великими
// буквами написати»). Рішення власника правило аудиту не скасовує.
// 🔑 Тому перевірка стала СИЛЬНІШОЮ, а не слабшою: раніше вона питала лише
// ПЕРШИЙ підпис, тепер обходить УСІ пʼять і вимагає, щоб капс був РІВНО НА
// ОДНОМУ — центральному. Дати капс усім означало б повернути те, що аудит
// прибирав: виділення, яке стоїть скрізь, не виділяє нічого. Прибрати його з
// «Громади» означало б мовчки скасувати замовлення. Обидві помилки тепер
// червоніють.
const підписи = await p.evaluate(() => [...document.querySelectorAll('.tab-bar .tab-label')]
  .map(el => { const s = getComputedStyle(el);
    return { fs: parseFloat(s.fontSize), tt: s.textTransform, t: el.textContent.trim(),
             home: el.classList.contains('tab-label--home') }; }));
if (!підписи.length) fail('підписи таб-бару знайдено', 'немає .tab-label');
else {
  const капсом = підписи.filter(t => t.tt === 'uppercase');
  const дім = підписи.find(t => t.home);
  дім && дім.tt === 'uppercase'
    ? ok(`«${дім.t}» капсом — замовлення Вови 04.09`, true)
    : fail('«Громада» капсом — замовлення Вови 04.09', дім ? `${дім.tt}` : 'підпису немає');
  капсом.length === 1
    ? ok('капсом у таб-барі рівно ОДИН підпис — центральний', true)
    : fail('капсом у таб-барі рівно ОДИН підпис — центральний',
           `${капсом.length} шт.: ${капсом.map(t => t.t).join(', ')}`);
  const дрібні = підписи.filter(t => t.fs < 11);
  дрібні.length === 0
    ? ok(`жоден підпис таб-бару не дрібніший за 11px (${підписи[0].fs}px)`, true)
    : fail('жоден підпис таб-бару не дрібніший за 11px',
           дрібні.map(t => `${t.t} ${t.fs}px`).join(', '));
}

// ── Привітання Громади: оголошений шрифт і запасний ─────────────────────────
//
// 🛑 ЧЕСНО ПРО МЕЖУ ЦІЄЇ ПЕРЕВІРКИ. Вона стереже ОГОЛОШЕННЯ, а не намальовану
// форму — і інакше бути не може: `ui-rounded` (SF Pro Rounded) існує лише в
// iOS, у прогонному Chromium його немає ФІЗИЧНО (`fc-list` у контейнері не
// знає жодного шрифту Apple). Перевіряти тут «яка літера вийшла» означало б
// міряти підмінений Linux-шрифт і видавати це за телефон Вови — рівно та
// брехлива мірка, на якій я вже спіймався 04.09, вивівши неіснуючу «стелю
// 18px» із виміру 306px (на живому айфоні те саме привітання — 258px).
//
// 🔑 Тому стережеться те, що ПЕРЕВІРНЕ і що ламається мовчки:
//   (1) `ui-rounded` не зник із оголошення (вибір Вови зі зразків 04.09);
//   (2) після нього стоїть запасний системний — без нього поза Safari рядок
//       упав би на стандартний шрифт браузера, і Android побачив би не те.
const прив = await p.evaluate(() => {
  const el = document.querySelector('.hm-hi');
  if (!el) return null;
  const s = getComputedStyle(el);
  return { сімʼя: s.fontFamily, кегль: parseFloat(s.fontSize), вага: s.fontWeight };
});
if (!прив) fail('привітання Громади знайдено', 'немає .hm-hi');
else {
  /ui-rounded/.test(прив.сімʼя)
    ? ok('привітання Громади оголошує ui-rounded (вибір Вови 04.09)', true)
    : fail('привітання Громади оголошує ui-rounded (вибір Вови 04.09)', прив.сімʼя);
  /ui-rounded[^,]*,\s*(system-ui|-apple-system)/.test(прив.сімʼя)
    ? ok('після ui-rounded стоїть запасний системний (поза iOS)', true)
    : fail('після ui-rounded стоїть запасний системний (поза iOS)', прив.сімʼя);
}

await ctx.close(); await b.close(); await stop();
done();
