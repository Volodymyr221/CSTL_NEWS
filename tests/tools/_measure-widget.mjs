// Разовий ВИМІР: скільки місця віджет новин займає на головному екрані.
// Те саме число, яким цей потік міряв «77.6%» до переробки — інакше порівняння
// «було / стало» було б нечесним: видима зона = екран мінус шапка (56) і таб-бар (57).
import { chromium } from 'playwright';
import { chromiumPath, serve } from '../_lib.mjs';

const { url, stop } = await serve();
const executablePath = chromiumPath();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.route('**://*.supabase.co/**', r => r.abort());
await page.route('**://api.open-meteo.com/**', r => r.abort());
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.evaluate(() => window.switchTab && window.switchTab('community'));
await page.waitForTimeout(1500);

const VIEW = 844 - 56 - 57;
const out = await page.evaluate(v => {
  const n = document.querySelector('#cm-news-board');
  const h = Math.round(n.getBoundingClientRect().height);
  const cards = [...n.querySelectorAll('.nc')].map(c => ({
    варіант: c.className.match(/nc--\w+/)[0],
    висота: Math.round(c.getBoundingClientRect().height),
    розділ: (c.querySelector('.nc-badge--geo') || {}).textContent || '—',
  }));
  const scrollers = [...n.querySelectorAll('*')].filter(e => {
    const o = getComputedStyle(e).overflowY;
    return (o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight + 1;
  }).length;
  return { висотаВіджета: h, часткаВидимоїЗони: Math.round(h / v * 1000) / 10, вкладенихСкролерів: scrollers, cards };
}, VIEW);

console.log('висота віджета:', out.висотаВіджета + 'px',
            '· частка видимої зони:', out.часткаВидимоїЗони + '%',
            '· вкладених скролерів:', out.вкладенихСкролерів);
console.log('було 31.07: 567px / 77.6% (до потоку) → 431 → 407 (три однакові рядки Громади)');
for (const c of out.cards) console.log('  ', c.варіант.padEnd(10), String(c.висота).padStart(4) + 'px', c.розділ);

// ── ВАРІАНТ B для порівняння: три ОДНАКОВІ компактні картки ─────────────────
// Той самий CSS і ті самі дані — міняємо лише варіант першої картки, щоб число
// «скільки коштує велика перша» було чесним, а не з іншої збірки.
const b = await page.evaluate(v => {
  const lead = document.querySelector('#cm-news-board .nc--lead');
  if (lead) lead.classList.replace('nc--lead', 'nc--mini');
  const n = document.querySelector('#cm-news-board');
  const h = Math.round(n.getBoundingClientRect().height);
  return { висота: h, частка: Math.round(h / v * 1000) / 10 };
}, VIEW);
console.log('\nваріант B (три однакові рядки):', b.висота + 'px ·', b.частка + '%',
            '→ велика перша коштує', (out.висотаВіджета - b.висота) + 'px');

await browser.close();
await stop();
