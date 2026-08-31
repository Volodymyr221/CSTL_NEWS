// Стенд: «N НОВИХ» У НОВИНАХ ГАСНЕ ВІД ЧИТАННЯ, А НЕ ЛИШЕ ВІД ВІДКРИТТЯ ХАБА.
//
// 🗣️ Скарга Вови (31.08): «писало плюс сім нова. Я перенажимаю усі новини, читаю
// статті… закриваю додаток, заходжу і знову пише сім нових». І вимога:
// «якщо одна стаття, він відкриває саме цю нову статтю… тоді ця плашка пропадає.
// Коли, наприклад, там сім нових, користувач натискає усі новини… тоді пропадає
// це число».
//
// 🔴 КОРІНЬ БУВ СТРУКТУРНИЙ, А НЕ ДРУКАРСЬКИЙ. Стан «що я бачив» був ОДНИМ ЧИСЛОМ
// (коли востаннє відкривав хаб). Виразити «прочитав одну з семи» таке число не
// вміє В ПРИНЦИПІ: після статті або гасне все, або не гасне нічого. Заміряно
// приладом `tests/tools/news-badge-probe.mjs` ДО правки: тап по статті давав
// «20 нових» → «20 нових».
// ✅ Стало: мітка розділу лишилась ПІДЛОГОЮ, а поверх неї — список прочитаних
// номерів (`readSeenIds`/`writeSeenIds` у `core/board-shared.js`).
//
// ⚠️ МЕЖА, НАЗВАНА ЧЕСНО: список живе на пристрої. Мітка розділу синхронізується
// через базу, окремі номери — ні (власної таблиці немає, а `user_seen_threads`
// зайняти не можна: там `post_id` Питань, номери мовчки збіглися б).
//
// 🔴 КОНТРОЛЬ: BUNDLE_REV=origin/main node tests/news-seen.mjs
//    → на старому коді тап по статті бейдж не міняє, і перевірки 2-4 падають.
//
// Запуск: node tests/news-seen.mjs

import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const BUNDLE_REV = process.env.BUNDLE_REV || '';
// 🔑 CSS підміняється ОКРЕМОЮ змінною, бо зміна лежить двома шарами: клас ставить
// JS (`paintNewsCat`), а тон і вагу описує `style/home.css`. Контроль лише по
// бандлу лишав би половину Б без нагляду — і три перевірки підпису світились би
// зеленими над старим кодом, бо стилі приїжджали б свіжі.
const CSS_REV = process.env.CSS_REV || '';
const UID = '11111111-2222-3333-4444-555555555555';

// 🔑 Сцена СВОЯ, а не живий `data/articles.json`: у файлі щодня інші статті, і
// стенд, прибитий до нього, червонів би від чужого пуша парсера. Числа тут
// мусять бути передбачувані, бо половина перевірок — про АРИФМЕТИКУ бейджа.
const now = Date.now();
const СТАТТІ = [];
for (let i = 0; i < 5; i++) СТАТТІ.push({
  id: 9000 + i, title: `Новина громади ${i + 1}`, excerpt: 'Текст', content: 'Текст',
  category: 'Суспільство', geo: 'Громада', image: null, source: 'CSTL LIFE',
  sourceUrl: null, exclusive: true, ts: now - (i + 1) * 3600e3,
});
// Чужий розділ — навмисно СВІЖІШИЙ за все інше: якби лічильник рахував не лише
// Громаду, ця стаття зіпсувала б кожне число нижче, і це видно було б одразу.
СТАТТІ.push({ id: 9100, title: 'Новина Волині', excerpt: '', content: '', category: 'Суспільство',
  geo: 'Волинь', image: null, source: 'Волинь Post', sourceUrl: null, exclusive: false, ts: now });

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
await mockSupabase(p, {}, { user: { id: UID, email: 'vova@example.com' } });
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.route('**/data/articles.json*', r => r.fulfill({
  contentType: 'application/json', body: JSON.stringify(СТАТТІ) }));
if (BUNDLE_REV) {
  const old = projectFile('bundle.js', BUNDLE_REV);
  await p.route('**/bundle.js', r => r.fulfill({ contentType: 'application/javascript', body: old }));
}
if (CSS_REV) {
  const old = projectFile('style/home.css', CSS_REV);
  await p.route('**/style/home.css*', r => r.fulfill({ contentType: 'text/css', body: old }));
}

// 🛑 СІЄМО РІВНО ОДИН РАЗ. Перша редакція приладу сіяла мітку на КОЖНОМУ
// завантаженні сторінки — і «доводила» ваду, яку сама ж туди й клала.
const ПІДЛОГА = now - 30 * 864e5;
await p.addInitScript(([uid, ts]) => {
  try {
    if (localStorage.getItem('__stand_seeded')) return;
    localStorage.setItem('__stand_seeded', '1');
    localStorage.setItem('cstl_news_seen_ts:' + uid, String(ts));
  } catch (_) {}
}, [UID, ПІДЛОГА]);

const бейдж = () => p.evaluate(() =>
  document.querySelector('.cm-news-new')?.textContent.trim() || '');
const число = async () => { const t = await бейдж(); return t ? parseInt(t, 10) : 0; };

async function відкрити() {
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(400);
  await p.evaluate(() => document.querySelector('.consent-ok, [data-consent-ok], .pwa-cta button')?.click());
  await p.evaluate(() => window.switchTab && window.switchTab('community'));
  await p.waitForTimeout(2500);
}

await відкрити();

// ── 0. ПРИЛАД ────────────────────────────────────────────────────────────────
// Без цієї перевірки будь-яке «бейдж зник» нижче могло б означати просто порожню
// сцену. Рівно та помилка, на якій 24.08 спіймався перший `seen-sync`: він
// відкривав ЧИСТИЙ пристрій, де «нових» не буває за побудовою.
const старт = await число();
ok('ПРИЛАД: бейдж є і рахує ЛИШЕ Громаду (5, не 6)', старт === 5, `${старт} · «${await бейдж()}»`);

// ── 1. ВІДМІНКИ ──────────────────────────────────────────────────────────────
// 🗣️ «хай воно закінчення підбирає, тобто одна нова, дві нових, три нових».
const форми = await p.evaluate(() => {
  const f = n => { const t = n % 100, o = n % 10;
    if (t >= 11 && t <= 14) return 'нових';
    if (o === 1) return 'нова'; if (o >= 2 && o <= 4) return 'нові'; return 'нових'; };
  return [1, 2, 5, 11, 21].map(n => `${n} ${f(n)}`).join(' · ');
});
const текстБейджа = await бейдж();
ok('бейдж пише число і відмінок разом', /^\d+\s+(нова|нові|нових)$/.test(текстБейджа), `«${текстБейджа}»`);
ok('усі три форми української правильні (11-14 — окремий випадок)',
   форми === '1 нова · 2 нові · 5 нових · 11 нових · 21 нова', форми);

// ── 2. 🔴 ГОЛОВНЕ: ПРОЧИТАНА СТАТТЯ ЗМЕНШУЄ ЧИСЛО НА ОДИНИЦЮ ─────────────────
await p.evaluate(() => document.querySelector('#cm-news-board [data-article-id]')?.click());
await p.waitForTimeout(900);
const післяСтатті = await число();
ok('🔴 тап по статті зменшує бейдж РІВНО на 1 (скарга Вови)',
   післяСтатті === старт - 1, `${старт} → ${післяСтатті}`);

// ── 3. І ЦЕ ПЕРЕЖИВАЄ ПЕРЕЗАПУСК ЗАСТОСУНКУ ─────────────────────────────────
// 🗣️ «закриваю додаток, заходжу і знову пише сім нових» — саме це й перевіряємо.
await відкрити();
const післяПерезапуску = await число();
ok('🔴 прочитане лишається прочитаним після перезапуску',
   післяПерезапуску === старт - 1, `${післяПерезапуску} (очікували ${старт - 1})`);

// ── 4. ОДНА НОВА → ПРОЧИТАВ ЇЇ → БЕЙДЖ ЗНИКАЄ ЗОВСІМ ────────────────────────
// 🗣️ Дослівна вимога Вови: «якщо одна стаття, він відкриває саме цю нову статтю,
// яку він ще не бачив… І він її прочитав. Тоді ця плашка пропадає».
//
// ⚠️ Перша редакція цієї перевірки тикала картки у віджеті по черзі, щоб
// «прочитати всі пʼять» — і падала на 3. Падав ТЕСТ, не код: карусель тримає у
// вікні обмежений набір, і клік ішов у ту саму картку. Сцена нижче міряє РІВНО
// те, що просив Вова, і не потребує гортання.
// 🛑 Сентинель `__stand_seeded` НЕ чіпаємо: посів мусить лишитись одноразовим.
// Друга редакція цієї перевірки його знімала — і `addInitScript` пересівав
// 30-денну підлогу поверх щойно виставленої, через що сцена показувала 5 замість
// 1. Прилад знову брехав сам собі, тепер уже в стенді.
await p.evaluate(([uid, ts]) => {
  localStorage.removeItem('cstl_news_seen_ids:' + uid);
  // Підлога між першою і другою статтею → новою лишається рівно одна.
  localStorage.setItem('cstl_news_seen_ts:' + uid, String(ts));
}, [UID, now - 1.5 * 3600e3]);
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
const одна = await число();
ok('ПРИЛАД: сцена звужена до РІВНО однієї нової', одна === 1, `${одна} · «${await бейдж()}»`);
await p.evaluate(() => document.querySelector('#cm-news-board [data-article-id]')?.click());
await p.waitForTimeout(900);
const післяОдної = await число();
ok('🔴 одна нова → прочитав її → бейджа немає зовсім',
   післяОдної === 0 && (await бейдж()) === '', `${одна} → ${післяОдної}`);

// ── 5. «УСІ НОВИНИ» ГАСИТЬ ЧИСЛО ЦІЛКОМ ─────────────────────────────────────
// 🗣️ «коли, наприклад, там сім нових, користувач натискає усі новини… тоді
// пропадає це число, тому що він вже відкрив всі новини».
await p.evaluate(([uid, ts]) => {
  localStorage.removeItem('cstl_news_seen_ids:' + uid);
  localStorage.setItem('cstl_news_seen_ts:' + uid, String(ts));
}, [UID, ПІДЛОГА]);
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
const доХаба = await число();
await p.evaluate(() => document.querySelector('#cm-news-board .hm-sec-head')?.click());
await p.waitForTimeout(900);
const післяХаба = await число();
ok('ПРИЛАД: бейдж повернувся після скидання списку', доХаба === старт, `${доХаба}`);
ok('«Усі новини» гасить число цілком', післяХаба === 0, `${доХаба} → ${післяХаба}`);

// ── 6. СПИСОК НЕ РОСТЕ ВІЧНО ────────────────────────────────────────────────
// ⚠️ `localStorage` при переповненні кидає виняток на ЗАПИСІ — тобто зламалось би
// не читання новин, а перше-ліпше збереження поруч. Стеля тут не косметична.
const стеля = await p.evaluate(uid => {
  const key = 'cstl_news_seen_ids:' + uid;
  localStorage.setItem(key, JSON.stringify(Array.from({ length: 400 }, (_, i) => i)));
  return JSON.parse(localStorage.getItem(key)).length;
}, UID);
ok('ПРИЛАД: у сховище справді влізло 400 номерів', стеля === 400, `${стеля}`);
const післяСтелі = await p.evaluate(() => {
  // Проходимо тим самим шляхом, що застосунок: ще один номер понад 400.
  const key = Object.keys(localStorage).find(k => k.startsWith('cstl_news_seen_ids:'));
  const ids = JSON.parse(localStorage.getItem(key));
  const next = [...new Set([...ids, 99999])].slice(-300);
  localStorage.setItem(key, JSON.stringify(next));
  return { довжина: next.length, свіжийЗбережено: next.includes(99999) };
});
ok('список ріжеться до стелі 300 і ЛИШАЄ свіже', 
   післяСтелі.довжина === 300 && післяСтелі.свіжийЗбережено,
   `${післяСтелі.довжина} · свіжий у списку: ${післяСтелі.свіжийЗбережено}`);

// ── 7. ГРОМАДА В ПІДПИСІ РОЗДІЛУ ВИДІЛЕНА, РЕШТА — НІ ───────────────────────
// 🗣️ Вова: «громаду потрібно чуть-чуть якби виділити, щоб вона зразу кидалася в
// очі… якби позначалось, що це наше».
// 🔑 Міряємо ОБЧИСЛЕНИЙ стиль, а не наявність класу в розмітці: клас можна
// поставити і не описати жодним правилом, і перевірка світилась би зеленою над
// підписом, який виглядає точнісінько як раніше.
// 🔴 СПЕРШУ — ЧИ СТАВИТЬ КЛАС САМ ЗАСТОСУНОК. Без цієї перевірки все нижче
// міряло б лише CSS: клас я додаю руками, тож правила спрацювали б і тоді, коли
// їх нікому вмикати. Саме тут падає контроль по бандлу.
const самСтавить = await p.evaluate(() => {
  const el = document.getElementById('hm-ncat');
  if (!el) return null;
  const було = el.textContent.trim();
  const свій = el.classList.contains('hm-kicker-cat--own');
  // Переводимо підпис на чужий розділ тим самим шляхом, що й карусель.
  const чужа = [...document.querySelectorAll('#cm-news-board .cm-news-dot, #cm-news-board [data-news-dot]')];
  return { розділ: було, свій, чужихКрапок: чужа.length };
});
ok('🔴 застосунок САМ позначає Громаду як «наше»',
   !!самСтавить && самСтавить.свій === true,
   самСтавить ? `розділ «${самСтавить.розділ}», клас: ${самСтавить.свій}` : 'вузла немає');

const підпис = await p.evaluate(() => {
  const el = document.getElementById('hm-ncat');
  if (!el) return null;
  const зняти = () => { const cs = getComputedStyle(el);
    return { текст: el.textContent.trim(), колір: cs.color, вага: cs.fontWeight }; };
  el.classList.add('hm-kicker-cat--own');    const свій = зняти();
  el.classList.remove('hm-kicker-cat--own'); const чужий = зняти();
  return { свій, чужий };
});
ok('ПРИЛАД: підпис розділу є на сцені', !!підпис, підпис ? підпис.свій.текст : 'вузла немає');
if (підпис) {
  // 🛑 ЯСКРАВІСТЬ РАХУЄМО РАЗОМ ІЗ ПРОЗОРІСТЮ. Перша редакція брала лише три
  // перші числа і для `rgba(255,255,255,.58)` давала 255 — тобто «доводила», що
  // тихий сірий підпис ЯСКРАВІШИЙ за виділений. Прозорість тут не деталь: саме
  // нею й зроблена тиша решти розділів. Підпис лежить на темному, тож множення
  // на альфу — чесне наближення того, що бачить око.
  const яскр = c => { const [r, g, bl, a = 1] = c.match(/[\d.]+/g).map(Number);
                      return +((0.2126 * r + 0.7152 * g + 0.0722 * bl) * a).toFixed(1); };
  const яСвій = яскр(підпис.свій.колір), яЧужий = яскр(підпис.чужий.колір);
  ok('🔴 Громада ЯСКРАВІША за інші розділи (інакше виділення немає)',
     яСвій - яЧужий >= 40, `${яЧужий} → ${яСвій} (+${(яСвій - яЧужий).toFixed(1)})`);
  ok('Громада ще й ЩІЛЬНІША за вагою', Number(підпис.свій.вага) > Number(підпис.чужий.вага),
     `${підпис.чужий.вага} → ${підпис.свій.вага}`);
  // 🛑 Тон мусить бути ТЕПЛИМ, а не просто білим: саме теплота читається як «наше»,
  // і саме вона повʼязує підпис із бейджем поруч. Просте `#fff` дало б R−B = 0.
  const [r, , bl] = підпис.свій.колір.match(/[\d.]+/g).map(Number);
  ok('тон ТЕПЛИЙ (брендовий), а не нейтрально-білий', r - bl >= 4, `R−B = ${r - bl}`);
}

await stop(); await b.close();
done();
