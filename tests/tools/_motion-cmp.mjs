// Порівняння «відбитка плавності» до/після. Запуск:
//   node tests/tools/_motion-cmp.mjs            (поточний код)
//   REV=origin/main node tests/tools/_motion-cmp.mjs
import { chromium } from 'playwright';
import { launch, serve, blockExternal, projectFile } from '../_lib.mjs';
const REV = process.env.REV || '';
const srv = await serve();
const browser = await launch(chromium);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
await blockExternal(page);
if (REV) {
  for (const [f, t] of [['bundle.js','text/javascript'], ['style/sidebar.css','text/css'], ['index.html','text/html']]) {
    const body = projectFile(f, REV);
    await page.route('**/' + f, r => r.fulfill({ contentType: t + '; charset=utf-8', body }));
  }
}
await page.goto(srv.url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#sidebar-toggle');
await page.waitForFunction(() => { const s=document.getElementById('splash'); return !s||s.hidden||getComputedStyle(s).display==='none'||getComputedStyle(s).opacity==='0'; },{timeout:15000}).catch(()=>{});
await page.waitForTimeout(400);

const відбиток = await page.evaluate(() => new Promise(res => {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  const проба = el => { const c = getComputedStyle(el);
    return `${c.transitionProperty} | ${c.transitionDuration} | ${c.transitionTimingFunction} | ${c.transitionDelay}`; };
  const закритий = { панель: проба(sb), затемнення: проба(ov) };
  document.getElementById('sidebar-toggle').click();
  const t0 = performance.now(); const кадри = [];
  const тік = () => {
    const r = sb.getBoundingClientRect();
    кадри.push({ мс: performance.now() - t0, x: r.right - innerWidth, op: parseFloat(getComputedStyle(ov).opacity) });
    if (performance.now() - t0 < 600) requestAnimationFrame(тік);
    else {
      const доїзд = кадри.find(k => Math.abs(k.x) < 0.5);
      res({ закритий, відкритийПанель: проба(sb), відкритеЗатемнення: проба(ov),
            доїздМс: доїзд ? Math.round(доїзд.мс) : null,
            рухомихКадрів: кадри.filter(k => Math.abs(k.x) > 0.5).length,
            згасанняКадрів: кадри.filter(k => k.op > 0.01 && k.op < 0.99).length });
    }
  };
  requestAnimationFrame(тік);
}));
console.log(JSON.stringify({ rev: REV || 'ПОТОЧНИЙ', ...відбиток }, null, 1));
await browser.close(); await srv.stop();
