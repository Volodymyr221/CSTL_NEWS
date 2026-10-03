// ПРИЛАД (не стенд): чи доїжджає підміна `data/articles.json` у сцену віджета
// новин, і чи не зʼїдає її Service Worker.
//
// 🔬 ЗАРАДИ ЧОГО. `tests/news-widget.mjs` у CI червонів рядком «картинок не
// більше однієї на сторінку — 12 на 4 сторінок», а локально давав 75/75. Число
// рухалось разом зі стрічкою (30.09 — 12, 01.10 — 7, 02.10 — 12), тобто стенд
// міряв НОВИНИ ДНЯ, хоч із 21.09 у ньому стоїть фікстура саме проти цього.
// Гіпотеза: контекст не ставить `serviceWorkers: 'block'`, SW віддає справжній
// `articles.json` із кеша, і `page.route` до нього не доходить.
//
// Прилад міряє МЕХАНІЗМ, а не висновок: скільки разів влучив роут, чи є
// контролер SW, і чи видно на екрані заголовок із фікстури.
//
// Запуск: node tests/tools/news-fixture-sw-probe.mjs
import { chromium } from 'playwright';
import { serve, chromiumPath } from '../_lib.mjs';

const МІТКА = 'ФІКСТУРА ПРИЛАДУ ДОЇХАЛА';
const ФІКС = [{
  id: 900000, title: МІТКА, excerpt: 'опис', content: 'текст',
  category: 'Суспільство', geo: 'Олика', image: null, image_type: 'none',
  source: 'Прилад', sourceUrl: 'https://example.invalid/n',
  ts: Date.now(), added_ts: Date.now(),
}];

const { url, stop } = await serve();
const ep = chromiumPath();
const browser = await chromium.launch({ ...(ep ? { executablePath: ep } : {}) });

for (const блок of [false, true]) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    ...(блок ? { serviceWorkers: 'block' } : {}),
  });
  const page = await ctx.newPage();
  let влучань = 0;
  await page.route('**/data/articles.json*', r => {
    влучань++;
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ articles: ФІКС }) });
  });
  await page.route('**://*.supabase.co/**', r => r.abort());
  await page.route('**://api.open-meteo.com/**', r => r.abort());
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.switchTab && window.switchTab('community'));
  await page.waitForTimeout(1500);
  const з = await page.evaluate(async (мітка) => ({
    контролерSW: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
    реєстрацій: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : -1,
    фікстураНаЕкрані: document.body.innerText.includes(мітка),
    картинокУВіджеті: document.querySelectorAll('#cm-news-board img').length,
  }), МІТКА);
  console.log(`serviceWorkers:${блок ? "'block'" : 'дозволено'} →`,
              JSON.stringify({ влучаньРоуту: влучань, ...з }));
  await ctx.close();
}
await browser.close();
await stop();
