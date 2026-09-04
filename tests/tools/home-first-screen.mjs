// tests/tools/home-first-screen.mjs — ПРИЛАД: що встигає на перший екран Громади.
// Міряє, на якій висоті починається ПЕРША ДІЯ, і скільки її видно у вікні 844px.
// Запуск: node tests/tools/home-first-screen.mjs   (CSS_REV=... для порівняння)
import { chromium } from 'playwright';
import { readdirSync } from 'fs';
import { join } from 'path';
import { launch, serve, ROOT, projectFile } from '../_lib.mjs';
import { mockSupabase } from '../_board-fixture.mjs';

const REV = process.env.CSS_REV || '';
const files = readdirSync(join(ROOT, 'style')).filter(f => f.endsWith('.css'));
const readAll = rev => files.map(f => { try { return projectFile('style/' + f, rev); } catch (_) { return ''; } }).join('\n');

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'uk-UA' });
const p = await ctx.newPage();
await mockSupabase(p, { posts: [], comments: [], announcements: [], pages: [], page_posts: [], threads: [], messages: [], thread_user_state: [] }, { user: { id: 'u-me', email: 'm@e.com', user_metadata: { name: 'Володимир' } }, profiles: [] });
await p.route(/^https?:\/\/(?!127\.0\.0\.1)[^/]+\//, r => r.abort());
await p.goto(url, { waitUntil: 'domcontentloaded' });
if (REV) {
  await p.evaluate(() => document.querySelectorAll('link[rel=stylesheet]').forEach(l => l.disabled = true));
  await p.addStyleTag({ content: readAll(REV) });
}
await p.waitForTimeout(2400);
await p.evaluate(() => { document.getElementById('splash')?.remove(); document.querySelector('.consent-accept')?.click(); });
await p.waitForTimeout(600);
console.log(await p.evaluate(() => {
  const r = s => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top) : null; };
  const box = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect();
    return `${Math.round(b.width)}×${Math.round(b.height)} @${Math.round(b.top)}`; };
  const hi = document.querySelector('.hm-hi');
  const cs = hi && getComputedStyle(hi);
  // Перший блок ПІСЛЯ бордової шапки — це і є «перша дія».
  const root = document.querySelector('#cm-content');
  const блоки = [...(root ? root.children : [])].map(e => {
    const b = e.getBoundingClientRect();
    const назва = (e.querySelector('.hm-kicker, h2, h3') || {}).textContent || '';
    return `${String(e.className).split(' ')[0] || e.tagName.toLowerCase()} «${назва.trim().slice(0, 24)}» @${Math.round(b.top)}..${Math.round(b.bottom)}`;
  });
  return {
    привітання: box('.hm-hi'),
    текст: hi && hi.textContent.trim(),
    коробка_px: hi && Math.round(hi.clientWidth),
    // 🔴 `scrollWidth` тут БРЕШЕ: у `-webkit-box` із `line-clamp` він дорівнює
    // ширині коробки завжди. Природну ширину рядка дає лише КЛОН без обрізки.
    природна: hi && (() => {
      const прим = txt => {
        const c = document.createElement('span');
        const cs = getComputedStyle(hi);
        c.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${cs.font};letter-spacing:${cs.letterSpacing}`;
        c.textContent = txt; document.body.appendChild(c);
        const w = Math.round(c.getBoundingClientRect().width); c.remove(); return w;
      };
      return { зараз: прим(hi.textContent.trim()),
               ранок_Володимир: прим('Добрий ранок, Володимир'),
               ніч_Володимире: прим('Доброї ночі, Володимире'),
               довге_імʼя: прим('Добрий ранок, Костянтин') };
    })(),
    кегль: cs && cs.fontSize, вага: cs && cs.fontWeight,
    рядків: hi ? Math.round(hi.getBoundingClientRect().height / parseFloat(cs.lineHeight)) : null,
    капсули: box('.hm-caps'), погода: box('.hm-wx'),
    блоки, висота_сторінки: root ? Math.round(root.getBoundingClientRect().height) : null,
  };
}));
await stop(); await b.close();
