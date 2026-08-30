// Стенд: ПОШУК ДОШКИ СПРАВДІ ЗІБРАНИЙ — набираємо запит у живому застосунку.
//
// 🔴 ЧОМУ ЦЕЙ СТЕНД ПОТРІБЕН ПРИ 82 ЗЕЛЕНИХ ПЕРЕВІРКАХ МОДУЛЯ.
// `search-stem`, `search-engine` і `search-synonyms` доводять, що МЕХАНІЗМ
// правильний. Вони НЕ доводять, що Дошка його викликає, що імпорт не впав, що
// картка малює підпис і що екран узагалі збирається.
// 📐 Проєкт уже платив за цю різницю 30.08: усі сторожі екрана входу були зелені
// (`singleFlight`, `setBusy`, `birthDateFrom`), поки сам екран не збирався зовсім —
// `const doSend` стояв нижче за рядок, який вішав його на кнопку. Помічник може
// бути ідеальним, а екран — не зібраним.
// ➡️ Тому тут нічого не імпортується з `core/search.js`. Стенд ВІДКРИВАЄ застосунок,
// ДРУКУЄ запит у справжнє поле і дивиться, що з'явилось на екрані.
//
// Запуск: node tests/board-search-live.mjs

import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
// Адаптер: у `_lib.mjs` порядок `ok(назва, умова, деталі)`, тут зручніше умова першою.
const check = (cond, name, info = '') => ok(name, cond, info);

let id = 900;
const mk = (o) => ({
  id: id++, type: 'board', status: 'published', category: o.category || 'продам',
  title: o.title, text: o.text || '', location: o.location || 'Олика',
  photos: [], tags: [], price: null, currency: 'UAH',
  author: 'Житель', owner_uid: 'u1',
  created_at: new Date().toISOString(), bumped_at: new Date().toISOString(),
});

// Сцена повторює лексику живих оголошень бази (де «будинок» ×9, «будинку» ×6).
const POSTS = [
  mk({ title: 'Продам будинок в Жорнищах', text: 'Цегляний, є вода та електроенергія', location: 'Жорнище' }),
  mk({ title: 'Продається приватний житловий будинок', text: 'Земельна ділянка 25 соток', location: 'Олика' }),
  mk({ title: 'Ремонт побутової техніки', text: 'Майстер відремонтує пральні машини', category: 'послуга' }),
  mk({ title: 'Куплю велосипед дорослий', text: 'Розгляну варіанти', category: 'куплю', location: 'Дерно' }),
];

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();

// Помилки застосунку ловимо окремо: якщо імпорт пошуку впаде, картки просто
// не намалюються, і без цього рядка стенд сказав би «нічого не знайшлось».
const впало = [];
p.on('pageerror', e => впало.push(String(e.message)));

await mockSupabase(p, { posts: POSTS, announcements: [] });
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.evaluate(() => window.switchTab && window.switchTab('board'));
await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.evaluate(() => document.querySelector('.brules-ok')?.click());
await p.waitForTimeout(400);

const заголовки = () => p.evaluate(() =>
  [...document.querySelectorAll('#board-content .bd-ad-title')].map(e => e.textContent.trim()));

async function шукати(q) {
  await p.evaluate(() => {
    const i = document.querySelector('#board-content .bd-search-input, #board-content input[type="text"]');
    if (i) { i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await p.waitForTimeout(250);
  await p.evaluate((текст) => {
    const i = document.querySelector('#board-content .bd-search-input, #board-content input[type="text"]');
    i.value = текст;
    i.dispatchEvent(new Event('input', { bubbles: true }));
  }, q);
  await p.waitForTimeout(450);
  return заголовки();
}

// ── 0. ПРИЛАД: спершу переконуємось, що сцена жива ───────────────────────────
// Без цього будь-яке «не знайшлось» нижче було б доказом зламаної фікстури,
// а не зламаного пошуку.
const усі = await заголовки();
check(усі.length === POSTS.length, 'ПРИЛАД: усі оголошення намальовані', `${усі.length} з ${POSTS.length}`);
check(впало.length === 0, 'ПРИЛАД: застосунок не впав', впало[0] || 'чисто');

// ── 1. ПРИКЛАД ВОВИ В ЖИВОМУ ЗАСТОСУНКУ ─────────────────────────────────────
const r1 = await шукати('будинок жорнище');
check(r1.length === 1 && /Жорнищах/i.test(r1[0]),
      '«будинок жорнище» → лише будинок у Жорнищах', r1.join(' | ') || '—');

const r2 = await шукати('жорнищах будинок');
check(r2.length === 1 && /Жорнищах/i.test(r2[0]), 'інший порядок слів працює', r2.join(' | ') || '—');

const r3 = await шукати('хочу купити хату');
check(r3.some(t => /будинок/i.test(t)), 'синонім «хата» → «будинок»', r3.join(' | ') || '—');

const r4 = await шукати('ремонт пральної машини');
check(r4.some(t => /побутової техніки/i.test(t)), 'вид → рід: пральна машина → побутова техніка', r4.join(' | ') || '—');

const r5 = await шукати('буднок');
check(r5.some(t => /будинок/i.test(t)), 'друкарська помилка пробачається', r5.join(' | ') || '—');

// ── 2. ПІДПИС «ЗНАЙДЕНО ЗА…» (рішення Вови «1 — так») ───────────────────────
await шукати('хочу купити хату');
const підпис = await p.evaluate(() => {
  const e = document.querySelector('#board-content .bd-ad-why');
  return e ? { текст: e.textContent.trim(), колір: getComputedStyle(e).color, кегль: getComputedStyle(e).fontSize } : null;
});
check(!!підпис, 'підпис «знайдено за…» намальований', підпис?.текст || 'немає');
check(підпис && parseFloat(підпис.кегль) < 14, 'підпис тихіший за заголовок (виноска, не друга назва)', підпис?.кегль);

// 🛑 Без запиту підпису бути не мусить — інакше він шумів би на кожній картці.
await шукати('');
const безЗапиту = await p.evaluate(() => document.querySelectorAll('#board-content .bd-ad-why').length);
check(безЗапиту === 0, 'без запиту підпису НЕМАЄ', `${безЗапиту}`);

// ── 3. ПОРОЖНІЙ СТАН (замовлення Вови: «перегляньте інші оголошення громади») ──
const r6 = await шукати('вертоліт');
check(r6.length === 0, 'чужий запит → порожньо', r6.join(' | ') || '—');
const кнопка = await p.evaluate(() => {
  const e = document.querySelector('#board-content .bd-empty-reset');
  return e ? e.textContent.trim() : null;
});
check(кнопка === 'Усі оголошення громади', 'кнопка каже людською мовою, а не «Скинути фільтри»', кнопка || 'немає');

// ── 4. НІЧОГО НЕ ВПАЛО ЗА ВЕСЬ ПРОГІН ───────────────────────────────────────
check(впало.length === 0, 'за весь прогін жодної помилки в застосунку', впало.join(' · ') || 'чисто');

await stop(); await b.close();
done();
