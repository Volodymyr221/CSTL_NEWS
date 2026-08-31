// ІНСТРУМЕНТ: чи змінюється ПЕРЕНОС назви спільноти, коли кружечок стає активним.
//
// 🗣️ Скарга Вови (31.08, три знімки): «коли спільнота виділяється, переноситься одна
// буква — ТУРИСТИЧН / А ОЛИКА. Олицька міська рада в спокої пише правильно, а
// наведена — кожне слово на окремий рядок і три крапки».
//
// 🔴 ПЕРША РЕДАКЦІЯ ЦЬОГО ІНСТРУМЕНТА ЗБРЕХАЛА, і це записано тут навмисно.
// Я реконструював сцену власним HTML (flex, gap 8px) — вийшла колонка 89px, усе
// «влазило» в обох станах, і вимір сказав «вади немає» над справжньою вадою.
// Реальний контейнер `.hm-fd-circles` — це GRID з `grid-auto-columns: 1fr`, тобто
// ширина колонки залежить від кількості кружечків і `--hm-s1`.
// ➡️ Тому тут піднімається ЖИВИЙ застосунок, а не копія розмітки.
//
// Запуск: node tests/tools/fd-name-wrap-probe.mjs
import { chromium } from 'playwright';
import { chromiumPath, serve } from '../_lib.mjs';
import { mockSupabase } from '../_board-fixture.mjs';

const PAGES = [
  { id: 1, name: 'КЦ «Центр культури, спорту та дозвілля»', sort_order: 0, avatar_url: null, is_system: false },
  { id: 2, name: 'Історія громади',    sort_order: 1, avatar_url: null, is_system: false },
  { id: 3, name: 'Олицька міська рада', sort_order: 2, avatar_url: null, is_system: false },
  { id: 4, name: 'Olyka Castle',        sort_order: 3, avatar_url: null, is_system: false },
  { id: 5, name: 'Туристична Олика',    sort_order: 4, avatar_url: null, is_system: false },
  // 🔴 СТРЕС-НАЗВИ: перевіряємо ЗАПАС, а не лише сьогоднішній випадок.
  // Вова просив «щоб це стосувалось не тільки цих трьох, а всіх, які будуть».
  { id: 6, name: 'Адміністрація громади', sort_order: 5, avatar_url: null, is_system: false },
];
const POSTS = PAGES.map((pg, i) => ({
  id: 100 + i, page_id: pg.id, text: `Допис ${pg.name}`, photos: [], author_uid: 'u1',
  show_author: false, created_at: new Date(Date.now() - i * 3600e3).toISOString(),
  // 🔑 `fetchLatestPostPerPage` фільтрує саме за цими двома — без них віджет порожній.
  status: 'published', deleted_at: null,
}));

const { url, stop } = await serve();
const ep = chromiumPath();
const b = await chromium.launch({ ...(ep ? { executablePath: ep } : {}) });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
await mockSupabase(p, { pages: PAGES, page_posts: POSTS });
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);
await p.evaluate(() => document.querySelector('.consent-ok, [data-consent-ok], .pwa-cta button')?.click());
await p.evaluate(() => window.switchTab && window.switchTab('community'));
await p.waitForTimeout(3000);

const дані = await p.evaluate(() => {
  const кола = [...document.querySelectorAll('.hm-fd-c')];
  if (!кола.length) return null;
  // 🔑 МІРЯЄМО НЕ scrollHeight, А ШИРИНУ СЛОВА. Перша спроба дивилась на висоту —
  // марно: `-webkit-line-clamp: 2` уже обрізав текст, тож висота ЗАВЖДИ дорівнює
  // двом рядкам, і вада не видна. Вирішує перенос саме ширина: у назви стоїть
  // `overflow-wrap: anywhere`, тобто слово, ширше за колонку, РВЕТЬСЯ посеред —
  // звідси «ТУРИСТИЧН / А ОЛИКА».
  const шир = (текст, вага, кегль, родина) => {
    const cv = document.createElement('canvas').getContext('2d');
    cv.font = `${вага} ${кегль} ${родина}`;
    return cv.measureText(текст).width;
  };
  // 🔴 МІРЯЄМО ФАКТИЧНУ ВАГУ, ЯКУ ЗАСТОСУВАВ CSS, А НЕ ГІПОТЕТИЧНУ.
  // Перша редакція рахувала 500 і 700 незалежно від стилів — і після фіксу давала
  // ті самі числа, тобто не могла ДОВЕСТИ, що фікс подіяв. Тепер клас `--on`
  // ставиться по-справжньому, і вага береться з `getComputedStyle`.
  const міра = (c) => {
    const n = c.querySelector('.hm-fd-c-name');
    const назва = n.textContent.trim();
    const колонка = n.clientWidth;
    const слова = назва.split(/\s+/);
    const заВагою = () => {
      const cs = getComputedStyle(n);   // фактичний кегль ПІСЛЯ fitCircleNames
      const cv = document.createElement('canvas').getContext('2d');
      cv.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const w = слова.map(sl => cv.measureText(sl).width);
      const найдовше = Math.max(...w);
      return { вага: cs.fontWeight, кегль: cs.fontSize, слово: слова[w.indexOf(найдовше)],
               ширина: +найдовше.toFixed(1), рветься: найдовше > колонка };
    };
    c.classList.remove('hm-fd-c--on');
    const спокій = заВагою();
    c.classList.add('hm-fd-c--on');
    const активна = заВагою();
    c.classList.remove('hm-fd-c--on');
    return { назва, колонка, спокій, активна };
  };
  const рядки = кола.map(міра);
  return { рядки, колонка: рядки[0]?.колонка };
  return { спокій, активні, колонка: спокій[0]?.ширина };
});

if (!дані) {
  const діаг = await p.evaluate(() => ({
    вкладка: document.querySelector('.app-main')?.dataset.tab,
    є_віджет: !!document.querySelector('.hm-fd'),
    класи: [...document.querySelectorAll('[class*="hm-fd"]')].slice(0,6).map(e=>e.className),
    заслінка: !!document.querySelector('#dev-lock, .dev-lock'),
    текст: (document.body.innerText||'').slice(0,160).replace(/\n+/g,' | '),
  }));
  console.log('❌ кружечків немає. Діагностика:'); console.log(діаг);
}
else {
  console.log(`ширина колонки: ${дані.колонка}px · кружечків: ${дані.рядки.length}\n`);
  console.log('назва'.padEnd(24) + '│ найдовше    │ спокій кегль→слово │ активна кегль→слово│');
  console.log('─'.repeat(88));
  дані.рядки.forEach(r => {
    const зламано = !r.спокій.рветься && r.активна.рветься;
    console.log(
      r.назва.slice(0, 23).padEnd(24) + '│ ' +
      r.спокій.слово.slice(0, 12).padEnd(13) + '│ ' +
      `${r.спокій.кегль} → ${r.спокій.ширина}px`.padEnd(18) + '│ ' +
      `${r.активна.кегль} → ${r.активна.ширина}px`.padEnd(18) + '│ ' +
      (зламано ? '❌ РВЕТЬСЯ ПРИ АКТИВАЦІЇ' : r.активна.рветься ? '⚠️ рветься в обох' : '✅'));
  });
}
await stop(); await b.close();
