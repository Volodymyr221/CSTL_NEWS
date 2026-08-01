// tests/tools/board-b.mjs — ПРОТОТИП «B» НОВОЇ ДОШКИ на ЖИВИХ даних.
//
// Що це: макет, а не код. Малюється поверх живої сторінки у `#board-content`,
// бойові файли не змінюються — «не сподобалось» коштує нуль.
//
// 🔴 ДАНІ СПРАВЖНІ (17 опублікованих оголошень, витягнуті з Supabase у
//    `_board-live.json`). Це принципово: макет ChatGPT малювався на вигаданих
//    даних (128 оголошень, ціна на кожній картці), і саме тому в ньому працює
//    те, що в нас не спрацює. Наші числа: 17 оголошень, ціна у 1, фото у 14.
//
// Критерій, який тут міряється, — КОМПАКТНІСТЬ: скільки пікселів з'їдає шапка
// до першої картки і скільки карток видно без прокрутки.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { chromiumPath, serve, ROOT } from '../_lib.mjs';

const OUT = 'shots/board-b';
mkdirSync(OUT, { recursive: true });
// 🔴 ЖИВІ ДАНІ НЕ ЛЕЖАТЬ У РЕПОЗИТОРІЇ — і це навмисно: репозиторій ПУБЛІЧНИЙ
// (урок 01.08, аудит безпеки), а це оголошення реальних людей з іменами й
// локаціями. Файл у `.gitignore`; щоб отримати його, виконай у Supabase:
//   select id, category, title, left(text,120) as text, photos, price, currency,
//          price_negotiable, location, author, ts
//   from posts where type='board' and status='published'
//   order by coalesce(bumped_at, published_at, created_at) desc;
// і збережи масив як tests/tools/_board-live.json
const LIVE = join(ROOT, 'tests/tools/_board-live.json');
if (!existsSync(LIVE)) {
  console.log('❌ Немає tests/tools/_board-live.json — як його зробити, написано в шапці цього файлу.');
  process.exit(1);
}
const ADS = JSON.parse(readFileSync(LIVE, 'utf8'));

// Локальні фото замість недосяжних із пісочниці адрес Supabase.
const PHOTOS = ['photos/olyka.day-1.jpg', 'photos/olyka.day-2.jpg', 'photos/olyka.day-3.jpg',
                'photos/olyka.evening-1.jpg', 'photos/olyka.evening-2.jpg', 'photos/olyka.day-4.jpg'];
const BYTES = PHOTOS.map(p => readFileSync(join(ROOT, p)));

const CSS = `
/* ── HERO: той самий «прилад», що й табло новин — бренд один на застосунок.
      Компактний: назва + слоган одним рядком + пошук. Згортається при скролі
      (механіка вже є на Дошці), тож може дозволити собі 2 рядки тексту. */
#bp {
  position: sticky; top: 0; z-index: 5;
  padding: 10px 14px 9px;
  background:
    radial-gradient(120% 88% at 50% 42%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.55) 100%),
    radial-gradient(120% 80% at 25% 6%, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 42%),
    linear-gradient(162deg, #7B303C 0%, #722F37 44%, #481C24 100%);
  border-radius: 0 0 18px 18px;
  box-shadow: 0 6px 18px rgba(0,0,0,0.22);
}
#bp .bp-top { display: flex; align-items: flex-start; gap: 12px; }
#bp h1 {
  margin: 0; font-size: 19px; font-weight: 800; letter-spacing: 0.3px;
  color: #fff; line-height: 1.15;
}
#bp .bp-sub {
  margin: 2px 0 0; font-size: 11.5px; line-height: 1.25;
  color: rgba(255,236,240,0.78);
}
/* Кнопка «Додати» — головна дія екрана, тому вона ТУТ, а не FAB у кутку:
   у дошки оголошень подати важливіше, ніж гортати. */
#bp .bp-add {
  flex: none; width: 46px; height: 46px; border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.28);
  background: rgba(255,255,255,0.14);
  color: #fff; font-size: 26px; font-weight: 300; line-height: 1;
  display: flex; align-items: center; justify-content: center;
}
#bp .bp-search {
  display: flex; gap: 8px; margin-top: 9px;
}
#bp .bp-field {
  flex: 1; display: flex; align-items: center; gap: 7px;
  height: 36px; padding: 0 11px; border-radius: 10px;
  background: rgba(255,255,255,0.13);
  border: 1px solid rgba(255,255,255,0.18);
  color: rgba(255,236,240,0.62); font-size: 13.5px;
}
#bp .bp-filter {
  flex: none; height: 36px; padding: 0 13px; border-radius: 10px;
  background: rgba(255,255,255,0.13);
  border: 1px solid rgba(255,255,255,0.18);
  color: #fff; font-size: 13px; font-weight: 600;
  display: flex; align-items: center; gap: 6px;
}

/* ── ТИПИ: один ряд, і ТІЛЬКИ ті, що не порожні.
      На макеті було 5 кнопок із лічильниками 128/32/54/12/30. У нас «Обміняю»
      і «Віддам» дорівнюють нулю — дві мертві кнопки зробили б екран порожнім
      (та сама пастка, що з чіпами табла новин 31.07). */
#bp-types {
  display: flex; gap: 7px; overflow-x: auto; scrollbar-width: none;
  padding: 8px 14px 7px;
}
#bp-types::-webkit-scrollbar { display: none; }
#bp-types .bp-chip {
  flex: none; height: 32px; padding: 0 13px; border-radius: 999px;
  display: flex; align-items: center; gap: 6px;
  background: var(--board-card, #fff);
  border: 1px solid var(--board-line, #C4C4C1);
  font-size: 13px; font-weight: 600; color: #1B1B1B;
  white-space: nowrap;
}
#bp-types .bp-chip.on { background: #722F37; border-color: #722F37; color: #fff; }
#bp-types .bp-n { font-size: 12px; opacity: 0.55; font-weight: 700; }
#bp-types .bp-chip.on .bp-n { opacity: 0.75; }

/* ── КАРТКА: один стовпчик. Причина не мода, а арифметика — у двох колонках
      рядку лишається ~175px, і фото + ціна + локація туди не влазять; саме
      тому картка й читалась «стікером». Тут рядку 358px. */
#bp-list { padding: 1px 14px 16px; display: flex; flex-direction: column; gap: 8px; }
.bpc {
  display: flex; gap: 10px; padding: 9px;
  background: var(--board-card, #fff);
  border: 1px solid var(--board-line, #C4C4C1);
  border-radius: 14px;
  position: relative;
}
.bpc-img {
  flex: none; width: 76px; height: 76px; border-radius: 10px;
  object-fit: cover; background: #ECECEA;
}
/* Монограма для оголошень без фото — рівна висота рядка незалежно від даних
   (той самий прийом, що врятував рвані картки новин). */
.bpc-mono {
  flex: none; width: 76px; height: 76px; border-radius: 10px;
  background: rgba(0,0,0,0.05); color: rgba(0,0,0,0.28);
  display: flex; align-items: center; justify-content: center;
  font-size: 26px; font-weight: 800;
}
.bpc-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
/* Мітка типу — кольоровий ТЕКСТ, не «цукерка» з плашкою: на екрані їх буде
   стільки ж, скільки карток, і плашки зробили б список строкатим. */
.bpc-meta { display: flex; align-items: center; gap: 7px; margin-bottom: 3px; }
.bpc-type { font-size: 10px; font-weight: 800; letter-spacing: 0.7px; }
.bpc-type--sell { color: #1B7F4B; }
.bpc-type--buy  { color: #1D5FA8; }
.bpc-type--serv { color: #6B4796; }
.bpc-type--ad   { color: #6C6C6C; }
.bpc-time { font-size: 11px; color: #8A8A8A; }
.bpc-title {
  margin: 0; font-size: 14px; font-weight: 700; line-height: 1.28; color: #141414;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.bpc-foot {
  margin-top: 5px;
  display: flex; align-items: baseline; gap: 8px;
}
.bpc-loc {
  flex: 1; min-width: 0; font-size: 11.5px; color: #7A7A7A;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* Ціна є лише в 1 оголошення з 17 — тому вона НЕ окрема колонка, а елемент,
   якого може не бути; без неї місце забирає локація, а не порожнеча. */
.bpc-price { flex: none; font-size: 14px; font-weight: 800; color: #722F37; }
.bpc-fav {
  position: absolute; top: 8px; right: 9px;
  font-size: 15px; color: #C9CBCE;
}
`;

const TYPE = {
  'продам':     { label: 'ПРОДАМ',     cls: 'sell', chip: 'Продам' },
  'куплю':      { label: 'КУПЛЮ',      cls: 'buy',  chip: 'Куплю' },
  'послуга':    { label: 'ПОСЛУГА',    cls: 'serv', chip: 'Послуги' },
  'оголошення': { label: 'ОГОЛОШЕННЯ', cls: 'ad',   chip: 'Інше' },
};

const { url, stop } = await serve();
const browser = await chromium.launch({ executablePath: chromiumPath() });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.route('**://*.supabase.co/**', r => r.abort());
await page.route('**://api.open-meteo.com/**', r => r.abort());
let nth = 0;
await page.route('**/*', (route) => {
  const req = route.request();
  if (req.resourceType() === 'image' && !req.url().startsWith(url)) {
    return route.fulfill({ status: 200, contentType: 'image/jpeg', body: BYTES[nth++ % BYTES.length] });
  }
  return route.continue();
});
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3200);
await page.evaluate(() => window.switchTab && window.switchTab('board'));
await page.waitForTimeout(1800);
await page.evaluate(() => document.querySelector('.consent, .cookie, [class*="consent"]')?.remove());

const metrics = await page.evaluate(({ ads, css, TYPE }) => {
  document.getElementById('bp-style')?.remove();
  const st = document.createElement('style'); st.id = 'bp-style'; st.textContent = css;
  document.head.appendChild(st);

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ago = raw => {
    // ⚠️ У частині записів `ts` збережений у СЕКУНДАХ, а не мілісекундах —
    // без цієї нормалізації картка писала «20666 дн тому» (заміряно на живих даних).
    let ts = Number(raw) || 0;
    if (ts > 0 && ts < 1e12) ts *= 1000;
    if (!ts) return 'нещодавно';
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'щойно';
    if (m < 60) return `${m} хв тому`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} год тому`;
    return `${Math.floor(h / 24)} дн тому`;
  };
  const counts = {};
  ads.forEach(a => { counts[a.category] = (counts[a.category] || 0) + 1; });
  const chips = Object.keys(counts)
    .filter(k => counts[k] > 0)
    .sort((a, b) => counts[b] - counts[a])
    .map(k => `<div class="bp-chip">${(TYPE[k] || {}).chip || k}<span class="bp-n">${counts[k]}</span></div>`)
    .join('');

  const cards = ads.map(a => {
    const t = TYPE[a.category] || { label: String(a.category || '').toUpperCase(), cls: 'ad' };
    const ph = (a.photos || [])[0];
    const img = ph
      ? `<img class="bpc-img" src="${esc(ph)}" alt="">`
      : `<div class="bpc-mono">${esc((a.title || a.text || '?').trim().charAt(0).toUpperCase())}</div>`;
    const price = a.price != null
      ? `<div class="bpc-price">${Number(a.price).toLocaleString('uk-UA')} ${a.currency === 'USD' ? '$' : 'грн'}</div>` : '';
    return `<article class="bpc">
      ${img}
      <div class="bpc-body">
        <div class="bpc-meta"><span class="bpc-type bpc-type--${t.cls}">${esc(t.label)}</span><span class="bpc-time">· ${ago(a.ts)}</span></div>
        <h3 class="bpc-title">${esc(a.title || a.text)}</h3>
        <div class="bpc-foot">
          <span class="bpc-loc">📍 ${esc(a.location || 'Олицька громада')}</span>
          ${price}
        </div>
      </div>
      <span class="bpc-fav">♡</span>
    </article>`;
  }).join('');

  const root = document.querySelector('#board-content');
  root.innerHTML = `
    <div id="bp">
      <div class="bp-top">
        <div style="flex:1;min-width:0">
          <h1>ДОШКА ОГОЛОШЕНЬ</h1>
          <p class="bp-sub">Знайди, продай, обміняй або віддай безкоштовно</p>
        </div>
        <div style="text-align:center">
          <div class="bp-add">+</div>
        </div>
      </div>
      <div class="bp-search">
        <div class="bp-field">🔍 Пошук оголошень…</div>
        <div class="bp-filter">⇄ Фільтри</div>
      </div>
    </div>
    <div id="bp-types">
      <div class="bp-chip on">Усі<span class="bp-n">${ads.length}</span></div>
      ${chips}
    </div>
    <div id="bp-list">${cards}</div>`;

  const r = el => el.getBoundingClientRect();
  const hero = document.getElementById('bp');
  const first = document.querySelector('.bpc');
  const VIEW = 844 - 57;   // до таб-бару
  const visible = [...document.querySelectorAll('.bpc')].filter(c => r(c).top < VIEW).length;
  return {
    'висота hero': Math.round(r(hero).height),
    'висота ряду типів': Math.round(r(document.getElementById('bp-types')).height),
    'до першої картки': Math.round(r(first).top),
    'висота картки': Math.round(r(first).height),
    'карток видно без прокрутки': visible,
    'усього карток': ads.length,
    'чіпів типів': document.querySelectorAll('#bp-types .bp-chip').length,
  };
}, { ads: ADS, css: CSS, TYPE });

await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/B-верх.png` });
// ⚠️ Прокручується НЕ вікно, а внутрішній контейнер вкладки — `window.scrollTo`
// тут не робить нічого (перший прогін дав два однакові кадри).
await page.evaluate(() => {
  const el = [...document.querySelectorAll('*')]
    .find(n => n.scrollHeight > n.clientHeight + 40 && getComputedStyle(n).overflowY !== 'visible');
  if (el) el.scrollTop = 430;
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/B-список.png` });

console.log(JSON.stringify(metrics, null, 1));
await browser.close();
await stop();
