// РАЗОВИЙ АУДИТ вкладки «Громада»: скільки місця займає кожен блок,
// скільки треба гортати, де порожньо. Числа, не око.
import { chromium } from 'playwright';
import { chromiumPath, serve } from '../_lib.mjs';

const { url, stop } = await serve();
const executablePath = chromiumPath();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.route('**://api.open-meteo.com/**', r => r.abort());
page.on('pageerror', e => console.log('‼️ JS-помилка:', e.message));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
await page.evaluate(() => window.switchTab && window.switchTab('community'));
await page.waitForTimeout(3000);

const VIEW = 844 - 56 - 57;   // видима зона = екран − шапка − таб-бар

const out = await page.evaluate(v => {
  const main = document.querySelector('.app-main');
  const root = document.getElementById('cm-content');
  const rows = [];
  const push = (name, el) => {
    if (!el) { rows.push({ name, h: null }); return; }
    const r = el.getBoundingClientRect();
    rows.push({ name, h: Math.round(r.height), top: Math.round(r.top + main.scrollTop) });
  };
  // Старий екран і новий міряються ОДНИМ інструментом: `pick` бере ПЕРШИЙ селектор,
  // що знайшовся. Інакше порівняння «було/стало» йшло б двома різними мірками —
  // а це рівно та помилка, через яку перевірка вже брехала сім разів.
  const pick = (...sels) => sels.reduce((found, s) => found || root.querySelector(s), null);
  push('рядок стану',     pick('.hm-status', '.hm-top', '.cm-hero'));
  push('ГОЛОВНА ПЛИТКА',  pick('#hm-hero'));
  push('ШО В СЕЛІ?',      pick('.hm-kicker', '.hm-hello', '.cm-sec-head'));
  push('БЕНТО',           pick('#hm-bento:not([hidden])'));
  push('НОВИНИ',          pick('#hm-news', '#cm-news-board'));
  push('ПОДІЇ',           pick('#hm-events', '.cm-block--event'));
  push('ДОШКА (плитка)',  pick('#hm-t-board:not([hidden])'));
  push('АВТОБУС (плитка)',pick('#hm-t-bus:not([hidden])'));
  push('КОНТАКТИ',        pick('#hm-contacts', '#cm-contacts'));

  // вкладені скролери
  const nested = [...root.querySelectorAll('*')].filter(e => {
    const o = getComputedStyle(e).overflowY, ox = getComputedStyle(e).overflowX;
    return ((o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight + 1)
        || ((ox === 'auto' || ox === 'scroll') && e.scrollWidth > e.clientWidth + 1);
  }).map(e => e.className.toString().slice(0, 40));

  // автоматичні рухи (таймери) — рахуємо каруселі
  const carousels = {
    heroФото: root.querySelectorAll('.hm-top-img, .cm-hero-img').length,
    дошкаКартки: root.querySelectorAll('.cmbw-card').length,
    подіїСлайди: root.querySelectorAll('.cm-ev-slide').length,
    автобусКрапки: root.querySelectorAll('.bhv4-dot-nav').length,
  };

  return {
    всьогоСкрол: Math.round(main.scrollHeight),
    видима: main.clientHeight,
    rows, nested, carousels,
    порожні: [...root.querySelectorAll('.cm-block-empty,.cmbw-empty')].map(e => e.textContent.trim()),
  };
}, VIEW);

console.log('=== ГРОМАДА: ВИМІР (390×844) ===');
console.log('вся сторінка (scrollHeight):', out.всьогоСкрол + 'px  =', (out.всьогоСкрол / VIEW).toFixed(1) + ' екранів видимої зони (' + VIEW + 'px)');
console.log('');
console.log('блок'.padEnd(20), 'висота'.padStart(8), 'частка екрана'.padStart(15), 'починається на'.padStart(16));
for (const r of out.rows) {
  if (r.h === null) { console.log(r.name.padEnd(20), '   НЕМА'); continue; }
  console.log(r.name.padEnd(20), (r.h + 'px').padStart(8), ((r.h / VIEW * 100).toFixed(1) + '%').padStart(15), (r.top + 'px').padStart(16));
}
console.log('');
console.log('вкладені скролери:', out.nested.length, out.nested);
console.log('каруселі/автоміни:', JSON.stringify(out.carousels));
console.log('порожні стани:', out.порожні);

await page.screenshot({ path: '/tmp/claude-0/-home-user-CSTL-NEWS/673266f5-6864-5834-a4cc-e8e6e4f2aacc/scratchpad/cm-1-top.png' });
await page.evaluate(() => { document.querySelector('.app-main').scrollTop = 700; });
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/claude-0/-home-user-CSTL-NEWS/673266f5-6864-5834-a4cc-e8e6e4f2aacc/scratchpad/cm-2.png' });
await page.evaluate(() => { document.querySelector('.app-main').scrollTop = 1500; });
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/claude-0/-home-user-CSTL-NEWS/673266f5-6864-5834-a4cc-e8e6e4f2aacc/scratchpad/cm-3.png' });
await page.evaluate(() => { document.querySelector('.app-main').scrollTop = 2400; });
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/claude-0/-home-user-CSTL-NEWS/673266f5-6864-5834-a4cc-e8e6e4f2aacc/scratchpad/cm-4.png' });

await browser.close();
await stop();
