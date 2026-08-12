// Стенд: ПЛАШКА «ДЖЕРЕЛО НАДАЄ ЛИШЕ АНОНС» З'ЯВЛЯЄТЬСЯ ЛИШЕ КОЛИ ЦЕ ПРАВДА.
//
// НАВІЩО. Плашка три місяці стояла під ПОВНИМИ статтями — 107 із 400 (27%), — і
// знайшов це Вова знімком з телефона (v4271, стаття про загиблого земляка на 467
// символів: увесь її текст, плюс обіцянка «повний текст на сайті видання», якого
// там немає). Жодна перевірка цього не ловила, бо жодна не дивилась на плашку.
//
// 🔑 Міряє НАСКРІЗНО: підміняє `data/articles.json` трьома статтями (по одній на
// кожен стан) і відкриває їх ТАК, ЯК ЛЮДИНА — тапом по картці.
//
// 🔴 ДВІ БРЕХЛИВІ МІРКИ, спіймані під час написання цього ж стенда:
//   (1) перша редакція кликала `window.openArticleById`, якої не існує (це експорт
//       модуля). Модалка не відкривалась, `.article-short-note` не знаходився — і
//       перевірка «плашки нема» була ЗЕЛЕНОЮ на невідкритому екрані;
//   (2) друга редакція міряла «модалка відкрита» через `display`/`offsetParent` —
//       модалка статті показується інакше, і контроль червонів на робочому коді.
// ➡️ Звідси правило цього файлу: КОЖЕН вимір плашки супроводжується доказом, що
// екран справді відкритий (видиме тіло статті). Відсутність плашки без цього
// доказу не означає нічого.
//
// Запуск: node tests/article-banner.mjs
import { chromium } from 'playwright';
import { launch, serve } from './_lib.mjs';

const NOW = Date.now();
const базова = (id, extra) => ({
  id, title: `Тест ${id}`, excerpt: 'Короткий опис для картки.',
  content: '<p>' + 'Текст статті. '.repeat(12) + '</p>',   // ~168 симв.
  category: 'Суспільство', geo: 'Громада', image: null,
  source: 'Конкурент', sourceUrl: 'https://example.com/a', exclusive: false,
  ts: NOW - id * 1000, ...extra,
});
const СТАТТІ = [
  базова(1, { contentSource: 'page', fullText: true }),   // повна зі сторінки
  базова(2, { contentSource: 'rss',  fullText: false }),  // справжній анонс
  базова(3, { fullText: false }),                          // стара, без поля
];

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
  hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
await p.route('**/data/articles.json', r =>
  r.fulfill({ contentType: 'application/json', body: JSON.stringify(СТАТТІ) }));
await p.route('**://*.supabase.co/**', r => r.abort());
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 });
await p.evaluate(() => window.switchTab && window.switchTab('community'));
await p.waitForTimeout(2000);

let ok = 0, fail = 0;
const перевір = (назва, умова, деталь = '') => {
  if (умова) { ok++; console.log('✅', назва, деталь && '— ' + деталь); }
  else { fail++; console.log('❌', назва, деталь && '— ' + деталь); }
};

for (const [id, очікуємо, підпис] of [
  [1, false, "contentSource='page' → плашки НЕМА"],
  [2, true,  "contentSource='rss' → плашка Є"],
  [3, true,  'стара стаття без поля → запасний шлях, плашка Є'],
]) {
  // Відкриваємо ТАК, ЯК ЛЮДИНА — тапом по картці. `openArticleById` це експорт
  // модуля, а не window-функція: перша редакція приладу кликала неіснуюче і
  // «доводила» відсутність плашки на невідкритій модалці.
  const картка = p.locator(`[data-article-id="${id}"]`).first();
  await картка.scrollIntoViewIfNeeded();
  await картка.click();
  await p.waitForTimeout(900);
  const стан = await p.evaluate(() => {
    const m = document.getElementById('article-modal');
    // ⚠️ Критерій «відкрита» вже раз збрехав: `display`/`offsetParent` не годяться,
    // бо модалка статті показується інакше. Чесна ознака — що в ній ВИДНО текст
    // саме цієї статті, тобто те, що бачить людина.
    const тіло = m && m.querySelector('.article-body');
    const відкрита = !!тіло && тіло.getBoundingClientRect().height > 0;
    const n = document.querySelector('.article-short-note');
    return { відкрита, банер: !!n && getComputedStyle(n).display !== 'none',
             заголовок: (document.querySelector('#article-modal .article-title, #article-modal h1, #article-modal h2') || {}).textContent || '' };
  });
  // 🔴 КОНТРОЛЬ: «плашки нема» істинне і тоді, коли модалка не відкрилась узагалі.
  перевір('  модалка відкрита (інакше вимір нічого не значить)', стан.відкрита,
          стан.заголовок.trim().slice(0, 30));
  перевір(підпис, стан.відкрита && стан.банер === очікуємо, `плашка ${стан.банер ? 'є' : 'нема'}`);
  await p.evaluate(() => window.closeArticleModal ? window.closeArticleModal()
    : document.querySelector('#article-modal .article-close')?.click());
  await p.waitForTimeout(500);
}
console.log(`\n${fail ? '❌' : '✅'} ${ok}/${ok + fail}`);
await b.close(); await stop();
process.exit(fail ? 1 : 0);
