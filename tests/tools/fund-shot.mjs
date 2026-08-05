// tests/tools/fund-shot.mjs — знімок віджета зборів на ТЕСТОВИХ даних.
// ⚠️ Дані підміняються `page.route` і в репозиторій не потрапляють: вигадані
// збори не мають шансу опинитись у застосунку (чужі гроші, чужі назви).
import { chromium } from 'playwright';
import { chromiumPath, serve, ROOT } from '../_lib.mjs';
import { join } from 'path';
const { url, stop } = await serve();
const ep = chromiumPath();
const b = await chromium.launch({ ...(ep ? { executablePath: ep } : {}) });
const p = await (await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true, serviceWorkers:'block' })).newPage();
await p.route('**://*.supabase.co/**', r => r.abort());
const N = +(process.argv[2] || 1);
const ITEMS = [
  { id:'t1', title:'Тестовий збір — не для прода', org:'ТЕСТ (перевірка вигляду)',
    url:'https://send.monobank.ua/jar/EXAMPLE', goal:500000, kind:'military',
    note:'Це тестові дані для перевірки вигляду картки. У застосунок не потрапляють.', active:true },
  { id:'t2', title:'Другий тестовий збір', org:'ТЕСТ', url:'https://send.monobank.ua/jar/EXAMPLE2',
    goal:120000, kind:'humanitarian', active:true },
  { id:'t3', title:'Третій тестовий збір', org:'ТЕСТ', url:'https://send.monobank.ua/jar/EXAMPLE3',
    goal:80000, kind:'community', active:true },
];
await p.route('**/data/fundraisers.json', r => r.fulfill({ contentType:'application/json',
  body: JSON.stringify({ updated:'2026-08-05', items: ITEMS.slice(0, N) }) }));
await p.goto(url, { waitUntil:'domcontentloaded' });
await p.waitForTimeout(2500);
await p.evaluate(() => window.switchTab && window.switchTab('community'));
await p.waitForTimeout(7000);
console.log(JSON.stringify(await p.evaluate(() => {
  const sec = document.getElementById('hm-fund');
  if (!sec || sec.hidden) return { видно:false };
  const go = sec.querySelector('.hm-fund-go');
  const r = go && go.getBoundingClientRect();
  return {
    видно: true,
    кікер: sec.querySelector('.hm-kicker')?.textContent,
    карток: sec.querySelectorAll('.hm-fund').length,
    заголовок: sec.querySelector('.hm-fund-ttl')?.textContent.trim().slice(0,30),
    хтоЗбирає: !!sec.querySelector('.hm-fund-org-v'),
    ціль: sec.querySelector('.hm-fund-goal-v')?.textContent,
    кнопка: go?.textContent.trim(),
    дотик: r ? `${Math.round(r.width)}×${Math.round(r.height)}` : '—',
    підказка: sec.querySelector('.hm-fund-hint')?.textContent.trim(),
    сумаНаКартці: /зібрано|%/.test(sec.textContent),
    векторІконка: !!sec.querySelector('.hm-fund-ic svg'),
  };
})));
const el = await p.$('#hm-fund');
if (el) { await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
  await el.screenshot({ path: join(ROOT,'tests/tools/_shots',`fund-${N}.png`) }); }
console.log('📸 tests/tools/_shots/fund-' + N + '.png');
await b.close(); await stop();
