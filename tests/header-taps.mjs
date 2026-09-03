// Стенд: У ШАПЦІ НЕМАЄ ПРИХОВАНИХ ВХОДІВ.
//
// 🔴 ЗАРАДИ ЧОГО (03.09.2026). 🗣️ Пряме й однозначне слово Вови: «5 тапів з назви
// Castle Life потрібно взагалі забрати, щоб вона була неклікабельна».
// До того на `.header-logo` висів прихований жест — 5 тапів вмикали діагностику
// клавіатури (стояв із 26.07, теж за рішенням Вови).
//
// 🛑 ЧОМУ СТЕНД ТИСКАЄ ПАЛЬЦЕМ, А НЕ ГРЕПАЄ КОД. Перевірка «у `app.js` немає слова
// `initKbDebugShortcut`» зеленіла б і тоді, коли жест переїхав в інший файл або
// повісився делегуванням від `document`. Питання тут одне: **чи станеться щось,
// якщо тицьнути пʼять разів**. Тому пʼять справжніх тапів і замір наслідку.
//
// 🔴 03.09, ДРУГА РЕДАКЦІЯ. Спершу тут був ще й КОНТРОЛЬ на другому прихованому
// жесті (`.deploy-stamp` → адмінка): він лишався живим і доводив, що стенд уміє
// тискати. Того ж дня Вова сказав прибрати і його: «Другий прихований вхід
// прибираємо. Входи можемо залишити тільки з бургер-меню адміністратора або
// власника… самого додатку, не спільноти».
//
// 🔑 КОНТРОЛЬ ДОВЕЛОСЯ ПЕРЕНЕСТИ, А НЕ ВИКИНУТИ. «Нічого не сталось» — надто
// легкий результат: він вийде і тоді, коли стенд тискає не той вузол, або коли
// застосунок узагалі не піднявся. Тепер приладом слугує БУРГЕР: він у тій самій
// шапці, він має відкрити меню. Якщо змовк і він — бреше прилад, а не код.
import { chromium } from 'playwright';
import { chromiumPath, serve, reporter } from './_lib.mjs';

const { ok, done } = reporter();
const { url, stop } = await serve();
const ep = chromiumPath();
const b = await chromium.launch({ ...(ep ? { executablePath: ep } : {}) });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();

// Погода й геокодер — швидкі заглушки, інакше стенд платить фолбеком щопрогону.
await p.route('**://nominatim.openstreetmap.org/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ address: { village: 'Олика' } }) }));
await p.route('**://api.open-meteo.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({
  utc_offset_seconds: 10800, current: { temperature_2m: 18, weather_code: 3, apparent_temperature: 17 },
  hourly: { time: [], temperature_2m: [], precipitation_probability: [], weather_code: [] },
  daily: { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [] } }) }));

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('.consent-ok, [data-consent-ok], .pwa-cta button')?.click());
await p.waitForTimeout(600);

const єЛого = await p.locator('.header-logo').count();
ok('ПРИЛАД: назва в шапці знайдена', єЛого === 1, `вузлів: ${єЛого}`);

// ── 1. НАЗВА НЕ ВИГЛЯДАЄ КНОПКОЮ ────────────────────────────────────────────
// `onFiveTaps` ставив елементу `cursor: pointer` — тобто сам жест себе й виказував.
const курсор = await p.evaluate(() => {
  const el = document.querySelector('.header-logo');
  return el ? getComputedStyle(el).cursor : null;
});
ok('🔴 назва не має вигляду кнопки (курсор не `pointer`)',
   курсор !== 'pointer', `cursor: ${курсор}`);

// ── 2. ПʼЯТЬ ТАПІВ ПО НАЗВІ НЕ РОБЛЯТЬ НІЧОГО ───────────────────────────────
await p.evaluate(() => localStorage.removeItem('kbdebug'));
const адресаДо = p.url();
for (let i = 0; i < 5; i++) { await p.locator('.header-logo').click({ force: true }); await p.waitForTimeout(60); }
await p.waitForTimeout(400);

const післяЛого = await p.evaluate(() => ({
  kbdebug: localStorage.getItem('kbdebug'),
  тост: !!document.querySelector('.toast, .toast-msg, [class*="toast"]'),
}));
ok('🔴 пʼять тапів по назві НЕ вмикають діагностику',
   післяЛого.kbdebug === null, `localStorage.kbdebug = ${JSON.stringify(післяЛого.kbdebug)}`);
ok('пʼять тапів по назві нікуди не ведуть',
   p.url() === адресаДо, `${адресаДо} → ${p.url()}`);

// ── 3. ЛІЧИЛЬНИК ВЕРСІЇ ТЕЖ МОВЧИТЬ ─────────────────────────────────────────
// Другий прихований вхід (5 тапів → `admin.html`) прибрано 03.09 на слово Вови.
const єШтамп = await p.locator('.deploy-stamp').count();
ok('ПРИЛАД: лічильник версії знайдений', єШтамп === 1, `вузлів: ${єШтамп}`);
if (єШтамп === 1) {
  const курсорШтамп = await p.evaluate(() => getComputedStyle(document.querySelector('.deploy-stamp')).cursor);
  ok('лічильник версії не має вигляду кнопки', курсорШтамп !== 'pointer', `cursor: ${курсорШтамп}`);
  for (let i = 0; i < 5; i++) { await p.locator('.deploy-stamp').click({ force: true }); await p.waitForTimeout(60); }
  await p.waitForTimeout(700);
  ok('🔴 пʼять тапів по лічильнику версії НЕ ведуть в адмінку',
     !/admin\.html/.test(p.url()), `адреса: ${p.url()}`);
}

// ── 4. КОНТРОЛЬ ПРИЛАДУ: у шапці є те, що ПРАЦЮЄ ────────────────────────────
// 🔑 Без цього «нічого не сталось» доводило б лише те, що стенд не вміє тискати.
// Бургер стоїть у тій самій шапці й мусить відкрити меню.
const бургер = p.locator('#sidebar-toggle');
const єБургер = await бургер.count();
ok('ПРИЛАД: кнопка меню знайдена', єБургер > 0, `вузлів: ${єБургер}`);
if (єБургер > 0) {
  await бургер.click({ force: true });
  await p.waitForTimeout(500);
  const меню = await p.evaluate(() => {
    const el = document.getElementById('sidebar');
    if (!el) return false;
    // Міряємо НАСЛІДОК: панель справді на екрані, а не просто «не hidden».
    const r = el.getBoundingClientRect();
    return el.getAttribute('aria-hidden') !== 'true' && r.width > 40 && r.right > 0;
  });
  ok('🔴 КОНТРОЛЬ: тап по бургеру ВІДКРИВАЄ меню (прилад не бреше)', меню, `меню видиме: ${меню}`);
}

await b.close(); await stop();
done();
