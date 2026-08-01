// tests/tools/news-road1.mjs — ПОКАЗАТИ ДОРОГУ 1 ПІСЛЯ ТОГО, ЯК ОБРАЛИ ДОРОГУ 2.
//
// Навіщо окремий інструмент, коли є `news-roads.mjs`.
//   Той писався ДО мерджу PR #734, коли віджет ще був багряним: його `ROAD_1`
//   лише прибирав обідок картки, розраховуючи, що прилад на місці. Після #734
//   прилад ЗНЯТО в бойовому коді, тож той самий CSS тепер показує не дорогу 1,
//   а дорогу 2 без обідка. Щоб глянути дорогу 1 сьогодні, прилад треба ПОВЕРНУТИ.
//
// 🔑 Усе малюється накладеним <style> поверх живої сторінки — жоден файл у `src/`
//    і `style/` не змінюється. «Не сподобалось» коштує нуль.
//
// 🔴 ФОТО ПІДМІНЯЮТЬСЯ ЛОКАЛЬНИМИ — і це не косметика знімка.
//    Урок 01.08 (записаний у BYYOU_PLAN): попередні знімки варіантів малювались
//    із БИТИМИ зображеннями (сірі заглушки — у пісочниці немає мережі). Через це
//    список виглядав значно голішим, ніж він є на живих даних, і з поганого
//    рендера народився хибний висновок аудиту. Правило проєкту «міряй те, що
//    побачить Вова» діє і на знімки.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { chromiumPath, serve, ROOT } from '../_lib.mjs';

const OUT = 'shots/road1';
mkdirSync(OUT, { recursive: true });

// ── ДОРОГА 1 — ПОВЕРНУТИ ПРИЛАД І НАВЕСТИ В НЬОМУ ЛАД ───────────────────────
// Багряний градієнт, глянець, віньєтка і силует замку — дослівно з версії до
// PR #734 (`git show 4a5e6425^:style/community.css`). Разом із тлом мусять
// повернутись і кольори тексту: на світлому вони темні, на багряному — кремові.
// Це і є те, про що попереджає коментар у бойовому CSS: «плюс кольори тексту
// нижче — вони теж перевернуті на світле тло».
const ROAD_1 = `
  .cm-block--news {
    background:
      radial-gradient(120% 88% at 50% 42%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.55) 100%),
      radial-gradient(120% 80% at 25% 6%, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 42%),
      linear-gradient(162deg, #7B303C 0%, #722F37 44%, #481C24 100%) !important;
    border: 1px solid rgba(0, 0, 0, 0.35) !important;
    border-radius: 18px !important;
    box-shadow:
      0 8px 20px rgba(0, 0, 0, 0.24),
      0 2px 6px rgba(0, 0, 0, 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.14) !important;
  }
  /* Силует замку — три вежі світлішими за фон (на багряному працює саме так). */
  .cm-block--news::before {
    content: '';
    position: absolute;
    top: 34px; right: 18px;
    width: 190px; height: 130px;
    background:
      linear-gradient(#ffffff, #ffffff) 60px 40px / 34px 90px no-repeat,
      linear-gradient(#ffffff, #ffffff) 100px 10px / 46px 120px no-repeat,
      linear-gradient(#ffffff, #ffffff) 150px 40px / 34px 90px no-repeat;
    opacity: 0.035;
    pointer-events: none;
    z-index: 0;
    display: block !important;
  }
  .cm-news-board-bar { color: #F3DECB !important; }
  .cm-news-new { background: rgba(255, 255, 255, 0.16) !important; color: #FFF1F3 !important; }
  /* Мʼяке центральне світіння «екрана приладу». */
  .cm-block--news .cm-block-body {
    background:
      radial-gradient(75% 55% at 50% 50%, rgba(255,170,185,0.16) 0%, rgba(255,140,160,0.04) 48%, rgba(255,140,160,0) 72%) !important;
  }
  .cm-news-controls { border-top: 1px solid rgba(255, 255, 255, 0.16) !important; }
  .cm-news-all { color: rgba(255, 236, 240, 0.92) !important; }
  /* Картка: кремова, БЕЗ обідка (на багряному вона виступає сама), з тінню.
     Саме так було до #734 — «подвійної межі» у віджеті насправді не було,
     обідок зʼявився разом зі світлим тлом. */
  .cm-news-top3 {
    --nc-card: var(--bg-card) !important;
    --nc-line: transparent !important;
  }
  .cm-news-top3 .nc {
    box-shadow: 0 4px 12px rgba(0,0,0,0.22), 0 1px 3px rgba(0,0,0,0.16) !important;
  }
`;

// ── ЗАМОВЛЕННЯ ВОВИ: багряний + обідок «як у відкритій сторінці новини» ──────
// Сторінка новин (хаб) дає картці `--news-card: #FFFFFF` + `--news-line: #C9CBCE`
// (`style/base.css:89-90`). Беремо ТІ САМІ токени, щоб новина виглядала однаково
// у віджеті й на сторінці.
// ⚠️ Одне застереження, заміряне: `#C9CBCE` підбирався за контрастом до СВІТЛОГО
//    фону хаба (1.399). На багряному тлі він читається інакше — тому знімаємо
//    два підваріанти, з тінню і без.
const CARD_HUB = `
  .cm-news-top3 {
    --nc-card: var(--news-card) !important;
    --nc-line: var(--news-line) !important;
  }
`;
// Обідок ПЛЮС глибока тінь = два розділювачі в одному місці (помилка, через яку
// 29.07 «давило на очі» на Дошці). Тому основний підваріант — обідок без тіні.
const ROAD_1_HUB_FLAT = ROAD_1 + CARD_HUB + `
  .cm-news-top3 .nc { box-shadow: none !important; }
`;
// Другий — обідок і ТИХА тінь: на багряному картка все-таки лежить на темному,
// і невелика тінь може бути потрібна, щоб вона не виглядала наклейкою.
const ROAD_1_HUB_SOFT = ROAD_1 + CARD_HUB + `
  .cm-news-top3 .nc { box-shadow: 0 2px 6px rgba(0,0,0,0.18) !important; }
`;

// ── Локальні фото замість зовнішніх ─────────────────────────────────────────
const PHOTOS = ['photos/olyka.day-1.jpg', 'photos/olyka.day-2.jpg', 'photos/olyka.day-3.jpg',
                'photos/olyka.evening-1.jpg', 'photos/olyka.evening-2.jpg'];
const BYTES = PHOTOS.map(p => readFileSync(join(ROOT, p)));

const { url, stop } = await serve();
const executablePath = chromiumPath();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });
// ⚠️ `serviceWorkers: 'block'` — БЕЗ цього підміна фото мовчки не працює.
// Заміряно: лічильник підмін показував 0, хоча правило route стояло. Причина —
// запити, що йдуть через Service Worker, `page.route` не перехоплює, а `sw.js`
// у цьому проєкті обслуговує саме картинки (cache-first). Знімок при цьому
// виглядав правдоподібно (у картках стояли плейсхолдери битого фото), тобто
// перевірка брехала б тихо — рівно те, від чого застерігає правило проєкту
// «міряй те, що побачить Вова».
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('❌ помилка сторінки:', e.message));

await page.route('**://*.supabase.co/**', r => r.abort());
await page.route('**://api.open-meteo.com/**', r => r.abort());

// Будь-яка зовнішня картинка → локальне фото Олики, по колу.
let nth = 0;
await page.route('**/*', (route) => {
  const req = route.request();
  const u = req.url();
  if (req.resourceType() === 'image' && !u.startsWith(url)) {
    const body = BYTES[nth++ % BYTES.length];
    return route.fulfill({ status: 200, contentType: 'image/jpeg', body });
  }
  return route.continue();
});

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.evaluate(() => window.switchTab && window.switchTab('community'));
await page.waitForTimeout(1800);
await page.evaluate(() => document.querySelector('.consent, .cookie, [class*="consent"]')?.remove());

const apply = (css) => page.evaluate((c) => {
  document.getElementById('road1-style')?.remove();
  if (!c) return;
  const s = document.createElement('style');
  s.id = 'road1-style'; s.textContent = c;
  document.head.appendChild(s);
}, css);

const VIEW = 844 - 56 - 57;   // екран мінус шапка і таб-бар
const rows = [];
const shot = async (label, name) => {
  const m = await page.evaluate(() => {
    const n = document.getElementById('cm-news-board');
    if (!n) return null;
    const cards = [...n.querySelectorAll('.nc')].map(c => Math.round(c.getBoundingClientRect().height));
    const withPhoto = n.querySelectorAll('.nc-img:not(.nc-img--mono)').length;
    const mono = n.querySelectorAll('.nc-img--mono').length;
    return { h: Math.round(n.getBoundingClientRect().height), cards, withPhoto, mono };
  });
  if (!m) { console.log('❌ віджет не знайдено'); return; }
  rows.push(`${label.padEnd(24)} ${String(m.h).padStart(4)}px  ${(m.h / VIEW * 100).toFixed(1).padStart(5)}%   картки ${m.cards.join('/')}  фото ${m.withPhoto} монограм ${m.mono}`);
  const el = await page.$('#cm-news-board');
  if (el) await el.screenshot({ path: `${OUT}/${name}.png` });
  // Заразом — увесь екран: віджет треба бачити в оточенні, а не вирізаним.
  await page.screenshot({ path: `${OUT}/${name}-екран.png` });
};

await apply('');
await shot('ЗАРАЗ (дорога 2)', '0-зараз');

await apply(ROAD_1);
await page.waitForTimeout(500);
await shot('ДОРОГА 1 (прилад)', '1-дорога1');

await apply(ROAD_1_HUB_FLAT);
await page.waitForTimeout(500);
await shot('+ обідок хаба, без тіні', '2-обідок-без-тіні');

await apply(ROAD_1_HUB_SOFT);
await page.waitForTimeout(500);
await shot('+ обідок хаба, тиха тінь', '3-обідок-тиха-тінь');

console.log('\n' + rows.join('\n'));
console.log(`підмінено картинок: ${nth}`);
console.log(`\nвидима зона ${VIEW}px · знімки → ${OUT}/`);

await browser.close();
await stop();
