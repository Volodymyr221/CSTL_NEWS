// tests/community-home.mjs — СТОРОЖ ГОЛОВНОГО ЕКРАНА «Громада» (03.08.2026).
//
// Що він захищає (усе — наслідки аудиту `_ai-tools/AUDIT_GROMADA_2026-08.md`):
//   1. інформація починається НА ПЕРШОМУ екрані, а не під фото;
//   2. довідник телефонів не займає пів екрана;
//   3. на головній немає вкладених скролерів і зайвих автомін;
//   4. тап-цілі не менші за 44px (Apple HIG) — екраном користуються люди 50+;
//   5. контраст тихого тексту тримає норму WCAG 4.5:1;
//   6. блок зборів зникає, коли активних зборів немає, і зʼявляється, коли є.
//
// 🔴 КОЖНА ПЕРЕВІРКА МІРЯЄ НАСЛІДОК, А НЕ ФОРМУ ЗАПИСУ. У проєкті вже сім разів
// перевірка «доводила» неправду, бо міряла зручне замість видимого (розбір —
// `CLAUDE.md`, секція «МІРКУ ПЕРЕВІРЯТИ ТАК САМО, ЯК КОД»). Тому тут висоти
// беруться з `getBoundingClientRect`, кольори — з `getComputedStyle`, а не з CSS.
import { chromium } from 'playwright';
import { chromiumPath, serve, reporter } from './_lib.mjs';

const { ok, done } = reporter();
const { url, stop } = await serve();
const ep = chromiumPath();
const browser = await chromium.launch({ ...(ep ? { executablePath: ep } : {}) });
// 🔴 `serviceWorkers: 'block'` — НЕ косметика, а умова, без якої перевірка бреше.
// Застосунок реєструє Service Worker (`sw.js`), і в другої вкладки того самого
// походження запити йдуть уже ЧЕРЕЗ НЬОГО. Playwright свій `page.route` на такі
// запити не вішає — тобто підміна `data/fundraisers.json` тихо не спрацьовувала,
// і КОНТРОЛЬНА перевірка «з активним збором блок зʼявляється» показувала 0px на
// цілком робочому коді. Восьмий випадок брехливої перевірки в проєкті: міряло
// не те, що бачить людина, а те, що дійшло крізь кеш.
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  serviceWorkers: 'block',
});
const page = await ctx.newPage();
await page.route('**://api.open-meteo.com/**', r => r.abort());

const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
await page.evaluate(() => window.switchTab && window.switchTab('community'));
await page.waitForTimeout(2500);

// Видима зона = екран − шапка 56 − таб-бар 57. Те саме число, яким міряли «було».
const VIEW = 844 - 56 - 57;

// ── 1. Перший екран несе інформацію ──────────────────────────────────────────
const geo = await page.evaluate(() => {
  const main = document.querySelector('.app-main');
  const box = s => {
    const e = document.querySelector(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { h: Math.round(r.height), top: Math.round(r.top + main.scrollTop) };
  };
  return {
    top: box('.hm-top'),
    news: box('#hm-news'),
    contacts: box('#hm-contacts'),
    hello: box('.hm-hello'),
    total: Math.round(main.scrollHeight),
  };
});

ok('шапка не більша за третину екрана', geo.top && geo.top.h <= VIEW / 3,
   `${geo.top?.h}px = ${(geo.top.h / VIEW * 100).toFixed(1)}% (було 560px = 76.6%)`);
// ГОЛОВНА перевірка потоку: до редизайну новини починались на 662px, тобто нижче
// першого екрана. Поріг — сама видима зона: новини мусять ПОЧАТИСЬ у ній.
ok('новини починаються на першому екрані', geo.news && geo.news.top < VIEW,
   `на ${geo.news?.top}px при видимій зоні ${VIEW}px (було 662px)`);
ok('уся сторінка коротша за 2446px «до»', geo.total < 2446,
   `${geo.total}px = ${(geo.total / VIEW).toFixed(1)} екрана (було 3.3)`);
ok('довідник телефонів не займає пів екрана', geo.contacts && geo.contacts.h < VIEW / 2,
   `${geo.contacts?.h}px (було 420px = 57.5%)`);
ok('«ШО В СЕЛІ?» лишилось на екрані', !!geo.hello, 'голос Вови, не службовий заголовок');

// ── 2. Липка панель нічого не накриває ───────────────────────────────────────
// Міряємо НАСЛІДОК: чи є на головній хоч один липкий/фіксований елемент, який
// перекриває вміст. Раніше таким була панель «ШО В СЕЛІ?» (75px) — вона лежала
// поверх карток на всіх контрольних скріншотах.
const sticky = await page.evaluate(() => [...document.querySelectorAll('#cm-content *')]
  .filter(e => ['sticky', 'fixed'].includes(getComputedStyle(e).position))
  .map(e => e.className.toString().slice(0, 30)));
ok('на головній немає липких панелей поверх контенту', sticky.length === 0, JSON.stringify(sticky));

// ── 3. Вкладені скролери й автоміни ──────────────────────────────────────────
const moving = await page.evaluate(() => {
  const root = document.getElementById('cm-content');
  const nested = [...root.querySelectorAll('*')].filter(e => {
    const cs = getComputedStyle(e);
    return ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 1)
        || ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 1);
  }).map(e => e.className.toString().slice(0, 30));
  return {
    nested,
    boardCards: root.querySelectorAll('.cmbw-card').length,   // карусель Дошки
    evSlides:   root.querySelectorAll('.cm-ev-slide').length, // карусель Подій
    scaled: [...root.querySelectorAll('.cm-block')].filter(e => getComputedStyle(e).transform !== 'none').length,
  };
});
// ⚠️ Смуга «ЗАРАЗ» — теж горизонтальний скролер, але вона гортається ЛИШЕ коли
// капсул більше, ніж влазить; на трьох капсулах прокрутки немає. Тому перевірка
// не забороняє скролери взагалі, а ловить саме ті, що ховають вміст усередині
// картки (це і був діагноз 9).
ok('вкладених скролерів усередині карток немає',
   moving.nested.filter(c => !c.includes('hm-now')).length === 0, JSON.stringify(moving.nested));
ok('карусель Дошки знято', moving.boardCards === 0);
ok('карусель Подій знято', moving.evSlides === 0);
ok('фокус-скрол (scale кожного блока) знято', moving.scaled === 0);

// ── 4. Тап-цілі ≥44px (Apple HIG) ────────────────────────────────────────────
// Міряємо РЕАЛЬНУ зону натиску: у кнопок шапки видимий кружечок 36px, але
// невидиме розширення `::after` доводить її до 44. Тому беремо максимум із
// власної коробки і коробки псевдоелемента — саме туди влучає палець.
const small = await page.evaluate(() => {
  const sel = '#cm-content button, #cm-content a, #cm-content summary';
  return [...document.querySelectorAll(sel)]
    .filter(e => e.offsetParent !== null)
    .map(e => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e, '::after');
      // inset псевдоелемента заданий від'ємними значеннями → зона більша.
      const grow = ['top', 'bottom'].reduce((acc, side) => {
        const v = parseFloat(cs[side]);
        return acc + (isFinite(v) && v < 0 ? -v : 0);
      }, 0);
      return { cls: e.className.toString().slice(0, 24), h: Math.round(r.height + grow) };
    })
    .filter(x => x.h > 0 && x.h < 44);
});
ok('усі тап-цілі не менші за 44px', small.length === 0, JSON.stringify(small));

// ── 5. Контраст тихого тексту ────────────────────────────────────────────────
// Рахуємо ВІДНОСНУ ЯСКРАВІСТЬ за WCAG, а не «на око»: `--hm-ink-mute` на білій
// картці мусить тримати 4.5:1, інакше дата й локація стають декорацією.
const contrast = await page.evaluate(() => {
  const lum = ([r, g, b]) => {
    const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const rgb = s => s.match(/\d+/g).slice(0, 3).map(Number);
  const el = document.querySelector('.hm-ad-meta') || document.querySelector('.hm-ev-meta');
  if (!el) return null;
  const fg = lum(rgb(getComputedStyle(el).color));
  const card = el.closest('.hm-card');
  const bg = lum(rgb(getComputedStyle(card).backgroundColor));
  const [hi, lo] = fg > bg ? [fg, bg] : [bg, fg];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
});
ok('тихий текст тримає контраст WCAG 4.5:1', contrast !== null && contrast >= 4.5, `${contrast}:1`);

// ── 6. Збори: немає даних → немає блока; є дані → є блок ─────────────────────
const fundEmpty = await page.evaluate(() => {
  const h = document.getElementById('hm-fund');
  return { html: h.innerHTML.trim().length, shown: h.getBoundingClientRect().height };
});
ok('без активних зборів блока немає ЗОВСІМ', fundEmpty.html === 0 && fundEmpty.shown === 0,
   `розмітка ${fundEmpty.html} символів, висота ${fundEmpty.shown}px`);

// КОНТРОЛЬ: та сама перевірка мусить ПОБАЧИТИ блок, коли дані є. Без цього
// «блока немає» проходило б і на зламаному рендері, який не малює нічого ніколи.
//
// ⚠️ Робимо це в ОКРЕМІЙ вкладці з підміною, поставленою ДО завантаження.
// Перша спроба підміняла файл на вже відкритій сторінці й перезавантажувала її —
// і контроль показував 0px, тобто «довів» би відсутність бага в блоці, який
// насправді працює. Саме той випадок, коли першою підозрюваною має бути
// перевірка, а не код (CLAUDE.md, урок 27.07).
const page2 = await ctx.newPage();
await page2.route('**://api.open-meteo.com/**', r => r.abort());
await page2.route('**/data/fundraisers.json', r => r.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ items: [{ id: 't', active: true, title: 'Тест', org: 'Хтось', url: 'https://e.org', goal: 100, raised: 50 }] }),
}));
await page2.goto(url, { waitUntil: 'domcontentloaded' });
await page2.waitForTimeout(3500);
await page2.evaluate(() => window.switchTab && window.switchTab('community'));
await page2.waitForTimeout(2000);
const fundFull = await page2.evaluate(() => {
  const h = document.getElementById('hm-fund');
  const bar = h.querySelector('[role=progressbar]');
  return { h: Math.round(h.getBoundingClientRect().height), pct: bar?.getAttribute('aria-valuenow') };
});
ok('КОНТРОЛЬ: з активним збором блок зʼявляється', fundFull.h > 40, `${fundFull.h}px`);
ok('КОНТРОЛЬ: прогрес рахується правильно', fundFull.pct === '50', `aria-valuenow=${fundFull.pct} (50 з 100)`);

// ── 7. Жодної помилки в консолі ──────────────────────────────────────────────
ok('на головній немає JS-помилок', errors.length === 0, errors.join(' | '));

await browser.close();
await stop();
done();
