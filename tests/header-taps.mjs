// Стенд: НАЗВА В ШАПЦІ НЕ КЛІКАБЕЛЬНА.
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
// 🔑 І ГОЛОВНЕ — КОНТРОЛЬ НА САМ ПРИЛАД. «Нічого не сталось» — надто легкий
// результат: він вийде і тоді, коли стенд тискає не той вузол, або коли застосунок
// узагалі не піднявся. Тому поруч перевіряється ДРУГИЙ прихований жест
// (`.deploy-stamp` → адмінка), який лишається живим. Якщо він теж мовчить —
// бреше прилад, а не код.
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

// ── 3. КОНТРОЛЬ ПРИЛАДУ: другий прихований жест ЖИВИЙ ───────────────────────
// 🔑 Без цієї перевірки «нічого не сталось» доводило б лише те, що стенд не вміє
// тискати. Лічильник версії веде в адмінку — якщо й він мовчить, брехливий прилад.
const єШтамп = await p.locator('.deploy-stamp').count();
ok('ПРИЛАД: лічильник версії знайдений', єШтамп === 1, `вузлів: ${єШтамп}`);
if (єШтамп === 1) {
  for (let i = 0; i < 5; i++) { await p.locator('.deploy-stamp').click({ force: true }); await p.waitForTimeout(60); }
  await p.waitForTimeout(700);
  ok('🔴 КОНТРОЛЬ: пʼять тапів по лічильнику версії ВЕДУТЬ в адмінку',
     /admin\.html/.test(p.url()), `адреса: ${p.url()}`);
}

await b.close(); await stop();
done();
