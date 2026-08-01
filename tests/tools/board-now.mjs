// tests/tools/board-now.mjs — знімок ПОТОЧНОЇ Дошки (для порівняння з концептом).
// ⚠️ Дані Дошки живуть у Supabase, до якого пісочниця не має доступу — тож на
// знімку буде СТРУКТУРА екрана (шапка, пошук, фільтри, FAB), а не живі картки.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { chromiumPath, serve } from '../_lib.mjs';
const OUT = 'shots/board-now'; mkdirSync(OUT, { recursive: true });
const { url, stop } = await serve();
const b = await chromium.launch({ executablePath: chromiumPath() });
const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, serviceWorkers:'block' });
const p = await ctx.newPage();
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url, { waitUntil:'domcontentloaded' });
await p.waitForTimeout(3500);
await p.evaluate(() => window.switchTab && window.switchTab('board'));
await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/дошка-зараз.png` });
console.log(JSON.stringify(await p.evaluate(() => {
  const q = s => document.querySelector(s);
  const vis = el => !!(el && el.offsetParent !== null);
  const h = el => el ? Math.round(el.getBoundingClientRect().height) : 0;
  return {
    шапка_екрана: h(q('#board-content .bd-controls')),
    є_пошук: vis(q('#board-content .bd-search, #board-content input[type=search]')),
    є_кнопка_фільтрів: vis(q('#board-content .bd-filter-btn, #board-content [class*=filter]')),
    чіпи_категорій: document.querySelectorAll('#board-content .bd-chip, #board-content [class*=chip]').length,
    сортування: document.querySelectorAll('#board-content [class*=sort]').length,
    карток: document.querySelectorAll('#board-content .cm-board-note').length,
    є_FAB: vis(q('.bd-fab, [class*=fab]')),
    текст_шапки: (q('#board-content .bd-controls')?.innerText || '').replace(/\n+/g,' | ').slice(0,200),
  };
}), null, 1));
await b.close(); await stop();
