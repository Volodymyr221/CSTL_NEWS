// tests/questions.mjs — ВКЛАДКА «ПИТАННЯ» (Q&A замість чату), 11.08.2026.
//
// 🔑 ЩО САМЕ МІРЯЄМО І ЧОМУ САМЕ ТАК.
//
// Замовлення Вови було НЕ про кольори, а про семантику: «щоб користувач за 1-2
// секунди зрозумів — тут можна поставити питання жителям громади». Тому стенд
// НЕ перевіряє наявність класів і не звіряє тексти з файлом. Він міряє ЧОТИРИ
// наслідки, які побачить людина:
//
//   1) на екрані є ВИДИМА головна дія зі словом «Запитати» — не схована у FAB;
//   2) картка списку каже «ЩО запитали · ХТО · КОЛИ · скільки відповідей», і
//      НЕ каже мовою чату (немає прев'ю останніх повідомлень і «N учасників»);
//   3) відкрите питання — це ЕКРАН із відповідями, а не месенджер: жодної
//      бульбашки `.pm-bubble`, жодного часу `HH:MM`, жодного «Написати
//      повідомлення…», і низ підписаний словом, а не стрілкою «↑»;
//   4) питання без відповіді видно як ЗАКЛИК («Ще ніхто не відповів»), а не як
//      мовчазний нуль — саме це має оживляти Q&A у малій громаді.
//
// 🔴 ЧОМУ ПУНКТ 3 СФОРМУЛЬОВАНО ЧЕРЕЗ ВІДСУТНІСТЬ. Бо в цьому й був корінь: до
// 11.08 екран мав правильні НАЗВИ («Обговорення») і при цьому чотири незалежні
// маркери месенджера. Перевірка «є заголовок Питання» пройшла б і на старому
// коді — тобто нічого не доводила б. Ловити треба саме те, чого не має бути.
//
// 🔴 КОНТРОЛЬ (обовʼязковий): на старому коді стенд МУСИТЬ упасти.
// Трьох змінних, а не однієї, бо зміна розкидана трьома шарами: логіка в
// `bundle.js`, вигляд у `style/board.css`, підпис вкладки та іконка — в
// `index.html`. Стенд, який підмінив би лише бандл, показав би зелень на
// старому таб-барі — і збрехав би рівно так само, як `sidebar-menu.mjs` до 10.08.
//
// ⚠️ КОНТРОЛІВ ДВА, і плутати їх не можна — вони доводять РІЗНЕ.
//   1) ВЕСЬ ПЕРЕХІД «чат → Q&A» (ревізія ДО 11.08, коли вкладка ще була чатом):
//        BUNDLE_REV=19f88243 CSS_REV=19f88243 HTML_REV=19f88243 node tests/questions.mjs
//      → **9/53**. Саме це число доводить, що стенд ловить модель, а не назви.
//   2) ОСТАННЯ ЗМІНА (підказка FAB), проти чинного `origin/main`:
//        BUNDLE_REV=origin/main CSS_REV=origin/main HTML_REV=origin/main …
//      → **51/53**: падають рівно `2в` (кнопка не згортається) і `2д` (підказка
//      грає щоразу). Дві перевірки — і саме ті дві, що описують нову поведінку.
// 🛑 `origin/main` уже містить редакцію 5, тож як контроль ПЕРЕХОДУ він більше
// не годиться і показував би оманливу зелень. Ревізію в пункті 1 не «освіжати».

import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();

const BUNDLE_REV = process.env.BUNDLE_REV || '';
const CSS_REV    = process.env.CSS_REV    || '';
const HTML_REV   = process.env.HTML_REV   || '';

// ── Дані: два питання. Одне з відповідями (зокрема вкладеною), одне без жодної.
// Саме пара, а не одне: інакше стан «без відповіді» нічим було б відрізнити від
// «список ще не намалювався».
const t0 = Date.now() - 5 * 864e5;
const POSTS = [
  { id: 701, type: 'chat', text: 'Коли буде концерт на День міста?', title: null,
    author: 'Олена', owner_uid: 'u-olena', status: 'published', location: null, tags: [],
    ts: t0, created_at: new Date(t0).toISOString(), published_at: new Date(t0).toISOString() },
  { id: 702, type: 'chat', text: 'Хтось знає, коли ремонтуватимуть дорогу в Митильному?', title: null,
    author: 'Петро', owner_uid: 'u-petro', status: 'published', location: null, tags: [],
    ts: t0 + 6e4, created_at: new Date(t0 + 6e4).toISOString(), published_at: new Date(t0 + 6e4).toISOString() },
];
const COMMENTS = [
  { id: 5001, post_id: 701, author: 'Віктор', text: 'Начебто 24 серпня.', sender_uid: 'u-viktor',
    reply_to_id: null, created_at: new Date(t0 + 36e5).toISOString(), edited_at: null, deleted_at: null, client_tag: null },
  { id: 5002, post_id: 701, author: 'Марія', text: 'Так, підтверджую — бачила афішу.', sender_uid: 'u-maria',
    reply_to_id: 5001, created_at: new Date(t0 + 40e5).toISOString(), edited_at: null, deleted_at: null, client_tag: null },
];

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();

// Підміна шарів для КОНТРОЛЬНОГО прогону (див. шапку). Без змінних — нічого не робимо.
if (BUNDLE_REV) {
  const old = projectFile('bundle.js', BUNDLE_REV);
  await p.route('**/bundle.js', r => r.fulfill({ contentType: 'application/javascript', body: old }));
}
if (CSS_REV) {
  const old = projectFile('style/board.css', CSS_REV);
  await p.route('**/style/board.css', r => r.fulfill({ contentType: 'text/css', body: old }));
}
if (HTML_REV) {
  const old = projectFile('index.html', HTML_REV);
  await p.route(url, r => r.fulfill({ contentType: 'text/html', body: old }));
  await p.route(url + '/', r => r.fulfill({ contentType: 'text/html', body: old }));
}

await mockSupabase(p, { posts: POSTS, comments: COMMENTS, announcements: [] },
                  { user: { id: 'u-me', name: 'Я' } });
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(300);
await p.evaluate(() => window.switchTab && window.switchTab('discussions'));
await p.waitForTimeout(1500);

// ── 1. ТАБ-БАР КАЖЕ «ПИТАННЯ» ────────────────────────────────────────────────
const tab = await p.evaluate(() => {
  // ⚠️ Селектор ОБОВʼЯЗКОВО `button.tab-item[...]`, а не просто `[data-tab=...]`.
  // Перша редакція цього стенда брала голий атрибут — і показала «підпис=«»,
  // шляхів=0» на цілком правильному коді: той самий `data-tab` носить ПУНКТ
  // БУРГЕР-МЕНЮ, а `<aside class="sidebar">` лежить у розмітці ВИЩЕ за таб-бар,
  // тож `querySelector` віддавав його. Черговий випадок «прилад бреше частіше за
  // код» — правило проєкту: якщо перевірка завалила те, що працює, першою
  // підозрюваною є перевірка.
  const btn = document.querySelector('button.tab-item[data-tab="discussions"]');
  return {
    підпис: btn?.querySelector('.tab-label')?.textContent.trim() || '',
    // 🔑 Міряємо не «скільки шляхів», а те, що іконка БІЛЬШЕ НЕ БУЛЬБАШКА чату.
    // Стара іконка мала два коротких горизонтальних штрихи (рядки тексту) —
    // саме вони й читались як «листування». Ловимо їх за формою шляху.
    // ⚠️ Перша редакція цієї перевірки рахувала шляхи (=3) — і зеленіла б на
    // будь-якій іншій іконці з трьох ліній, тобто нічого не доводила.
    шляхи: [...(btn?.querySelectorAll('.tab-icon path') || [])].map(x => x.getAttribute('d') || ''),
  };
});
ok('1а. таб-бар підписаний «Питання»', tab.підпис === 'Питання', `підпис=«${tab.підпис}»`);
// Бульбашку впізнаємо за «хвостиком» — ламаною, що виходить з кутка коробки
// (`l-5 3v-3` у старому шляху). Знак питання — за дугою гачка над крапкою.
const єБульбашка = tab.шляхи.some(d => /l-5 3v-3|l-5 3 v-3/.test(d));
const єЗнакПитання = tab.шляхи.some(d => /\.01/.test(d)) && tab.шляхи.length >= 2;
ok('1б. 🔴 іконка вкладки — НЕ бульбашка чату', !!tab.шляхи.length && !єБульбашка,
   єБульбашка ? 'знайдено хвостик бульбашки' : `шляхів: ${tab.шляхи.length}`);
ok('1в. в іконці є знак питання (крапка + гачок)', єЗнакПитання);

// ── 2. ГОЛОВНА ДІЯ ВИДИМА І ПІДПИСАНА ───────────────────────────────────────
// 🔑 Міряємо ВИДИМІСТЬ (`offsetParent` + розмір), а не наявність у DOM: саме на
// цьому вже спіткнувся `dev-lock.mjs` — `!!querySelector` казав «ок» там, де
// людина не бачила нічого.
//
// ⚠️ 11.08, РЕДАКЦІЯ 2 — ПЕРЕВІРКУ ПЕРЕНАЦІЛЕНО З МІСЦЯ НА ДІЮ.
// Була прив'язана до `[data-qa-ask]` — кнопки в бордовому банері згори. Банер
// прибрано (Вова: «фейсбук 2006»; прилад `qa-audit` показав 220px шапки і першу
// інформацію на 36% екрана), а дія переїхала у FAB, який ТЕПЕР ПІДПИСАНИЙ.
// Вимога лишилась та сама і не послабилась: головна дія мусить бути ВИДИМОЮ і
// названою ДІЄСЛОВОМ, а не ховатись за голим «+». Змінилось лише, де вона живе.
//
// 🔴 11.08, РЕДАКЦІЯ 7 — І ТУТ ПРИЛАД МАЛО НЕ ЗБРЕХАВ УП'ЯТНАДЦЯТЕ.
// Кнопка стала розгортатись лише на ПЕРШОМУ вході за запуск (замовлення Вови:
// «трошки завелика… анімовано розгортається, тримається декілька секунд і
// згортається»). Стенд після цієї зміни лишився ЗЕЛЕНИЙ 50/50 — але не тому, що
// поведінка правильна, а тому, що він міряв на 1500мс і випадково потрапляв у
// вікно підказки. Тобто перевірка «дія підписана» пройшла б і тоді, коли підпис
// не згортається взагалі, і тоді, коли він не показується вдруге — обидва
// сценарії їй однаково зелені.
// ➡️ Тому перевірка розкладена на ЧОТИРИ моменти часу, кожен зі своїм змістом:
//   2б  ПІД ЧАС підказки  — слово видно (голого «+» без пояснення не буває);
//   2в  ПІСЛЯ підказки    — кнопка знову КРУГ (це і є замовлення Вови);
//   2г  у згорнутому стані — дія все одно НАЗВАНА (aria-label), інакше вона
//                            зникає для читача екрана і для голосового керування;
//   2д  ДРУГИЙ вхід       — підказки більше немає («коли він вже в додатку і
//                            знов заходить туди, то це вже не потрібно»).
const ask = await p.evaluate(() => {
  const el = document.querySelector('#board-trigger');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const підпис = el.querySelector('.qa-fab-label');
  // 🔴 НЕ `offsetParent`. У елемента з `position: fixed` він ЗАВЖДИ `null` — тобто
  // перевірка «видно» завалила б будь-який FAB, хоч би як добре той виглядав.
  // Саме це й сталось із першою редакцією цієї перевірки: «висота=56px», а
  // висновок «кнопки немає». Міряємо те, що справді робить елемент невидимим.
  const реальноВидно = (n) => {
    while (n && n.nodeType === 1) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
      n = n.parentElement;
    }
    return true;
  };
  return {
    текст: (підпис?.textContent || el.getAttribute('aria-label') || '').trim(),
    ярлик: (el.getAttribute('aria-label') || '').trim(),
    підписВидно: !!підпис && реальноВидно(підпис) && підпис.getBoundingClientRect().width > 0,
    видно: реальноВидно(el) && r.height > 0 && r.top < window.innerHeight,
    висота: Math.round(r.height),
    ширина: Math.round(r.width),
    уНижнійПоловині: r.top > window.innerHeight / 2,   // зона великого пальця
  };
});
ok('2а. головна дія видима на екрані', !!ask && ask.видно,
   ask ? `висота=${ask.висота}px` : 'кнопки немає');
ok('2б. на ПЕРШОМУ вході вона підписана ДІЄСЛОВОМ, а не голим «+»',
   !!ask && ask.підписВидно && /Запитати/.test(ask.текст),
   ask ? `«${ask.текст}» ${ask.ширина}×${ask.висота}px` : '—');

// ── 2в-2г. ПІСЛЯ ПІДКАЗКИ кнопка згортається в круг, але лишається названою ───
// Чекаємо довше, ніж уся підказка: 420 (пауза) + 440 (розгортання) + 2600
// (утримання) + 440 (згортання) ≈ 3.9с від входу. Стенд стоїть тут уже ~1.5с,
// тож добираємо із запасом.
await p.waitForTimeout(3200);
const askПотім = await p.evaluate(() => {
  const el = document.querySelector('#board-trigger');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const п = el.querySelector('.qa-fab-label');
  return {
    ширина: Math.round(r.width), висота: Math.round(r.height),
    підписВидно: !!п && п.getBoundingClientRect().width > 0,
    ярлик: (el.getAttribute('aria-label') || '').trim(),
    широка: el.classList.contains('qa-fab-wide'),
  };
});
// 🔑 Міряємо КРУГЛІСТЬ (ширина ≈ висота), а не «немає класу»: клас можна лишити,
// а ширину протягти стилем звідки завгодно — людина побачить плашку, а стенд
// зелень. Допуск 2px — на субпіксельне округлення.
ok('2в. 🔴 через кілька секунд кнопка ЗГОРТАЄТЬСЯ назад у круг',
   !!askПотім && Math.abs(askПотім.ширина - askПотім.висота) <= 2 && !askПотім.широка,
   askПотім ? `${askПотім.ширина}×${askПотім.висота}px` : '—');
ok('2г. 🛑 згорнута кнопка все одно НАЗВАНА (для читача екрана й голосу)',
   !!askПотім && /Запитати/.test(askПотім.ярлик),
   askПотім ? `aria-label=«${askПотім.ярлик}»` : '—');

// ── 2д. ДРУГИЙ вхід у вкладку за той самий запуск — підказки вже немає ────────
// Пряма вимога Вови: «коли він вже в додатку і знов заходить туди, то це вже не
// потрібно робити». Виходимо на іншу вкладку і вертаємось тим самим шляхом, яким
// ходить людина (`switchTab`), а не смикаємо внутрішню функцію.
await p.evaluate(() => window.switchTab && window.switchTab('board'));
await p.waitForTimeout(500);
await p.evaluate(() => window.switchTab && window.switchTab('discussions'));
await p.waitForTimeout(1400);   // рівно те вікно, у якому підказка була б розгорнута
const askДругийВхід = await p.evaluate(() => {
  const el = document.querySelector('#board-trigger');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { ширина: Math.round(r.width), висота: Math.round(r.height),
           широка: el.classList.contains('qa-fab-wide') };
});
ok('2д. 🔴 на ДРУГОМУ вході підказка вже не програється',
   !!askДругийВхід && !askДругийВхід.широка &&
   Math.abs(askДругийВхід.ширина - askДругийВхід.висота) <= 2,
   askДругийВхід ? `${askДругийВхід.ширина}×${askДругийВхід.висота}px` : '—');
ok('2е. тап-ціль ≥ 44px (Apple HIG, аудиторія 40-70+)', !!ask && ask.висота >= 44,
   ask ? `${ask.висота}px` : '—');
ok('2ж. стоїть у нижній половині — зоні великого пальця', !!ask && ask.уНижнійПоловині);

// ── 3. КАРТКА — ПРО ПИТАННЯ, А НЕ ПРО ЧАТ ────────────────────────────────────
const card = await p.evaluate(() => {
  const el = document.querySelector('#disc-content [data-question-open="701"]');
  if (!el) return null;
  const cs = (sel) => el.querySelector(sel);
  const q = cs('.qa-card-q');
  return {
    питання: q?.textContent.trim() || '',
    розмірПитання: q ? parseFloat(getComputedStyle(q).fontSize) : 0,
    автор: cs('.qa-card-name')?.textContent.trim() || '',
    коли: !!cs('.qa-card-when'),
    відповіді: cs('.qa-row-n')?.textContent.trim() || '',
    // 🆕 редакція 3: перша відповідь показується прямо в списку.
    цитата: cs('.qa-row-answer')?.textContent.trim() || '',
    // ЧАТ-МАРКЕРИ, яких не має бути:
    превюЧату: !!cs('.bd-chat-last'),
    учасники: !!cs('.bd-chat-participants'),
    лайкНаКартці: !!cs('[data-like-id]'),
  };
});
ok('3а. картка показує сам текст питання', !!card && /концерт/i.test(card.питання),
   card ? `«${card.питання.slice(0, 40)}»` : 'картки немає');
ok('3б. питання — найбільший текст картки (≥16px)', !!card && card.розмірПитання >= 16,
   card ? `${card.розмірПитання}px` : '—');
ok('3в. є автор і час', !!card && !!card.автор && card.коли, card ? `автор=«${card.автор}»` : '—');
ok('3г. є кількість ВІДПОВІДЕЙ (мова Q&A, не «повідомлень»)',
   !!card && /відповід/i.test(card.відповіді) && !/повідомл/i.test(card.відповіді),
   card ? `«${card.відповіді}»` : '—');
// 🆕 РЕДАКЦІЯ 3: перша відповідь стоїть у СПИСКУ — щоб людина отримала відповідь,
// не відкриваючи нічого. ⚠️ Це НЕ повернення прев'ю чату (перевірка 3д нижче його
// далі забороняє): там були ДВА останні повідомлення з іменами й часом, тобто хід
// розмови; тут — ОДНА перша відповідь по суті питання.
ok('3ґ. 🆕 перша відповідь видно прямо в списку',
   !!card && /Начебто 24 серпня/.test(card.цитата),
   card ? `«${card.цитата.slice(0, 46)}»` : '—');
ok('3д. 🔴 НЕМА прев\'ю останніх повідомлень (розмітка списку чатів)',
   !!card && !card.превюЧату);
ok('3е. 🔴 НЕМА лічильника «учасників» (метрика чату)', !!card && !card.учасники);
ok('3є. ❤️ прибрано з картки (переїхало всередину як «мене теж цікавить»)',
   !!card && !card.лайкНаКартці);

// ── 4. ПИТАННЯ БЕЗ ВІДПОВІДІ — ЗАКЛИК, А НЕ МОВЧАЗНИЙ НУЛЬ ───────────────────
const none = await p.evaluate(() => {
  const el = document.querySelector('#disc-content [data-question-open="702"]');
  if (!el) return null;
  const c = el.querySelector('.qa-row-n');
  return { текст: c?.textContent.trim() || '', позначка: el.classList.contains('qa-row--unanswered') };
});
ok('4а. без відповідей показано словами, а не «0»',
   !!none && /потрібна відповідь/i.test(none.текст) && !/\b0\b/.test(none.текст),
   none ? `«${none.текст}»` : '—');
ok('4б. картка має власну позначку стану', !!none && none.позначка);

// ── 5. ВІДКРИТЕ ПИТАННЯ — ЕКРАН, А НЕ МЕСЕНДЖЕР ──────────────────────────────
await p.evaluate(() => document.querySelector('[data-question-open="701"]')?.click());
await p.waitForTimeout(900);

const screen = await p.evaluate(() => {
  const s = document.querySelector('.qa-screen');
  if (!s) return null;
  const r = s.getBoundingClientRect();
  const inp = s.querySelector('.qa-input');
  const send = s.querySelector('.qa-send');
  return {
    наВесьЕкран: Math.round(r.width) >= window.innerWidth - 1 && Math.round(r.height) >= window.innerHeight - 1,
    заголовок: s.querySelector('.qa-head-title')?.textContent.trim() || '',
    питання: s.querySelector('.qa-question-text')?.textContent.trim() || '',
    розмірПитання: (() => { const q = s.querySelector('.qa-question-text'); return q ? parseFloat(getComputedStyle(q).fontSize) : 0; })(),
    цікавить: s.querySelector('.qa-interest')?.textContent.replace(/\s+/g, ' ').trim() || '',
    відповідей: s.querySelectorAll('.qa-answer').length,
    вкладених: s.querySelectorAll('.qa-answer--sub').length,
    кнопкаВідповісти: !!s.querySelector('[data-answer-reply]'),
    плейсхолдер: inp?.getAttribute('placeholder') || '',
    розмірПоля: inp ? parseFloat(getComputedStyle(inp).fontSize) : 0,
    підписКнопки: send?.textContent.trim() || '',
    // МЕСЕНДЖЕР-МАРКЕРИ, яких не має бути:
    бульбашки: s.querySelectorAll('.pm-bubble').length,
    роздільникиДнів: s.querySelectorAll('.pm-daysep').length,
    пігулкаНових: !!s.querySelector('.bd-chat-newpill'),
    годинник: /\b\d{2}:\d{2}\b/.test(s.querySelector('.qa-answers')?.textContent || ''),
  };
});
ok('5а. відкрився ПОВНОЕКРАННИЙ шар, а не модалка поверх сторінки',
   !!screen && screen.наВесьЕкран);
ok('5б. шапка називає екран «Питання»', !!screen && screen.заголовок === 'Питання',
   screen ? `«${screen.заголовок}»` : '—');
ok('5в. питання — найбільший текст екрана (≥20px)', !!screen && screen.розмірПитання >= 20,
   screen ? `${screen.розмірПитання}px` : '—');
ok('5г. є «Мене теж цікавить» (замість лайка теми)',
   !!screen && /Мене теж цікавить/i.test(screen.цікавить), screen ? `«${screen.цікавить}»` : '—');
ok('5д. відповіді намальовані (2 з фікстури)', !!screen && screen.відповідей === 2,
   screen ? `${screen.відповідей}` : '—');
ok('5е. вкладена відповідь показана з відступом, а не цитатою в бульбашці',
   !!screen && screen.вкладених === 1, screen ? `вкладених=${screen.вкладених}` : '—');
ok('5є. «Відповісти» — ЯВНА кнопка, а не прихований свайп', !!screen && screen.кнопкаВідповісти);
ok('5ж. поле підписане «Ваша відповідь…», не «Написати повідомлення…»',
   !!screen && /Ваша відповідь/i.test(screen.плейсхолдер) && !/повідомлення/i.test(screen.плейсхолдер),
   screen ? `«${screen.плейсхолдер}»` : '—');
ok('5з. кнопка надсилання підписана СЛОВОМ, а не стрілкою «↑»',
   !!screen && /Надіслати/.test(screen.підписКнопки) && !/[↑➤]/.test(screen.підписКнопки),
   screen ? `«${screen.підписКнопки}»` : '—');
ok('5и. поле вводу ≥16px (менше — iOS зумить сторінку на фокусі)',
   !!screen && screen.розмірПоля >= 16, screen ? `${screen.розмірПоля}px` : '—');
ok('5к. 🔴 НЕМА бульбашок чату', !!screen && screen.бульбашки === 0,
   screen ? `знайдено ${screen.бульбашки}` : '—');
ok('5л. 🔴 НЕМА роздільників днів «Сьогодні/Вчора»', !!screen && screen.роздільникиДнів === 0);
ok('5м. 🔴 НЕМА пігулки «N нових повідомлень»', !!screen && !screen.пігулкаНових);
ok('5н. 🔴 НЕМА годинникового часу HH:MM у відповідях', !!screen && !screen.годинник);

// ── 6. ЗАКРИТТЯ ЙДЕ ЧЕРЕЗ ІСТОРІЮ (системний жест «назад» на iPhone) ────────
// 🔑 Міряємо не «зникло», а ЧИМ зникло: якщо екран прибирається без запису в
// історії, системний жест зʼїсть чужий запис і винесе людину з вкладки — саме
// цей клас багів і закриває `core/layers.js`.
const beforeLen = await p.evaluate(() => history.length);
await p.goBack();
await p.waitForTimeout(700);
const afterClose = await p.evaluate(() => ({
  екранЗник: !document.querySelector('.qa-screen'),
  вкладка: document.querySelector('.app-main')?.dataset.tab || '',
}));
ok('6а. системний жест «назад» закриває екран питання', afterClose.екранЗник,
   `history.length було ${beforeLen}`);
ok('6б. і НЕ виносить людину з вкладки', afterClose.вкладка === 'discussions',
   `вкладка=${afterClose.вкладка}`);

// ── 7. ФОРМА СТВОРЕННЯ ПИТАЄ ПРО ПИТАННЯ, А НЕ ПРО «ТЕМУ» ───────────────────
// Шлях той самий, що в людини: тап по FAB → пункт «Запитати громаду» в меню.
await p.evaluate(() => document.querySelector('#board-trigger')?.click());
await p.waitForTimeout(400);
await p.evaluate(() => document.querySelector('[data-fab="disc-create"]')?.click());
await p.waitForTimeout(900);
const compose = await p.evaluate(() => {
  const w = document.querySelector('.app-modal--disc');
  if (!w) return null;
  return {
    заголовок: w.querySelector('.disc-sheet-title')?.textContent.trim() || '',
    мітка: w.querySelector('.disc-compose-label')?.textContent.trim() || '',
    плейсхолдер: w.querySelector('.disc-compose-input')?.getAttribute('placeholder') || '',
    кнопка: w.querySelector('.disc-compose-submit')?.textContent.trim() || '',
    підказка: w.querySelector('.disc-compose-hint')?.textContent.trim() || '',
    полів: w.querySelectorAll('.disc-compose input, .disc-compose textarea, .disc-compose select').length,
  };
});
ok('7а. аркуш зветься «Запитати громаду»', !!compose && /Запитати громаду/i.test(compose.заголовок),
   compose ? `«${compose.заголовок}»` : 'аркуша немає');
ok('7б. питає «Що ви хочете дізнатись?», а не «Тема обговорення»',
   !!compose && /дізнатись/i.test(compose.мітка) && !/тема/i.test(compose.мітка),
   compose ? `«${compose.мітка}»` : '—');
ok('7в. кнопка — «Запитати громаду», не «Створити»',
   !!compose && /Запитати громаду/i.test(compose.кнопка), compose ? `«${compose.кнопка}»` : '—');
ok('7г. є живий приклад питання (для тих, хто не знає, що писати)',
   !!compose && compose.підказка.length > 10, compose ? `«${compose.підказка}»` : '—');
ok('7д. 🔑 поле РІВНО ОДНЕ — подати питання швидше, ніж оголошення',
   !!compose && compose.полів === 1, compose ? `полів=${compose.полів}` : '—');

// ── 7.5 🔴 «ХТО КОМУ НАПИСАВ» — ВИДНО БЕЗ ЗДОГАДОК (редакція 5) ─────────────
//
// Скарга Вови: «коли відкриваю карточку запитання, я не до кінця розумію, що, хто,
// кому написав, чи це якісь нові карточки… це геть незрозуміло».
// 🔑 Причина була в тому, що кожна відповідь малювалась ОКРЕМОЮ БІЛОЮ КАРТКОЮ з
// тінню — тобто читалась як самостійний обʼєкт, а не як репліка під питанням.
// Вкладеність показував лише відступ, зв'язку «хто кому» не було взагалі.
// Виправлено за патерном коментарів «Стрічки», який Вова вже приймав.
//
// Міряємо ТРИ наслідки, а не класи:
//   1) відповідь — НЕ картка (немає власної білої підкладки й тіні);
//   2) вкладена має ЛІНІЮ-ЗВʼЯЗУВАЧ до батьківської;
//   3) якщо відповідають ІНШІЙ людині — її імʼя стоїть на початку тексту.
await p.evaluate(() => document.querySelector('[data-question-open="701"]')?.click());
await p.waitForTimeout(1000);

const репліки = await p.evaluate(() => {
  const корінь = document.querySelector('.qa-thread > .qa-answer');
  const вкладена = document.querySelector('.qa-branch .qa-answer');
  const гілка = document.querySelector('.qa-branch');
  if (!корінь) return null;
  const cs = getComputedStyle(корінь);
  const прозорий = (c) => !c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent';
  const лінія = гілка ? getComputedStyle(гілка, '::before') : null;
  return {
    безПідкладки: прозорий(cs.backgroundColor),
    безТіні: cs.boxShadow === 'none',
    аватарЗліва: !!корінь.querySelector('.qa-answer-ava'),
    імʼя: корінь.querySelector('.qa-answer-name')?.textContent.trim() || '',
    єВкладена: !!вкладена,
    відступГілки: гілка ? Math.round(parseFloat(getComputedStyle(гілка).marginLeft)) : 0,
    лініяЄ: !!лінія && parseFloat(лінія.borderLeftWidth) > 0,
    згадка: вкладена?.querySelector('.qa-answer-to')?.textContent.trim() || '',
    загадковеЩе: !!document.querySelector('.qa-answer-more'),
  };
});
ok('7.5а. 🔴 відповідь — репліка, а НЕ картка (без підкладки й тіні)',
   !!репліки && репліки.безПідкладки && репліки.безТіні,
   репліки ? `фон прозорий=${репліки.безПідкладки} тінь=${репліки.безТіні}` : 'відповідей немає');
ok('7.5б. аватар автора стоїть при репліці (видно, ХТО написав)',
   !!репліки && репліки.аватарЗліва && репліки.імʼя.length > 0,
   репліки ? `«${репліки.імʼя}»` : '—');
ok('7.5в. 🔴 вкладена відповідь має відступ І лінію-звʼязувач (видно, ЩО це відповідь)',
   !!репліки && репліки.єВкладена && репліки.відступГілки >= 30 && репліки.лініяЄ,
   репліки ? `відступ=${репліки.відступГілки}px лінія=${репліки.лініяЄ}` : '—');
ok('7.5г. 🛑 немає кнопки «Ще» — усі дії підписані словами',
   !!репліки && !репліки.загадковеЩе);

await p.goBack();
await p.waitForTimeout(600);

// ── 8. 🔴 МЕЖІ ВІЗУАЛЬНОЇ ВАГИ (заведено 11.08 після відмови Вови) ───────────
//
// Першу редакцію вкладки Вова відхилив словами «це не схоже на стиль Apple, це
// схоже на щось на фейсбук 2006 року». Прилад `tests/tools/qa-audit.mjs` показав,
// що саме за цим стояло — і ці ж числа стають межами, щоб воно не повернулось:
//
//   ліній і рамок у першому екрані ... 43 → 4
//   різних кольорів тексту .......... 7  → 4
//   перша інформація ................ 36% екрана → 25%
//   тап-цілі < 44px ................. 6  → 0
//
// 🔑 Чому саме ці три числа, а не «схоже на Apple». «Схожість» перевірити
// неможливо, а ці величини — прямі наслідки того способу верстки, який дав
// відмову: ієрархія лініями і кольоровими плитами замість простору й тону.
// Межі поставлені з запасом до чинних значень, щоб дрібне доопрацювання їх не
// валило, але повернення банера чи рамок на картках — валило одразу.
// ⚠️ Рахуємо ЛИШЕ ВИДИМЕ: перша редакція приладу цього не робила і нарахувала
// 28 ліній, з яких усі лежали в ЗАКРИТОМУ меню FAB.
await p.evaluate(() => document.querySelector('.pm-actions-cancel, .app-modal-close')?.click());
await p.waitForTimeout(400);
await p.evaluate(() => { const l = document.querySelector('.qa-screen'); if (l) history.back(); });
await p.waitForTimeout(500);

const вага = await p.evaluate(() => {
  const H = window.innerHeight;
  const видно = (el) => {
    let n = el;
    while (n && n.nodeType === 1) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
      if (n.hasAttribute && n.hasAttribute('hidden')) return false;
      n = n.parentElement;
    }
    return true;
  };
  let ліній = 0;
  const кольори = new Set();
  const дрібні = [];
  for (const el of document.querySelectorAll('#disc-content *')) {
    const r = el.getBoundingClientRect();
    if (r.top > H || r.bottom < 0 || !видно(el)) continue;
    const s = getComputedStyle(el);
    if (r.width >= 2) {
      for (const side of ['Top','Right','Bottom','Left']) {
        if (parseFloat(s['border' + side + 'Width']) > 0
            && s['border' + side + 'Color'] !== 'rgba(0, 0, 0, 0)'
            && s.borderStyle !== 'none') ліній++;
      }
    }
    if ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) кольори.add(s.color);
  }
  for (const el of document.querySelectorAll('#disc-content button, #disc-content input')) {
    const r = el.getBoundingClientRect();
    if (r.top > H || r.bottom < 0 || !r.width || !видно(el)) continue;
    if (r.height < 44) дрібні.push(`${el.className.split(' ')[0]} ${Math.round(r.height)}px`);
  }
  const перша = document.querySelector('#disc-content [data-question-open]');
  return {
    ліній, кольорів: кольори.size, дрібні,
    доІнформації: перша ? Math.round(перша.getBoundingClientRect().top / H * 100) : 100,
  };
});
ok('8а. 🔴 видимих ліній і рамок ≤ 8 (у відхиленій редакції було 43)',
   вага.ліній <= 8, `${вага.ліній}`);
ok('8б. 🔴 різних кольорів тексту ≤ 5 (було 7 — розкид читається як «наосліп»)',
   вага.кольорів <= 5, `${вага.кольорів}`);
// ⚠️ 11.08, редакція 4 — МЕЖУ ПІДНЯТО з 30% до 33%, і ось чому це не підгонка
// під зелене. Вова прямо попросив додати коротке пояснення розділу («незрозуміло
// для чого це і що… треба якусь інструкцію, може таку мінімальну, в одне речення
// чи в два») — два рядки тексту коштують ~44px, тобто 5% екрана. Це ЗМІСТ, який
// замовлено, а не роздування шапки.
// 🛑 Межа 33%, а не «скільки вийде»: банер редакції 1 давав **36%**, і цей шлях
// лишається закритим. Тобто перевірка й далі ловить рівно те, від чого йшли, але
// не б'є по замовленій інструкції.
ok('8в. 🔴 перша картка вище 33% екрана (банер редакції 1 давав 36%)',
   вага.доІнформації <= 33, `${вага.доІнформації}%`);
ok('8г. 🔴 жодної тап-цілі < 44px (було 6)',
   вага.дрібні.length === 0, вага.дрібні.join(' · ') || 'усі ≥ 44px');

// ── 9. 🔴 РОЗДІЛ ПОЯСНЮЄ СЕБЕ СЛОВАМИ (замовлення Вови, редакція 4) ─────────
// Претензія «незрозуміло, що це і для чого» звучала ТРИЧІ, і три рази її лікували
// ВИГЛЯДОМ — банером, типографікою, щільністю списку. Не спрацювало жодного разу.
// Вова назвав рішення сам: коротка інструкція в одне-два речення.
// 🔑 Міряємо і НАЯВНІСТЬ, і ДОВЖИНУ: пояснення, що розповзлося на пів екрана, —
// це знову банер, тільки текстом (перша спроба зайняла 4 рядки і відсунула перше
// питання на 36%).
const пояснення = await p.evaluate(() => {
  const el = document.querySelector('#disc-content .qa-hero-note');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
  return { текст: el.textContent.trim(), рядків: Math.round(r.height / lh),
           висота: Math.round(r.height) };
});
ok('9а. 🔴 під заголовком є коротке пояснення, ЩО це за розділ',
   !!пояснення && пояснення.текст.length > 30,
   пояснення ? `«${пояснення.текст}»` : 'пояснення немає');
ok('9б. воно каже і про питання, і про допомогу (обидві ролі людини)',
   !!пояснення && /питайте|запита/i.test(пояснення.текст) && /допомож|відповід/i.test(пояснення.текст));
ok('9в. 🛑 не більше 2 рядків — інакше це знову банер, тільки текстом',
   !!пояснення && пояснення.рядків <= 2, пояснення ? `${пояснення.рядків} ряд. / ${пояснення.висота}px` : '—');

// ── 10. Рядок стану: скільки питань і скільки чекає допомоги ────────────────
const стан = await p.evaluate(() => {
  const el = document.querySelector('#disc-content .qa-hero-count');
  return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
});
ok('10. під пошуком видно, скільки питань і скільки без відповіді',
   !!стан && /\d+ питанн/.test(стан) && /без відповіді/.test(стан), стан || '—');

// ── 11. ПОВНИЙ СПИСОК: скільки екрана шапка займає НАЗАВЖДИ ─────────────────
//
// 🔴 ЧОМУ ЦЕ ОКРЕМИЙ СЦЕНАРІЙ, А НЕ ЩЕ ОДНА ПЕРЕВІРКА ВГОРІ.
// Усе вище міряється на фікстурі з ДВОХ питань. А біда, яку Вова побачив на
// проді, починається з ВОСЬМИ: саме там вмикаються чіпи (`QA_CHIPS_FROM`), і
// шапка доростає до 242px = **38% екрана**. Тобто стенд був зелений 53/53 рівно
// тому, що ЙОГО СЦЕНАРІЙ не збігався з життям — а перевірка «перша картка вище
// 33%» (8в) навіть існувала і показувала 31%.
// 🔑 Це вже **шістнадцятий** випадок брехливої мірки в проєкті, і найтихіший з
// усіх: прилад не помилявся в обчисленні — він міряв не ту сцену.
// ⚠️ Тому тут піднімається ОКРЕМИЙ браузер із 12 питаннями: підмінити дані на
// вже відкритій сторінці не можна, заглушка вшита в маршрут при старті.
const БАГАТО = Array.from({ length: 12 }, (_, i) => ({
  id: 800 + i, type: 'chat', text: `Питання номер ${i + 1} про життя громади?`,
  title: null, author: 'Іван', owner_uid: null, status: 'published', location: null, tags: [],
  ts: t0 + i * 6e4, created_at: new Date(t0 + i * 6e4).toISOString(),
  published_at: new Date(t0 + i * 6e4).toISOString(),
}));
// Відповіді лише на частину — інакше «без відповіді» = 0 і чіпи не вмикаються.
const ВІДПОВІДІ = БАГАТО.slice(0, 8).map((q, i) => ({
  id: 8100 + i, post_id: q.id, author: 'Галина', text: 'Бачила оголошення на дошці біля магазину.',
  sender_uid: 'u-g', reply_to_id: null, created_at: new Date(t0 + 36e5).toISOString(),
  edited_at: null, deleted_at: null, client_tag: null,
}));

const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                  hasTouch: true, serviceWorkers: 'block' });
const p2 = await ctx2.newPage();
if (BUNDLE_REV) {
  const old = projectFile('bundle.js', BUNDLE_REV);
  await p2.route('**/bundle.js', r => r.fulfill({ contentType: 'application/javascript', body: old }));
}
if (CSS_REV) {
  const old = projectFile('style/board.css', CSS_REV);
  await p2.route('**/style/board.css', r => r.fulfill({ contentType: 'text/css', body: old }));
}
await mockSupabase(p2, { posts: БАГАТО, comments: ВІДПОВІДІ, announcements: [] },
                  { user: { id: 'u-me', name: 'Я' } });
await p2.route('**://api.open-meteo.com/**', r => r.abort());
await p2.goto(url, { waitUntil: 'domcontentloaded' });
await p2.waitForTimeout(2500);
await p2.evaluate(() => document.querySelector('.consent-accept')?.click());
await p2.waitForTimeout(300);
await p2.evaluate(() => window.switchTab && window.switchTab('discussions'));
await p2.waitForTimeout(4600);   // перечекати підказку FAB, щоб вона не заважала мірці

const повний = await p2.evaluate(() => {
  const шапка = document.querySelector('#disc-content .bd-controls');
  const тіло  = document.querySelector('#disc-content .bd-body') || document.querySelector('.bd-body');
  const карта = document.querySelector('[data-question-open]');
  const чіпи  = document.querySelector('#disc-content .qa-chips');
  const лічильник = document.querySelector('#disc-content .qa-hero-count');
  return {
    екран: window.innerHeight,
    шапка: шапка ? Math.round(шапка.getBoundingClientRect().height) : null,
    картка: карта ? Math.round(карта.getBoundingClientRect().top) : null,
    чіпиЄ: !!чіпи,
    чіпиТекст: чіпи ? чіпи.textContent.replace(/\s+/g, ' ').trim() : '',
    лічильникТекст: лічильник ? лічильник.textContent.replace(/\s+/g, ' ').trim() : '',
    скролер: !!тіло,
  };
});
ok('11а. перша картка вище 33% екрана і при ПОВНОМУ списку',
   !!повний.картка && повний.картка < повний.екран * 0.33,
   `${повний.картка}px = ${Math.round(100 * повний.картка / повний.екран)}%`);
// Дублювання числа — окрема претензія Вови: «без відповіді 4» стояло і в чіпі,
// і в рядку під пошуком, за 60px одне від одного.
ok('11б. 🛑 число «без відповіді» НЕ друкується двічі',
   повний.чіпиЄ && !/без відповіді/i.test(повний.лічильникТекст),
   `чіпи: «${повний.чіпиТекст}» · лічильник: «${повний.лічильникТекст || '—'}»`);

// 🔴 ГОЛОВНА ПЕРЕВІРКА ЦЬОГО БЛОКА: скільки екрана шапка займає ПІД ЧАС ПРОКРУТКИ.
//
// Саме це, а не її висота, було скаргою Вови: «дуже багато місця займає оце все
// зверху, а знизу там десь скроляться карточки». Шапка може бути якою завгодно
// заввишки на першому кадрі — важливо, щоб вона не з'їдала екран у КОЖНОМУ
// наступному. Тому міряємо не `height`, а скільки її ЛИШИЛОСЬ у видимій зоні
// після прокрутки. Було: 242px назавжди (шапка `fixed`). Стало: 0.
// ⚠️ Перша редакція цієї перевірки міряла саме висоту («≤130px») — і завалила б
// правильне рішення: шапка з заголовком усередині вища за 130, але при цьому
// їде геть цілком. Мірка мусить описувати НАСЛІДОК, а не спосіб його досягти.
const післяПрокрутки = await p2.evaluate(async () => {
  const скролер = (() => {
    let n = document.querySelector('#disc-content .bd-body') || document.querySelector('.bd-body');
    while (n && n !== document.body) { if (n.scrollHeight > n.clientHeight + 10) return n; n = n.parentElement; }
    return document.scrollingElement || document.documentElement;
  })();
  const назва = () => document.querySelector('#disc-content .qa-hero-title')?.getBoundingClientRect().top ?? null;
  const до = назва();
  скролер.scrollTop = 600;
  await new Promise(r => setTimeout(r, 450));
  const шапка = document.querySelector('#disc-content .bd-controls');
  const r = шапка ? шапка.getBoundingClientRect() : null;
  const верхЗони = (document.querySelector('.app-header')?.getBoundingClientRect().bottom) ?? 0;
  return {
    до: до === null ? null : Math.round(до),
    після: назва() === null ? null : Math.round(назва()),
    // Скільки шапки видно нижче шапки застосунку — тобто скільки вона реально їсть.
    видноШапки: r ? Math.max(0, Math.round(r.bottom - верхЗони)) : null,
  };
});
ok('11в. 🔴 при прокрутці шапка НЕ їсть екран (було 242px назавжди)',
   післяПрокрутки.видноШапки !== null && післяПрокрутки.видноШапки <= 8,
   `видно ${післяПрокрутки.видноШапки}px`);
ok('11г. заголовок і пояснення їдуть геть разом із нею',
   післяПрокрутки.до !== null && післяПрокрутки.після !== null &&
   післяПрокрутки.після < післяПрокрутки.до - 100,
   `було ${післяПрокрутки.до}px → стало ${післяПрокрутки.після}px`);

await stop();
await b.close();
done();
