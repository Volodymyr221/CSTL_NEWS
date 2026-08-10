import { chromium } from 'playwright';
import { launch, serve, blockExternal, projectFile } from '../_lib.mjs';
const REV = process.env.REV || '';
const srv = await serve();
const browser = await launch(chromium);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
await blockExternal(page);
if (REV) { const b = projectFile('bundle.js', REV);
  await page.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body: b })); }
await page.goto(srv.url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#sidebar-toggle');
await page.waitForFunction(() => { const s=document.getElementById('splash'); return !s||s.hidden||getComputedStyle(s).display==='none'||getComputedStyle(s).opacity==='0'; },{timeout:15000}).catch(()=>{});
await page.waitForTimeout(400);
await page.evaluate(() => document.getElementById('sidebar-toggle').click());
await page.waitForTimeout(700);
// ЗАКРИВАЄМО ТИМ САМИМ ШЛЯХОМ, ЩО ЛЮДИНА — через ✕, тобто через paintState
const хід = await page.evaluate(() => new Promise(res => {
  const ov = document.getElementById('sidebar-overlay'), sb = document.getElementById('sidebar');
  document.getElementById('sidebar-close').click();
  const t0 = performance.now(); const к = [];
  const тік = () => { const cs = getComputedStyle(ov);
    к.push({ мс: Math.round(performance.now()-t0), op: +parseFloat(cs.opacity).toFixed(2), disp: cs.display,
             панель: Math.round(sb.getBoundingClientRect().left) });
    if (performance.now()-t0 < 500) requestAnimationFrame(тік); else res(к); };
  requestAnimationFrame(тік);
}));
const проміжні = хід.filter(k => k.op > 0.01 && k.op < 0.99).length;
const першийNone = хід.find(k => k.disp === 'none');
console.log(`rev=${REV || 'ПОТОЧНИЙ'}  проміжних кадрів згасання: ${проміжні}/${хід.length}`);
console.log(`  display:none настав на ${першийNone ? першийNone.мс + 'мс' : '—'}; панель доїхала за екран на ${(хід.find(k=>k.панель>=389)||{}).мс ?? '—'}мс`);
console.log('  перші кадри:', хід.slice(0,6).map(k=>`${k.мс}:${k.op}/${k.disp}`).join(' '));
await browser.close(); await srv.stop();
