// tests/board-rules.mjs — ГЕЙТ ПРАВИЛ ДОШКИ + блок безпеки в оголошенні.
//
// НАВІЩО (замовлення Вови 03.08): «коротке попередження в кожному оголошенні та окреме
// "Правила користування дошкою", які користувач приймає один раз».
//
// 🔑 ЩО САМЕ МІРЯЄМО І ЧОМУ САМЕ ТАК.
// Не наявність класів і не текст у файлі, а ТРИ наслідки, які побачить людина:
//   1) вікно не можна відхилити нічим, крім кнопки — бо «ознайомився» не має
//      перетворюватись на «змахнув, не читаючи»;
//   2) після прийняття воно більше не приходить — інакше це не гейт, а набридання;
//   3) блок безпеки в оголошенні став змістовнішим, але НЕ вищим (пряма вимога).
// Пункт 3 має КОНТРОЛЬ на старих значеннях: без нього «89px» нічого не доводить.

import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { ok, done } = reporter();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const ts = Date.now() - 3 * 864e5;
const POSTS = [{
  id: 901, type: 'board', category: 'продам', title: 'ПРОДАМ БУДИНОК',
  text: 'Будинок у Жорнищі, ділянка 25 соток, поруч ліс.',
  photos: [], price: null, currency: 'UAH', location: 'Жорнище',
  author: 'Тест', owner_uid: 'u1', status: 'published', ts,
  created_at: new Date(ts).toISOString(), bumped_at: new Date(ts).toISOString(),
}];

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
// 🔴 05.08: стенд більше НЕ покладається на демо-фолбек у `data/` — той
// показував вигадані телефони живим людям і його прибрано. Оголошення тепер
// підставляє явна фікстура (розбір — у `tests/_board-fixture.mjs`).
await mockSupabase(p, { posts: POSTS, announcements: [] });
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.evaluate(() => window.switchTab && window.switchTab('board'));
await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(600);

// ── 1. ГЕЙТ ПРИЙШОВ ПРИ ПЕРШОМУ ВХОДІ ───────────────────────────────────────
const gate = await p.evaluate(() => {
  const w = document.querySelector('.app-modal--brules');
  if (!w) return null;
  const sheet = w.querySelector('.app-modal-sheet');
  return {
    заголовок: w.querySelector('.app-modal-title')?.textContent || '',
    пунктів: w.querySelectorAll('.brules-list li').length,
    кнопка: w.querySelector('.brules-ok')?.textContent.trim() || '',
    хрестик: !!w.querySelector('.app-modal-close'),
    рисочка: !!w.querySelector('.app-modal-handle'),
    діалог: sheet?.getAttribute('role') || '',
    модальний: sheet?.getAttribute('aria-modal') || '',
  };
});
ok('вікно правил приходить при першому вході на Дошку', !!gate, gate ? 'є' : 'НЕ прийшло');
ok('заголовок правильний', gate?.заголовок === 'Правила безпечного користування дошкою', gate?.заголовок);
ok('усі 7 пунктів на місці', gate?.пунктів === 7, `${gate?.пунктів}`);
ok('кнопка названа як у замовленні', gate?.кнопка === 'Ознайомився та продовжити', gate?.кнопка);
ok('вікно оголошено діалогом для читача екрана',
   gate?.діалог === 'dialog' && gate?.модальний === 'true', `${gate?.діалог}/${gate?.модальний}`);

// ── 2. ЙОГО НЕ МОЖНА ВІДХИЛИТИ НІЧИМ, КРІМ КНОПКИ ───────────────────────────
// Кожен шлях відхилення перевіряємо ОКРЕМО: вимкнути один і забути про інший —
// рівно та помилка, через яку «блокуюче» вікно виявилось би клікабельним повз.
ok('немає ✕ — його не можна просто закрити', gate?.хрестик === false, 'хрестик є');
ok('немає рисочки-грабера (вона обіцяла б свайп)', gate?.рисочка === false, 'рисочка є');

await p.keyboard.press('Escape');
await p.waitForTimeout(300);
ok('Escape НЕ закриває гейт', await p.evaluate(() => !!document.querySelector('.app-modal--brules')), 'закрився');

await p.evaluate(() => document.querySelector('.app-modal--brules .app-modal-backdrop')?.click());
await p.waitForTimeout(300);
ok('тап по фону НЕ закриває гейт', await p.evaluate(() => !!document.querySelector('.app-modal--brules')), 'закрився');

// Спроба дістатись до оголошення ПОВЗ вікно.
// ⚠️ МІРЯЄМО ДОТИКОМ, А НЕ `el.click()`. Перша версія цієї перевірки кликала
// `.click()` з JS — а він б'є ПО ЕЛЕМЕНТУ, повністю обходячи перевірку перекриття,
// тобто «провалювався» навіть крізь щільне вікно. Палець так не вміє. Тому: питаємо
// браузер, ЩО лежить у точці картки, і тапаємо по координатах справжнім дотиком.
const cardBox = await p.evaluate(() => {
  const c = document.querySelector('#board-content .bd-ad');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
  const top = document.elementFromPoint(x, y);
  const gateEl = document.querySelector('.app-modal--brules');
  // Питаємо не «це не картка?», а «це САМЕ вікно правил?». Перше було б зелене й тоді,
  // коли картка просто поїхала за межі екрана.
  return { x, y, накрито: !!top && !!gateEl && gateEl.contains(top),
           верхній: top ? (top.tagName + '.' + (top.getAttribute('class') || '—')) : 'нічого' };
});
ok('картку фізично накрито вікном правил', cardBox?.накрито === true,
   `у точці картки лежить ${cardBox?.верхній}`);
if (cardBox) await p.touchscreen.tap(cardBox.x, cardBox.y);
await p.waitForTimeout(400);
ok('до підтвердження оголошення не відкривається',
   await p.evaluate(() => !document.querySelector('.cm-board-modal-note')), 'оголошення відкрилось');

// ── 3. КНОПКА ЗАКРИВАЄ І БІЛЬШЕ ВІКНО НЕ ПРИХОДИТЬ ──────────────────────────
await p.evaluate(() => document.querySelector('.brules-ok')?.click());
await p.waitForTimeout(500);
ok('кнопка закриває вікно', await p.evaluate(() => !document.querySelector('.app-modal--brules')), 'лишилось');
ok('згоду записано в localStorage',
   await p.evaluate(() => !!JSON.parse(localStorage.getItem('cstl_board_rules_v1') || '{}').anon), 'не записано');

await p.evaluate(() => window.switchTab && window.switchTab('community'));
await p.waitForTimeout(400);
await p.evaluate(() => window.switchTab && window.switchTab('board'));
await p.waitForTimeout(700);
ok('після прийняття гейт НЕ повертається при новому вході',
   await p.evaluate(() => !document.querySelector('.app-modal--brules')), 'прийшов знову');

// Перезавантаження сторінки — згода мусить пережити його (інакше вікно ставало б
// щоденним ритуалом, а не одноразовим).
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.evaluate(() => window.switchTab && window.switchTab('board'));
await p.waitForTimeout(900);
ok('згода переживає перезавантаження',
   await p.evaluate(() => !document.querySelector('.app-modal--brules')), 'прийшов після reload');

// ── 4. ПОВТОРНИЙ ПЕРЕГЛЯД ІЗ САЙДБАРУ — І ВІН ЗВИЧАЙНИЙ, НЕ БЛОКУЮЧИЙ ───────
await p.evaluate(() => document.getElementById('sidebar-toggle')?.click());
await p.waitForTimeout(400);
ok('у сайдбарі є пункт «Правила Дошки»',
   await p.evaluate(() => !!document.querySelector('[data-nav="boardrules"]')), 'пункту немає');
await p.evaluate(() => document.querySelector('[data-nav="boardrules"]')?.click());
await p.waitForTimeout(500);
const again = await p.evaluate(() => {
  const w = document.querySelector('.app-modal--brules');
  return w ? { пунктів: w.querySelectorAll('.brules-list li').length,
               хрестик: !!w.querySelector('.app-modal-close'),
               кнопка: !!w.querySelector('.brules-ok') } : null;
});
ok('правила відкриваються повторно з сайдбару', !!again, 'не відкрились');
ok('той самий текст, усі 7 пунктів', again?.пунктів === 7, `${again?.пунктів}`);
ok('повторний перегляд закривається як звичайна модалка (✕ є)', again?.хрестик === true, 'хрестика немає');
ok('у повторному перегляді немає кнопки прийняття', again?.кнопка === false, 'кнопка є');
await p.evaluate(() => document.querySelector('.app-modal--brules .app-modal-close')?.click());
await p.waitForTimeout(400);

// ── 5. БЛОК БЕЗПЕКИ В ОГОЛОШЕННІ: ЗМІСТОВНІШИЙ, АЛЕ НЕ ВИЩИЙ ────────────────
await p.evaluate(() => document.querySelector('#board-content .bd-ad')?.click());
await p.waitForTimeout(800);
const safety = await p.evaluate(() => {
  const s = document.querySelector('.cm-ad-safety');
  if (!s) return null;
  const txt = s.querySelector('.cm-ad-safety-text');
  return { висота: Math.round(s.getBoundingClientRect().height),
           символів: txt.textContent.trim().replace(/\s+/g, ' ').length,
           текст: txt.textContent.replace(/\s+/g, ' ').trim(),
           іконка_залита: getComputedStyle(s.querySelector('.cm-ad-safety-ic')).fill !== 'none' };
});
ok('блок безпеки на місці', !!safety, 'немає');
ok('текст називає межу відповідальності платформи',
   /не є стороною угоди/.test(safety?.текст || ''), (safety?.текст || '').slice(0, 60));
ok('текст радить не робити передоплату',
   /Не здійснюйте передоплату/.test(safety?.текст || ''), 'поради немає');
ok('щит залитий, а не контурний', safety?.іконка_залита === true, 'контурний');

// КОНТРОЛЬ висоти: повертаємо СТАРІ значення й старий текст і міряємо тим самим кодом.
const before = await p.evaluate(() => {
  const s = document.querySelector('.cm-ad-safety');
  const txt = s.querySelector('.cm-ad-safety-text');
  s.style.cssText = 'display:flex;align-items:flex-start;gap:12px;margin-top:28px;padding:14px;border-radius:14px;border:0;background:rgba(114,47,55,0.06)';
  s.querySelector('.cm-ad-safety-ic').style.cssText = 'flex:none;width:24px;height:24px;color:#722F37';
  txt.style.cssText = 'font-size:13px;line-height:1.45;color:#5A5A5A';
  const b = document.createElement('b');
  b.style.cssText = 'display:block;font-size:14px;color:#111;margin-bottom:2px';
  b.textContent = 'Будьте обережні!';
  txt.textContent = ' Не переходьте за сторонніми посиланнями та не здійснюйте передоплату.';
  txt.prepend(b);
  return { висота: Math.round(s.getBoundingClientRect().height),
           символів: txt.textContent.trim().replace(/\s+/g, ' ').length };
});
// Поріг 4px, а не 0: висота залежить від переносу рядків, і вимагати рівності означало б
// прив'язатись до конкретного шрифту рендерера. Головне — блок не ПОТОВСТІШАВ.
ok('змісту вдвічі більше', safety.символів >= before.символів * 1.8,
   `${before.символів} → ${safety.символів} символів`);
ok('і при цьому блок НЕ став вищим', safety.висота <= before.висота + 4,
   `${before.висота} → ${safety.висота}px`);
ok('контроль: старі значення справді давали іншу висоту — вимір робочий',
   before.висота !== safety.висота, `обидва ${safety.висота}px — вимір нічого не бачить`);

// ── 6. ТЕКСТ ПРАВИЛ ЖИВЕ В ОДНОМУ МІСЦІ ─────────────────────────────────────
// Два читачі (гейт і сайдбар) — і саме тут копія найдорожча: людина погодилась би з
// однією редакцією, а читала іншу. Сторож на рівні коду, бо однакову кількість
// пунктів у двох копіях легко зберегти й розійтись у формулюваннях.
const strip = s => s.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const board   = strip(readFileSync(join(ROOT, 'src/tabs/board.js'), 'utf8'));
const sidebar = strip(readFileSync(join(ROOT, 'src/core/sidebar.js'), 'utf8'));
ok('board.js бере правила з legal.js, а не тримає свою копію',
   /BOARD_RULES_HTML/.test(board) && !/Ласкаво просимо до дошки/.test(board), 'копія в board.js');
ok('sidebar.js бере правила з legal.js, а не тримає свою копію',
   /BOARD_RULES_HTML/.test(sidebar) && !/Ласкаво просимо до дошки/.test(sidebar), 'копія в sidebar.js');

await b.close();
stop();
done();
