// tests/desktop-gate.mjs — НА КОМПʼЮТЕРІ ЗАСТОСУНОК НЕ БУДУЄТЬСЯ, А ПОКАЗУЄ ЕКРАН
// «ПОКИ ЩО ТІЛЬКИ ТЕЛЕФОН».
//
// Вова 29.08: «веб-версія адаптована тільки для телефону… якщо користувач відкриває
// компʼютерну версію, потрібно написати, що зараз доступна тільки телефонна версія,
// і QR-код, щоб перекидало на сайт напряму з телефону».
//
// 🔴 ЩО МІРЯЄМО — НАСЛІДОК, А НЕ ФОРМУ. Не «чи є в коді клас `.dg`», а чотири речі
// на живому застосунку:
//   1. з мишею і широким вікном екран Є, а застосунок під ним НЕ ПОБУДОВАНИЙ
//      (намалювати накривало і зібрати під ним робочий застосунок — рівно та
//       помилка, яку тут найлегше зробити; той самий критерій, що в `dev-lock`);
//   2. з телефона нічого не змінилось — застосунок будується як будувався;
//   3. у вузькому вікні на компʼютері екрана НЕМАЄ: там телефонний макет
//      виглядає правильно, і замикати його немає за що;
//   4. 🔑 QR веде НА ЦЮ САМУ АДРЕСУ, а не на головну — включно з посиланням на
//      конкретну статтю. Заради цього код і генерується в браузері.
//
// ⚠️ ПЕРЕВІРКА САМОГО ПРИЛАДУ. Розвилка тримається на медіа-запиті «миша або
// дотик». Якщо Chromium у стенді видасть однакову відповідь в обох режимах,
// стенд «доведе» будь-що, нічого не поміряявши. Тому спершу міряємо сам запит —
// і лише потім наслідки.
//
// 🛑 ЧОГО ЦЕЙ СТЕНД НЕ ДОВОДИТЬ: що QR читається СПРАВЖНЬОЮ камерою. Тут
// перевіряється, що на екрані намальовано код саме цієї адреси; що сам
// кодувальник дає правильні точки — окремий стенд `tests/qr.mjs`, де еталон
// узятий з незалежної реалізації.

import { chromium } from 'playwright';
import { chromiumPath, serve, blockExternal, projectFile, reporter } from './_lib.mjs';

const { ok, done } = reporter();
const REV = process.env.BUNDLE_REV || '';

// Той самий маркер «застосунок побудований», що у стенді заслінки: у віджеті
// новин є хоч одна справжня картка статті — ознака, що `init()` дійшов до кінця.
const BUILT = '#cm-news-content [data-article-id]';

// Кодувальник піднімаємо в Node — щоб порахувати, ЯКИЙ код мав би бути на екрані.
let qr = null;
try {
  const src = projectFile('src/core/qr.js', REV);
  qr = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
} catch (_) { /* контроль на старому коді — модуля ще немає */ }

const { url, stop } = await serve();
const executablePath = chromiumPath();
const browser = await chromium.launch(executablePath ? { executablePath } : {});

// Відкрити сторінку в заданому «пристрої» і дочекатись або екрана, або застосунку.
async function open(opts, path = '/') {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await blockExternal(page);
  await page.goto(url + path, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    sel => !!document.querySelector('.dg') || !!document.querySelector(sel),
    BUILT, { timeout: 15000 },
  ).catch(() => {});
  return { ctx, page };
}

const МИША   = { viewport: { width: 1280, height: 800 } };
const ТЕЛЕФОН = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const ВУЗЬКЕ = { viewport: { width: 800, height: 800 } };

// ── 0. ЧИ ВЗАГАЛІ РОЗРІЗНЯЄ ПРИЛАД ───────────────────────────────────────────
{
  const a = await open(МИША);
  const b = await open(ТЕЛЕФОН);
  const q = 'matchMedia("(pointer: fine) and (hover: hover)").matches';
  const мишаБачить = await a.page.evaluate(q);
  const телефонБачить = await b.page.evaluate(q);
  ok('⚠️ прилад розрізняє мишу і дотик', мишаБачить === true && телефонБачить === false,
     `миша=${мишаБачить} телефон=${телефонБачить}`);
  await a.ctx.close(); await b.ctx.close();
}

// ── 1. КОМПʼЮТЕР: ЕКРАН Є, ЗАСТОСУНКУ НЕМАЄ ──────────────────────────────────
{
  const { ctx, page } = await open(МИША);
  ok('на компʼютері показано екран «тільки телефон»', await page.locator('.dg').count() === 1);
  ok('🔴 застосунок під ним НЕ побудований', await page.locator(BUILT).count() === 0);
  ok('заставка прибрана (не висить під екраном назавжди)',
     await page.locator('#splash').count() === 0);

  const title = (await page.locator('.dg-title').innerText().catch(() => '')).replace(/\s+/g, ' ');
  ok('сказано прямо, що версія телефонна', /телефон/i.test(title), title);
  ok('пояснено, що робити далі',
     /камер/i.test(await page.locator('.dg-text').innerText().catch(() => '')));

  // 🛑 Обхідної кнопки бути НЕ МАЄ — пряме рішення Вови 29.08: «компʼютерної
  // версії, поки вона не налаштована, вони не мають бачити взагалі».
  ok('🛑 обхідної кнопки немає', await page.locator('.dg button, .dg a').count() === 0);
  ok('сторінка під екраном не гортається',
     await page.evaluate(() => document.body.classList.contains('dg-open')));
  await ctx.close();
}

// ── 2. QR — ЦЕ АДРЕСА ЦІЄЇ САМОЇ СТОРІНКИ ────────────────────────────────────
// Порівнюємо намальоване з тим, що дає кодувальник для адреси, яку браузер
// СПРАВДІ показує в рядку. Тобто перевіряється звʼязок «код ↔ адреса», а не
// «код ↔ наша ж думка про адресу».
for (const [назва, шлях] of [['головна', '/'], ['посилання на статтю', '/#/post/news/12345']]) {
  const { ctx, page } = await open(МИША, шлях);
  const href = await page.evaluate(() => location.href);
  const намальовано = await page.locator('.dg-qr path').getAttribute('d').catch(() => null);
  let очікувано = null;
  try { очікувано = qr.qrSvg(href).match(/ d="([^"]+)"/)[1]; } catch (_) {}
  ok(`QR на екрані (${назва})`, !!намальовано);
  ok(`🔑 QR веде на цю саму адресу (${назва})`, !!намальовано && намальовано === очікувано,
     href);
  if (шлях !== '/') {
    // Найважливіше в розділі: адреса зі статтею НЕ дорівнює головній, тобто
    // код справді різний. Без цієї перевірки збіг вище міг би бути випадковим.
    const головна = qr.qrSvg(href.split('#')[0]).match(/ d="([^"]+)"/)[1];
    ok('код статті ≠ код головної', намальовано !== головна);
  }
  await ctx.close();
}

// ── 3. ТЕЛЕФОН І ВУЗЬКЕ ВІКНО — БЕЗ ЗМІН ─────────────────────────────────────
{
  const { ctx, page } = await open(ТЕЛЕФОН);
  ok('на телефоні екрана немає', await page.locator('.dg').count() === 0);
  ok('на телефоні застосунок побудований', await page.locator(BUILT).count() > 0);
  await ctx.close();
}
{
  const { ctx, page } = await open(ВУЗЬКЕ);
  ok('у вузькому вікні на компʼютері екрана немає', await page.locator('.dg').count() === 0);
  ok('у вузькому вікні застосунок побудований', await page.locator(BUILT).count() > 0);
  await ctx.close();
}

// ── 3-БІС. НИЗЬКЕ ВІКНО: ДІСТАТИСЯ ДО КОДУ МОЖНА ─────────────────────────────
// 🔴 Клас вади, який тут найлегше зробити: шар на весь екран (`position: fixed`)
// із вмістом, вищим за вікно. Сторінка під ним замкнена (`dg-open`), і якщо сам
// шар не гортається — нижня половина екрана, тобто РІВНО QR-код і адреса,
// недосяжна назавжди. Виглядає це не як поломка, а як «код чомусь обрізаний».
{
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 430 } });
  const page = await ctx.newPage();
  await blockExternal(page);
  await page.goto(url + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.dg', { timeout: 15000 }).catch(() => {});
  const r = await page.evaluate(() => {
    const dg = document.querySelector('.dg');
    if (!dg) return null;
    dg.scrollTop = 99999;
    const a = document.querySelector('.dg-addr').getBoundingClientRect();
    return { гортається: dg.scrollTop > 0, адресаВидна: a.bottom <= window.innerHeight + 1 };
  });
  ok('низьке вікно: екран гортається', !!r && r.гортається);
  ok('🔴 після прокрутки видно і код, і адресу', !!r && r.адресаВидна);
  await ctx.close();
}

// ── 4. ВІКНО РОЗТЯГНУЛИ ПІД ЧАС РОБОТИ ───────────────────────────────────────
// Людина працює у вікні на пів екрана і розгортає його на весь. Без цієї гілки
// макет ламався б мовчки — застосунок уже побудований, і питати ширину нікому.
{
  const { ctx, page } = await open(ВУЗЬКЕ);
  await page.setViewportSize({ width: 1280, height: 800 });
  const зʼявився = await page.waitForSelector('.dg', { timeout: 4000 }).then(() => true, () => false);
  ok('розтягнули вікно на весь екран → екран зʼявився', зʼявився);
  await ctx.close();
}

await browser.close();
await stop();
done();
