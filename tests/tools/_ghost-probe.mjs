// ПРИЛАД (крок 1 /byyou): чи закриває меню «привид тапу» по бургеру.
// Нічого не доводить про фікс — лише міряє ЧИННИЙ стан.
import { chromium } from 'playwright';
import { launch, serve, blockExternal } from '../_lib.mjs';

const srv = await serve();
const browser = await launch(chromium);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
await blockExternal(page);
await page.goto(srv.url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#sidebar-toggle', { timeout: 15000 });
await page.waitForTimeout(800);
// 🔴 СПЛЕШ. Перша редакція приладу цього не врахувала і показала, що під пальцем
// лежить `#splash` — тобто міряла заставку, а не меню.
await page.waitForFunction(() => {
  const s = document.getElementById('splash');
  return !s || getComputedStyle(s).display === 'none' || getComputedStyle(s).opacity === '0' || s.hidden;
}, { timeout: 15000 }).catch(() => console.log('⚠️ сплеш не зник — числа нижче недійсні'));
await page.waitForTimeout(300);

const burger = await page.evaluate(() => {
  const r = document.getElementById('sidebar-toggle').getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
});
console.log('бургер у точці', burger);

// 1. ЩО ЛЕЖИТЬ ПІД ПАЛЬЦЕМ у перші кадри після відкриття
const timeline = await page.evaluate(async b => {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  document.getElementById('sidebar-toggle').click();
  const t0 = performance.now();
  const rows = [];
  for (const ms of [0, 16, 50, 100, 150, 200, 260, 300, 350, 420]) {
    while (performance.now() - t0 < ms) await new Promise(r => requestAnimationFrame(r));
    const el = document.elementFromPoint(b.x, b.y);
    const r = sb.getBoundingClientRect();
    rows.push({
      ms: Math.round(performance.now() - t0),
      підПальцем: el === ov ? 'ЗАТЕМНЕННЯ' : (el?.id || el?.className || el?.tagName || '—'),
      панельRight: Math.round(r.right),
      екран: innerWidth,
      доїхала: Math.abs(r.right - innerWidth) < 0.5,
      pe: getComputedStyle(ov).pointerEvents,
    });
  }
  return rows;
}, burger);
console.table(timeline);

// повернути в закритий стан
await page.evaluate(() => document.getElementById('sidebar-close')?.click());
await page.waitForTimeout(600);

// 2. САМА СЦЕНА: тап по бургеру + продубльований тап через N мс
for (const delay of [0, 30, 80, 150, 200, 250, 280, 330, 400, 700]) {
  await page.evaluate(() => { const o = document.getElementById('sidebar-overlay'); o.hidden = true; });
  await page.waitForTimeout(300);
  const res = await page.evaluate(async ([b, d]) => {
    const sb = document.getElementById('sidebar');
    document.getElementById('sidebar-toggle').click();          // справжній тап
    const t0 = performance.now();
    while (performance.now() - t0 < d) await new Promise(r => requestAnimationFrame(r));
    // ПРИВИД: система доганяє дотик у ту саму точку
    const ціль = document.elementFromPoint(b.x, b.y);
    ціль?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: b.x, clientY: b.y }));
    await new Promise(r => setTimeout(r, 700));
    const r = sb.getBoundingClientRect();
    return { влучив: (ціль?.id || ціль?.closest('[id]')?.id || ціль?.tagName), менюВідкрите: r.left < innerWidth - 20 };
  }, [burger, delay]);
  console.log(`привид через ${String(delay).padStart(3)}мс → влучив у ${res.влучив}\t меню відкрите: ${res.менюВідкрите ? '✅ так' : '❌ ЗАКРИЛОСЬ'}`);
  await page.evaluate(() => document.getElementById('sidebar-close')?.click());
  await page.waitForTimeout(500);
}

await browser.close();
await srv.stop();
