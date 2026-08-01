import { chromium } from 'playwright';
import { chromiumPath, serve } from '../_lib.mjs';
const { url, stop } = await serve();
const b = await chromium.launch({ executablePath: chromiumPath() });
const p = await (await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true })).newPage();
await p.route('**://*.supabase.co/**', r => r.abort());
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url, { waitUntil:'domcontentloaded' });
await p.waitForTimeout(3000);
await p.evaluate(() => window.switchTab && window.switchTab('community'));
await p.waitForTimeout(1500);
const out = await p.evaluate(() => {
  const cards = [...document.querySelectorAll('.cm-news-top3 .nc')];
  return cards.map(c => {
    const img = c.querySelector('.nc-img');
    return {
      картка: Math.round(c.getBoundingClientRect().height),
      межа: getComputedStyle(c).borderTopWidth,
      фото: img ? Math.round(img.getBoundingClientRect().height) : null,
      тег: img ? img.tagName : null,
      клас: img ? img.className : null,
    };
  });
});
console.log(JSON.stringify(out));
await b.close(); await stop();
