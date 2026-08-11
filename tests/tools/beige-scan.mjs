// tests/tools/beige-scan.mjs — ДЕ В ЗАСТОСУНКУ ЩЕ ЛИШИВСЯ БЕЖ.
//
// Замовлення Вови 11.08: «ми ж від цього бежевого тілесного фону відійшли вже…
// він уже не базовий колір в додатку. Видали його з документації».
//
// 🔑 Перед тим як щось видаляти, треба знати, ДЕ ВОНО ВИДНО ЛЮДИНІ. Пошук по CSS
// цього не дає: половина вживань сидить у файлах екранів, які не рендеряться
// взагалі (вкладка Подій), приховані (Світло) або недосяжні з інтерфейсу
// (легасі-групи). Тому міряємо ОБЧИСЛЕНИЙ колір на живих екранах.
//
// 📐 Критерій — ТЕПЛОТА (R−B) обчисленого фону, той самий поріг, що в
// `board-cream.mjs`: нейтральний сірий дає ≤3, найслабший кремовий `#FAF8EF` = 11.
// Поріг 6 лежить у розриві між родинами. Міряємо колір, а не назву токена —
// інакше перевірку обходив би будь-який новий hex.

import { chromium } from 'playwright';
import { launch, serve } from '../_lib.mjs';
import { mockSupabase } from '../_board-fixture.mjs';

const ПОРІГ = 6;
const ВКЛАДКИ = ['community', 'shotam', 'discussions', 'board', 'buses'];

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
await mockSupabase(p, { posts: [], comments: [], announcements: [] },
                  { user: { id: 'u-me', name: 'Я' } });
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(400);

const теплі = async () => p.evaluate((ПОРІГ) => {
  const видно = (el) => {
    let n = el;
    while (n && n.nodeType === 1) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
      n = n.parentElement;
    }
    return true;
  };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 12) continue;
    if (r.top > window.innerHeight || r.bottom < 0) continue;
    if (!видно(el)) continue;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(el).backgroundColor);
    if (!m) continue;
    const [, R, G, B] = m.map(Number);
    if (R === 0 && G === 0 && B === 0) continue;      // прозорий
    // 🔴 Лише СВІТЛІ поверхні. Перша редакція приладу цього не робила і показала
    // «беж» на Громаді — насправді то був темний бордовий бренду `rgb(26,10,14)`:
    // у нього R−B теж 12, бо бордовий за визначенням теплий. Беж — це проблема
    // СВІТЛОГО тла під контентом, а не будь-якого теплого кольору взагалі.
    if ((R + G + B) / 3 < 190) continue;
    const теплота = R - B;
    if (теплота >= ПОРІГ) {
      out.push({ клас: (el.className || el.tagName).toString().split(' ')[0].slice(0, 34),
                 колір: `rgb(${R},${G},${B})`, теплота,
                 площа: Math.round(r.width * r.height / 1000) });
    }
  }
  // Найбільші за площею — саме вони кидаються в очі.
  return out.sort((a, b) => b.площа - a.площа).slice(0, 8);
}, ПОРІГ);

console.log('══════ ДЕ ЩЕ ВИДНО БЕЖ (теплота R−B ≥ ' + ПОРІГ + ') ══════\n');
for (const tab of ВКЛАДКИ) {
  await p.evaluate(t => window.switchTab && window.switchTab(t), tab);
  await p.waitForTimeout(1300);
  const знайдено = await теплі();
  if (!знайдено.length) { console.log(`✅ ${tab.padEnd(12)} — чисто`); continue; }
  console.log(`🟡 ${tab.padEnd(12)} — ${знайдено.length} теплих поверхонь:`);
  for (const з of знайдено) console.log(`     ${з.клас.padEnd(34)} ${з.колір.padEnd(18)} теплота ${з.теплота}  ~${з.площа}k px²`);
}

await stop();
await b.close();
