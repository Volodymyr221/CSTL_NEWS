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
//     BUNDLE_REV=origin/main CSS_REV=origin/main HTML_REV=origin/main node tests/questions.mjs
// Трьох змінних, а не однієї, бо зміна розкидана трьома шарами: логіка в
// `bundle.js`, вигляд у `style/board.css`, підпис вкладки та іконка — в
// `index.html`. Стенд, який підмінив би лише бандл, показав би зелень на
// старому таб-барі — і збрехав би рівно так само, як `sidebar-menu.mjs` до 10.08.

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
    // Знак питання в іконці — окремий шлях у svg. Міряємо КІЛЬКІСТЬ шляхів і те,
    // що серед них немає двох горизонтальних рисок «рядків тексту» старої іконки.
    шляхів: btn?.querySelectorAll('.tab-icon path').length || 0,
  };
});
ok('1а. таб-бар підписаний «Питання»', tab.підпис === 'Питання', `підпис=«${tab.підпис}»`);
ok('1б. іконка вкладки перемальована (3 шляхи: бульбашка + гачок + крапка)',
   tab.шляхів === 3, `шляхів=${tab.шляхів}`);

// ── 2. ГОЛОВНА ДІЯ ВИДИМА НА ЕКРАНІ, А НЕ СХОВАНА У FAB ─────────────────────
// 🔑 Міряємо ВИДИМІСТЬ (`offsetParent` + розмір), а не наявність у DOM: саме на
// цьому вже спіткнувся `dev-lock.mjs` — `!!querySelector` казав «ок» там, де
// людина не бачила нічого.
const ask = await p.evaluate(() => {
  const el = document.querySelector('#disc-content [data-qa-ask]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { текст: el.textContent.trim(), видно: !!el.offsetParent && r.height > 0,
           висота: Math.round(r.height), верх: Math.round(r.top) };
});
ok('2а. на екрані є видима головна кнопка дії', !!ask && ask.видно,
   ask ? `висота=${ask.висота}px верх=${ask.верх}px` : 'кнопки немає');
ok('2б. вона підписана дієсловом «Запитати»', !!ask && /Запитати/.test(ask.текст),
   ask ? `«${ask.текст}»` : '—');
ok('2в. тап-ціль ≥ 44px (Apple HIG, аудиторія 40-70+)', !!ask && ask.висота >= 44,
   ask ? `${ask.висота}px` : '—');

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
    відповіді: cs('.qa-card-count')?.textContent.trim() || '',
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
ok('3д. 🔴 НЕМА прев\'ю останніх повідомлень (розмітка списку чатів)',
   !!card && !card.превюЧату);
ok('3е. 🔴 НЕМА лічильника «учасників» (метрика чату)', !!card && !card.учасники);
ok('3є. ❤️ прибрано з картки (переїхало всередину як «мене теж цікавить»)',
   !!card && !card.лайкНаКартці);

// ── 4. ПИТАННЯ БЕЗ ВІДПОВІДІ — ЗАКЛИК, А НЕ МОВЧАЗНИЙ НУЛЬ ───────────────────
const none = await p.evaluate(() => {
  const el = document.querySelector('#disc-content [data-question-open="702"]');
  if (!el) return null;
  const c = el.querySelector('.qa-card-count');
  return { текст: c?.textContent.trim() || '', позначка: el.classList.contains('qa-card--unanswered') };
});
ok('4а. без відповідей показано словами, а не «0»',
   !!none && /Ще ніхто не відповів/i.test(none.текст) && !/\b0\b/.test(none.текст),
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
await p.evaluate(() => document.querySelector('#disc-content [data-qa-ask]')?.click());
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

await stop();
await b.close();
done();
