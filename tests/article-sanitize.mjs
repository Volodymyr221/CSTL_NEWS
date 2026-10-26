// tests/article-sanitize.mjs — ТІЛО СТАТТІ НЕ ВИКОНУЄ ЧУЖИЙ КОД (Б5, 26.10.2026).
//
// 🔴 ЩО ОХОРОНЯЄМО. Аудит безпеки 24.10 (`docs/AUDYT_BEZPEKY_2026-10-24.md`, Б5):
// «багатий HTML» статті йшов у `innerHTML` як є. Стаття з кабінету редактора чи
// скопійований чужий текст міг нести `<img onerror=…>` — і скрипт виконувався б у
// кожного читача. Тепер тіло проходить білий список `sanitizeArticleHtml`
// (`src/tabs/news.js`).
//
// 🔑 СТЕНД МІРЯЄ НАСЛІДОК, А НЕ НАЯВНІСТЬ ФУНКЦІЇ. Кожен шкідливий шматок пробує
// записати свій номер у `window.__xss`; після відкриття статті там мусить бути
// порожньо. Перевірка «у коді є слово sanitize» зеленіла б і над фільтром, який
// пропускає `onerror`.
// 🛑 І ЗУСТРІЧНА МЕЖА: звичайна стаття мусить показатись ТАК САМО — абзаци, фото з
// підписом, жирне, посилання з рівно трьома нашими атрибутами. Фільтр, що зʼїдає
// зміст, «безпечний» лише тому, що зламаний.
//
// 🔴 КОНТРОЛЬ: BUNDLE_REV=origin/main node tests/article-sanitize.mjs
//    → на коді ДО фікса скрипти виконуються (падають перевірки «не виконано»).

import { chromium } from 'playwright';
import { chromiumPath, serve, reporter, projectFile } from './_lib.mjs';

const { ok, done } = reporter();
const BUNDLE_REV = process.env.BUNDLE_REV || '';
const { url, stop } = await serve();
const executablePath = chromiumPath();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const page = await ctx.newPage();

const ФОТО = 'https://static.rayon.in.ua/Page/1/aaa.jpg';
const ДОБРЕ = 'https://olyka.example/news/1';
const ТІЛО =
  '<p>Перший абзац <strong>жирне</strong> і <em>курсив</em>.</p>' +
  `<figure><img src="${ФОТО}" alt="Учасники"><figcaption>Підпис до фото</figcaption></figure>` +
  `<p>Про це <a href="${ДОБРЕ}" target="_blank" rel="noopener" onmouseover="window.__xss=(window.__xss||'')+'a'">повідомили</a>.</p>` +
  // ── шкідливе ──
  '<img src="x" onerror="window.__xss=(window.__xss||\'\')+\'1\'">' +
  '<p><a href="javascript:window.__xss=(window.__xss||\'\')+\'2\'" id="js1">клік один</a></p>' +
  '<p><a href="java\tscript:window.__xss=(window.__xss||\'\')+\'3\'" id="js2">клік два</a></p>' +
  '<script>window.__xss=(window.__xss||"")+"4"</script>' +
  '<svg><animate onbegin="window.__xss=(window.__xss||\'\')+\'5\'" attributeName="x" dur="1s"/></svg>' +
  '<iframe srcdoc="<script>parent.__xss=(parent.__xss||\'\')+\'6\'</script>"></iframe>' +
  '<p onclick="window.__xss=1" style="color:red">Абзац із чужими атрибутами</p>' +
  '<details open ontoggle="window.__xss=(window.__xss||\'\')+\'7\'"><summary>Сховане</summary>текст</details>';

let idСтатті = null;
await page.route('**/data/articles.json', async r => {
  const res = await r.fetch();
  const arts = JSON.parse(await res.text());
  idСтатті = arts[0].id;
  arts[0].content = ТІЛО;
  await r.fulfill({ contentType: 'application/json', body: JSON.stringify(arts) });
});
const байти = (await import('node:fs')).readFileSync('images/kino-castle.jpg');
await page.route('**static.rayon.in.ua/**', r => r.fulfill({ contentType: 'image/jpeg', body: байти }));
await page.route('**://*.supabase.co/**', r => r.abort());
await page.route('**://api.open-meteo.com/**', r => r.abort());
if (BUNDLE_REV) {
  const old = projectFile('bundle.js', BUNDLE_REV);
  await page.route('**/bundle.js*', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body: old }));
}

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.evaluate(id => window.location.hash = `#/post/news/${id}`, idСтатті);
await page.waitForTimeout(2500);
// Наведення й тап по посиланнях — на випадок, якщо обробник протік.
for (const sel of ['.article-body a', '#js1', '#js2']) {
  const l = page.locator(sel).first();
  if (await l.count()) { await l.hover().catch(() => {}); }
}
await page.waitForTimeout(1200);

const м = await page.evaluate(() => {
  const body = document.querySelector('.article-body');
  if (!body) return { є: false };
  const всі = [...body.querySelectorAll('*')];
  return {
    є: true,
    xss: window.__xss || '',
    onАтрибути: всі.filter(e => [...e.attributes].some(a => /^on/i.test(a.name))).map(e => e.tagName),
    style: всі.filter(e => e.hasAttribute('style')).length,
    заборонені: всі.filter(e => /^(SCRIPT|IFRAME|SVG|DETAILS|ANIMATE)$/i.test(e.tagName)).map(e => e.tagName),
    jsАдреси: [...body.querySelectorAll('a')].filter(a => !/^https?:/i.test(a.getAttribute('href') || '')).length,
    текст: body.textContent,
    абзаців: body.querySelectorAll('p').length,
    жирне: !!body.querySelector('strong'), курсив: !!body.querySelector('em'),
    фото: (body.querySelector('figure img') || {}).src || '',
    підпис: (body.querySelector('figcaption') || {}).textContent || '',
    посилання: (() => { const a = body.querySelector('a'); return a ? { href: a.getAttribute('href'), атрибути: [...a.attributes].map(x => x.name).sort() } : null; })(),
  };
});

ok('стаття відкрилась', м.є);
ok('🔴 жоден шкідливий шматок не виконався', м.є && м.xss === '', `window.__xss = «${м.xss}»`);
ok('🔴 у тілі немає жодного атрибута on…', м.є && м.onАтрибути.length === 0, JSON.stringify(м.onАтрибути));
ok('🔴 script / iframe / svg / details викинуто', м.є && м.заборонені.length === 0, JSON.stringify(м.заборонені));
ok('🔴 посилання javascript: (і з табуляцією всередині) стали текстом', м.є && м.jsАдреси === 0, `${м.jsАдреси}`);
ok('текст тих посилань не зник', м.є && м.текст.includes('клік один') && м.текст.includes('клік два'));
ok('чужий style знято, сам абзац лишився', м.є && м.style === 0 && м.текст.includes('Абзац із чужими атрибутами'));
// ── зустрічна межа: звичайне не постраждало ──
ok('абзаци на місці', м.є && м.абзаців >= 5, `${м.абзаців}`);
ok('жирне й курсив на місці', м.є && м.жирне && м.курсив);
ok('фото з підписом на місці', м.є && м.фото === ФОТО && м.підпис === 'Підпис до фото', `${м.фото} · «${м.підпис}»`);
ok('звичайне посилання: адреса і рівно три наші атрибути',
   м.є && м.посилання && м.посилання.href === ДОБРЕ && JSON.stringify(м.посилання.атрибути) === JSON.stringify(['href', 'rel', 'target']),
   JSON.stringify(м.посилання));

await browser.close();
stop();
done();
