import { chromium } from 'playwright';
import { launch, serve, blockExternal } from '../_lib.mjs';
const srv = await serve();
const browser = await launch(chromium);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
await blockExternal(page);
await page.goto(srv.url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#sidebar-toggle');
await page.waitForTimeout(1200);
await page.evaluate(() => document.getElementById('sidebar-toggle').click());
await page.waitForTimeout(700);
console.log(await page.evaluate(() => {
  const b = document.getElementById('sidebar-toggle').getBoundingClientRect();
  const x = document.getElementById('sidebar-close').getBoundingClientRect();
  const пер = (a,c) => Math.max(0, Math.min(a.right,c.right)-Math.max(a.left,c.left)) * Math.max(0, Math.min(a.bottom,c.bottom)-Math.max(a.top,c.top));
  const s = пер(b,x);
  return { бургер:{l:Math.round(b.left),t:Math.round(b.top),w:Math.round(b.width),h:Math.round(b.height)},
           хрестик:{l:Math.round(x.left),t:Math.round(x.top),w:Math.round(x.width),h:Math.round(x.height)},
           перекриття_px2: Math.round(s), відсоток_бургера: Math.round(s/(b.width*b.height)*100)+'%' };
}));
await browser.close(); await srv.stop();
