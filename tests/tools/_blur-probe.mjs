import { chromium } from 'playwright';
import { launch, serve, blockExternal } from '../_lib.mjs';
const srv = await serve();
const browser = await launch(chromium);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
await blockExternal(page);
await page.goto(srv.url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#sidebar-toggle');
await page.waitForFunction(() => { const s=document.getElementById('splash'); return !s||s.hidden||getComputedStyle(s).display==='none'||getComputedStyle(s).opacity==='0'; },{timeout:15000}).catch(()=>{});
await page.waitForTimeout(400);
const blur = () => page.evaluate(() => {
  const el = document.getElementById('sidebar-overlay'); const cs = getComputedStyle(el);
  return { f: cs.backdropFilter || cs.webkitBackdropFilter || 'none', op: cs.opacity, vis: cs.visibility, disp: cs.display };
});
console.log('ЗАКРИТО (старт)   ', await blur());
await page.evaluate(() => document.getElementById('sidebar-toggle').click());
await page.waitForTimeout(60);
console.log('ВІДКРИТТЯ (60мс)  ', await blur());
await page.waitForTimeout(500);
console.log('ВІДКРИТО          ', await blur());
// хід закриття кадр за кадром
const хід = await page.evaluate(() => new Promise(res => {
  const el = document.getElementById('sidebar-overlay');
  el.classList.remove('sidebar-overlay--show');   // згасання БЕЗ syncOverlay (як у стенді №55)
  const t0 = performance.now(); const rows = [];
  const tick = () => { const cs = getComputedStyle(el);
    rows.push({ ms: Math.round(performance.now()-t0), op: +parseFloat(cs.opacity).toFixed(2), f: (cs.backdropFilter||cs.webkitBackdropFilter||'none') });
    if (performance.now()-t0 < 500) requestAnimationFrame(tick); else res(rows); };
  requestAnimationFrame(tick);
}));
const проміжні = хід.filter(r => r.op > 0.01 && r.op < 0.99).length;
console.log(`ЗГАСАННЯ: проміжних кадрів ${проміжні}/${хід.length}`);
const зБлюром = хід.filter(r => r.f !== 'none');
console.log(`  блюр тримався до ${зБлюром.length ? зБлюром[зБлюром.length-1].ms : 0}мс (останній кадр із blur), opacity там ${зБлюром.length ? зБлюром[зБлюром.length-1].op : '—'}`);
console.log('ЗАКРИТО (після)   ', await blur());
await browser.close(); await srv.stop();
