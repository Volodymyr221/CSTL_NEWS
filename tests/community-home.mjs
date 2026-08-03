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
    top: box('.hm-status'),
    hero: box('#hm-hero'),
    news: box('#hm-news'),
    // 04.08: окремої секції телефонів унизу більше немає — вони стали плиткою
    // бенто. Міряємо саме плитку: вимога та сама (довідник не має з'їдати екран),
    // адреса інша.
    contacts: box('#hm-t-tel'),
    hello: box('.hm-kicker'),
    total: Math.round(main.scrollHeight),
    // Скільки РІЗНИХ форм на екрані. Це і є числова відповідь на «сторінка
    // виглядає як список однакових карток»: у варіанті 2 форма була ОДНА.
    shapes: ['.hm-hero', '.hm-tile', '.hm-rail > *', '.hm-tels']
      .filter(s2 => document.querySelector(s2)).length,
    // Декоративні пікселі на першому екрані: висота всього, що НЕ несе тексту.
    // У варіанті 2 це було фото 200px = 27%.
    decor: (() => {
      const ph = document.querySelector('.hm-hero-photo');
      // Фото головної плитки не рахуємо декором: воно ТЛО під змістом, а не
      // самостійний банер. Декором лишається те, що не має тексту взагалі.
      return ph && !ph.closest('.hm-hero').textContent.trim() ? Math.round(ph.getBoundingClientRect().height) : 0;
    })(),
  };
});

ok('рядок стану замість шапки-банера (<80px)', geo.top && geo.top.h < 80,
   `${geo.top?.h}px (оригінал 560px = 76.6% · варіант 2 — 200px)`);
ok('головна плитка на першому екрані', geo.hero && geo.hero.top < VIEW,
   `починається на ${geo.hero?.top}px, висота ${geo.hero?.h}px`);
// 🔴 Головна числова відповідь на закид «список однакових карток із 2021».
ok('на екрані ЩОНАЙМЕНШЕ 3 різні форми блоків', geo.shapes >= 3,
   `${geo.shapes} (варіант 2 мав 1 — усі блоки були білою карткою на всю ширину)`);
ok('декоративних пікселів на першому екрані немає', geo.decor === 0,
   `${geo.decor}px (варіант 2 — фото-банер 200px = 27%)`);
// ГОЛОВНА перевірка потоку: до редизайну новини починались на 662px, тобто нижче
// першого екрана. Поріг — сама видима зона: новини мусять ПОЧАТИСЬ у ній.
ok('новини починаються на першому екрані', geo.news && geo.news.top < VIEW,
   `на ${geo.news?.top}px при видимій зоні ${VIEW}px (було 662px)`);
ok('уся сторінка коротша за 2446px «до»', geo.total < 2446,
   `${geo.total}px = ${(geo.total / VIEW).toFixed(1)} екрана (оригінал 3.3 · варіант 2 — 2.4)`);
ok('екстрені телефони на екрані і не з\'їдають його', geo.contacts && geo.contacts.h < VIEW / 4,
   `плитка ${geo.contacts?.h}px (оригінал — секція 420px = 57.5%)`);
// ⚠️ 04.08, варіант G: мітки «ШО В СЕЛІ?» на екрані більше немає — екран став
// стрічкою новин, і зайвий заголовок над нею нічого не називав би. Назва живе
// в шухляді як підпис («Автобус · Дошка · Екстрені»). Перевірка знята свідомо,
// а не забута: якщо Вова захоче назву назад — повертати разом із нею.

// ── 2. Липка панель нічого не накриває ───────────────────────────────────────
// Міряємо НАСЛІДОК: чи є на головній хоч один липкий/фіксований елемент, який
// перекриває вміст. Раніше таким була панель «ШО В СЕЛІ?» (75px) — вона лежала
// поверх карток на всіх контрольних скріншотах.
// ⚠️ Шухляда (`hm-drawer`) — навмисно прибита: це її суть. Заборона стосується
// панелей, що НАКРИВАЮТЬ вміст під час читання; шухляда стоїть над таб-баром,
// а `.hm-body` має під неї нижній відступ 72px, тож нічого не ховає.
const sticky = await page.evaluate(() => [...document.querySelectorAll('#cm-content *')]
  .filter(e => ['sticky', 'fixed'].includes(getComputedStyle(e).position))
  .filter(e => !e.closest('.hm-drawer'))
  .map(e => e.className.toString().slice(0, 30)));
ok('липких панелей поверх контенту немає', sticky.length === 0, JSON.stringify(sticky));

// ── 3. Вкладені скролери й автоміни ──────────────────────────────────────────
const moving = await page.evaluate(() => {
  const root = document.getElementById('cm-content');
  const nestedY = [...root.querySelectorAll('*')].filter(e => {
    const cs = getComputedStyle(e);
    return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 1;
  }).map(e => e.className.toString().slice(0, 30));
  const railMax = Math.max(0, ...[...root.querySelectorAll('.hm-rail')].map(r => r.children.length));
  return {
    nestedY, railMax,
    boardCards: root.querySelectorAll('.cmbw-card').length,   // карусель Дошки
    evSlides:   root.querySelectorAll('.cm-ev-slide').length, // карусель Подій
    scaled: [...root.querySelectorAll('.cm-block, .hm-card, .hm-tile')].filter(e => getComputedStyle(e).transform !== 'none').length,
  };
});
// ⚠️ Смуга «ЗАРАЗ» — теж горизонтальний скролер, але вона гортається ЛИШЕ коли
// капсул більше, ніж влазить; на трьох капсулах прокрутки немає. Тому перевірка
// не забороняє скролери взагалі, а ловить саме ті, що ховають вміст усередині
// картки (це і був діагноз 9).
// ⚠️ Горизонтальні стрічки (`hm-rail`) — легальні: жест перпендикулярний
// прокрутці сторінки і набір обмежений (≤8 + вихід «усі»). Забороняємо саме
// ВЕРТИКАЛЬНІ вкладені скролери — ті, що ховають глибину всередині картки
// (діагноз 9 аудиту: 6468px вмісту у вікні 465px).
ok('вертикальних вкладених скролерів немає',
   moving.nestedY.length === 0, JSON.stringify(moving.nestedY));
ok('стрічка не ховає список (≤8 карток)', moving.railMax <= 9, `найдовша стрічка: ${moving.railMax}`);
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
  // Тихий текст беремо з плитки події — це той самий токен `--hm-ink-mute`.
  const lum = ([r, g, b]) => {
    const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const rgb = s => s.match(/\d+/g).slice(0, 3).map(Number);
  const el = document.querySelector('.hm-evt-meta') || document.querySelector('.hm-tile-sub');
  if (!el) return null;
  const fg = lum(rgb(getComputedStyle(el).color));
  const card = el.closest('.hm-evt, .hm-tile');
  const bg = lum(rgb(getComputedStyle(card).backgroundColor));
  const [hi, lo] = fg > bg ? [fg, bg] : [bg, fg];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
});
ok('тихий текст тримає контраст WCAG 4.5:1', contrast !== null && contrast >= 4.5, `${contrast}:1`);

// ── 6. Збори: немає даних → немає блока; є дані → є блок ─────────────────────
// Збір тепер живе в ГОЛОВНІЙ ПЛИТЦІ (слот з пріоритетом), а не окремою секцією.
const fundEmpty = await page.evaluate(() =>
  document.querySelector('[data-hero]')?.dataset.hero || null);
// Варіант G: плитка існує ЛИШЕ для термінового (збір / подія сьогодні).
// Немає ні того, ні того — плитки немає зовсім, і це правильний стан.
ok('без активних зборів плитки або немає, або в ній не збір', !fundEmpty || fundEmpty !== 'fund',
   `у плитці зараз: ${fundEmpty}`);

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
  const h = document.querySelector('[data-hero]');
  const bar = document.querySelector('#hm-hero [role=progressbar]');
  return { kind: h?.dataset.hero, pct: bar?.getAttribute('aria-valuenow') };
});
ok('КОНТРОЛЬ: активний збір ПІДНІМАЄТЬСЯ в головну плитку', fundFull.kind === 'fund',
   `у плитці: ${fundFull.kind}`);
ok('КОНТРОЛЬ: прогрес рахується правильно', fundFull.pct === '50', `aria-valuenow=${fundFull.pct} (50 з 100)`);

// ── 7. Жодної помилки в консолі ──────────────────────────────────────────────
ok('на головній немає JS-помилок', errors.length === 0, errors.join(' | '));

await browser.close();
await stop();
done();
