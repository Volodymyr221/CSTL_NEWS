// tests/tools/contacts-shot.mjs — знімок і виміри блока «Телефони громади».
// Запуск: node tests/tools/contacts-shot.mjs [ім'я]   (CSS_REV/BUNDLE_REV — для «до»)
import { chromium } from 'playwright';
import { readdirSync } from 'fs';
import { join } from 'path';
import { launch, serve, ROOT, projectFile } from '../_lib.mjs';
import { mockSupabase } from '../_board-fixture.mjs';

const NAME = process.argv[2] || 'after';
const CSS_REV = process.env.CSS_REV || '';
const B_REV = process.env.BUNDLE_REV || '';
const files = readdirSync(join(ROOT, 'style')).filter(f => f.endsWith('.css'));
const readAll = rev => files.map(f => { try { return projectFile('style/' + f, rev); } catch { return ''; } }).join('\n');

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'uk-UA', deviceScaleFactor: 2 });
const p = await ctx.newPage();
await mockSupabase(p, { posts: [], comments: [], announcements: [], pages: [], page_posts: [], threads: [], messages: [], thread_user_state: [] }, { user: { id: 'u-me', email: 'm@e.com', user_metadata: { name: 'Володимир' } }, profiles: [] });
await p.route(/^https?:\/\/(?!127\.0\.0\.1)[^/]+\//, r => r.abort());
if (B_REV) { const body = projectFile('bundle.js', B_REV); await p.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body })); }
await p.goto(url, { waitUntil: 'domcontentloaded' });
if (CSS_REV) {
  await p.evaluate(() => document.querySelectorAll('link[rel=stylesheet]').forEach(l => l.disabled = true));
  await p.addStyleTag({ content: readAll(CSS_REV) });
}
await p.waitForTimeout(2600);
await p.evaluate(() => { document.getElementById('splash')?.remove(); document.querySelector('.consent-accept')?.click(); });
await p.waitForTimeout(600);

const блок = await p.$('#cm-contacts-content');
if (блок) {
  await блок.scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
  await блок.screenshot({ path: `tests/tools/_out/contacts-${NAME}.png` });
}
console.log(JSON.stringify(await p.evaluate(() => {
  const h = s => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().height) : null; };
  const картки = [...document.querySelectorAll('.hm-ct')].map(e => ({
    назва: e.querySelector('.hm-ct-name')?.textContent.trim().slice(0, 22),
    висота: Math.round(e.getBoundingClientRect().height),
    рядків_мети: e.querySelectorAll('.hm-ct-meta').length,
  }));
  const плитки = [...document.querySelectorAll('.hm-sos-b')].map(e => {
    const t = e.querySelector('.hm-sos-t');
    return { назва: t?.textContent.trim(), обрізано: t ? t.scrollWidth > t.clientWidth + 1 : null,
             top: Math.round(e.getBoundingClientRect().top) };
  });
  const пін = document.querySelector('.hm-ct-act[href]');
  return { картки, блок: h('#cm-contacts-content'), плитки,
           карта: пін ? decodeURIComponent(пін.getAttribute("href")) : null };
})));
await stop(); await b.close();
