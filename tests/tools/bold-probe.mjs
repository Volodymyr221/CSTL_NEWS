// Зонд: ЩО САМЕ жирне на живих вкладках. Не стенд — інструмент для рішення.
import { chromium } from 'playwright';
import { launch, serve } from '../_lib.mjs';
import { mockSupabase } from '../_board-fixture.mjs';

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
await mockSupabase(p, { posts: [], announcements: [], profiles: [] }, {});
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());

const збір = `(() => {
  const vis = el => { const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) > 0.02; };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    let own = ''; for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
    if (!own.trim()) continue;
    const s = getComputedStyle(el);
    if (+s.fontWeight < 700) continue;
    out.push({ cls: el.tagName.toLowerCase() + '.' + String(el.className).split(' ').slice(0,2).join('.'),
               w: s.fontWeight, fs: Math.round(parseFloat(s.fontSize)), t: own.trim().slice(0, 28) });
  }
  return out; })()`;

const разом = {};
for (const t of ['community', 'shotam', 'discussions', 'board', 'buses']) {
  await p.evaluate(x => window.switchTab && window.switchTab(x), t);
  await p.waitForTimeout(1200);
  for (const r of await p.evaluate(збір)) {
    const k = `${r.cls} · ${r.w}/${r.fs}px`;
    (разом[k] = разом[k] || { n: 0, приклад: r.t }).n++;
  }
}
console.log('── ЖИРНІ ЕЛЕМЕНТИ (спадання) ──');
Object.entries(разом).sort((a, b) => b[1].n - a[1].n).slice(0, 28)
  .forEach(([k, v]) => console.log(String(v.n).padStart(4), k, '—', v.приклад));
await ctx.close(); await stop(); await b.close();
