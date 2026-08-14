// tests/tabbar-icons.mjs — ІКОНКИ ТАБ-БАРУ ОДНІЄЇ РОДИНИ. Заведено 14.08.2026.
//
// 🔴 НАВІЩО. Вова зі знімка: «іконка питання… мені здається вона менша ніж інші».
// Заміряно `getBBox()` — і виявилось, що вона НЕ менша: площа чорнила 280 проти
// 288 у Стрічки, 280 в Автобусів, 252 в Дошки. Справжня вада була інша: **центр
// чорнила стояв на `12.2, 10.7` замість `12, 12`**, тобто знак висів у верхній
// частині коробки. Око читає таке зміщення саме як «дрібніший» — і людина скаржиться
// на розмір, хоча причина в положенні.
//
// 🔑 ЩО САМЕ МІРЯЄМО І ЧОМУ САМЕ ТАК.
// Не «у svg стоїть width: 22px» (це було правдою і на зміщеній іконці), а ЧОРНИЛО:
// `getBBox()` віддає коробку намальованих шляхів у координатах viewBox. Саме її
// бачить око; розмір самого `<svg>` не каже про малюнок нічого.
//
// ⚠️ ТОВЩИНА ЛІНІЇ РАХУЄТЬСЯ З УРАХУВАННЯМ `scale`. Іконка «Питання» лежить у групі
// з `transform: scale(1.08)`, а `scale` множить і товщину лінії. Тому видима товщина
// = `stroke-width` групи × масштаб; перевіряти самий лише атрибут означало б
// пропустити рівно ту помилку, від якої тут захист (1.75 × 1.08 = 1.89 — жирніше
// за сусідні).
//
// 🛑 Центральну «Громаду» не міряємо: там растровий замок 44px у крузі, інша
// конструкція за задумом.

import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
// Контроль (доведення падінням) — версія розмітки, де іконка ще висіла вгорі:
//   HTML_REV=6c35e8ca node tests/tabbar-icons.mjs   → 16/17, cy=10.7
// ⚠️ Саме цей коміт, а не `origin/main`: перший прогін контролю взяв застарілий
// локальний `origin/main` (без іконок узагалі) і показав ЗЕЛЕНЕ — тобто контроль
// «пройшов», не торкнувшись вади. Перед контролем роби `git fetch`.
const HTML_REV = process.env.HTML_REV || '';

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
await mockSupabase(p, { posts: [], announcements: [] });
if (HTML_REV) {
  const old = projectFile('index.html', HTML_REV);
  await p.route('**/index.html', r => r.fulfill({ contentType: 'text/html', body: old }));
  await p.route(url + '/', r => r.fulfill({ contentType: 'text/html', body: old }));
}
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url + '/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(400);

const icons = await p.evaluate(() => {
  const out = [];
  document.querySelectorAll('.tab-bar .tab-item:not(.tab-item--home)').forEach(item => {
    const svg = item.querySelector('.tab-icon');
    if (!svg) return;
    const bb = svg.getBBox();
    const r  = svg.getBoundingClientRect();
    // Видима товщина: атрибут групи × її масштаб (scale множить і лінію).
    const g  = svg.querySelector('g[stroke-width]');
    const m  = (g?.getAttribute('transform') || '').match(/scale\(([\d.]+)\)/);
    const sw = g
      ? parseFloat(g.getAttribute('stroke-width')) * (m ? parseFloat(m[1]) : 1)
      : parseFloat(svg.getAttribute('stroke-width'));
    out.push({
      tab: item.dataset.tab,
      w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      inkW: +bb.width.toFixed(1), inkH: +bb.height.toFixed(1),
      cx: +(bb.x + bb.width / 2).toFixed(1),
      cy: +(bb.y + bb.height / 2).toFixed(1),
      area: Math.round(bb.width * bb.height),
      sw: +sw.toFixed(2),
      viewBox: svg.getAttribute('viewBox'),
    });
  });
  return out;
});

console.log('\n── чорнило іконок таб-бару ──');
icons.forEach(i => console.log(
  `   ${i.tab.padEnd(12)} коробка ${i.w}×${i.h}  чорнило ${i.inkW}×${i.inkH}  ` +
  `центр ${i.cx},${i.cy}  площа ${i.area}  лінія ${i.sw}`));

ok('усі чотири іконки на місці', icons.length === 4, `${icons.length}`);

// 1. Однакова коробка і однакова система координат.
const boxes = new Set(icons.map(i => `${i.w}×${i.h}`));
ok('коробка однакова в усіх', boxes.size === 1, [...boxes].join(' / '));
const vbs = new Set(icons.map(i => i.viewBox));
ok('viewBox однаковий в усіх', vbs.size === 1, [...vbs].join(' / '));

// 2. Товщина лінії — ОДНА на всю родину.
const sws = new Set(icons.map(i => i.sw));
ok('видима товщина лінії однакова', sws.size === 1, [...sws].join(' / '));

// 3. 🔴 ГОЛОВНЕ: чорнило відцентроване. Саме тут і була вада.
// Допуск 0.6 одиниці viewBox ≈ 0.5px на екрані — менше око не ловить, більше вже
// читається як «іконка сидить не так, як сусідні».
icons.forEach(i => {
  ok(`«${i.tab}»: чорнило відцентроване по горизонталі`, Math.abs(i.cx - 12) <= 0.6, `cx=${i.cx}`);
  ok(`«${i.tab}»: чорнило відцентроване по вертикалі`,   Math.abs(i.cy - 12) <= 0.6, `cy=${i.cy}`);
});

// 4. Розмір однієї родини: жодна не мусить бути помітно дрібнішою чи більшою.
// Поріг 1.6× взято з ЖИВОГО розкиду решти знаків: 288 (Стрічка) проти 252 (Дошка)
// це вже 1.14×, і воно виглядає рівно — тобто ширший допуск тут чесніший за
// вигаданий «±10%», який завалив би цілком нормальну Дошку.
const areas = icons.map(i => i.area);
const ratio = Math.max(...areas) / Math.min(...areas);
ok('жодна іконка не випадає з родини за розміром', ratio <= 1.6,
   `найбільша/найменша = ${ratio.toFixed(2)} (${Math.min(...areas)}…${Math.max(...areas)})`);

// 5. Чорнило не впирається в край коробки — інакше знак виглядав би обрізаним.
// viewBox 24, стеля 22 по кожній осі (лишає ~1 одиницю на половину лінії з боків).
icons.forEach(i => {
  ok(`«${i.tab}»: чорнило не впирається в край`, i.inkW <= 22 && i.inkH <= 22,
     `${i.inkW}×${i.inkH}`);
});

await b.close();
await stop();
done();
