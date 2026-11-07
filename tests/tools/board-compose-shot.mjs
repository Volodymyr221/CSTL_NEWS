// Інструмент: знімок модалки «Нове оголошення» у справжньому застосунку (390×844).
// Запуск: node tests/tools/board-compose-shot.mjs <тека> [мітка]
// Робить два кадри: верх (порожня форма) і низ (прокручено до кнопки), плюс
// стан із обраною категорією й набраним заголовком. Для порівняння «до/після».
import { chromium } from 'playwright';
import { launch, serve } from '../_lib.mjs';
import { mockSupabase } from '../_board-fixture.mjs';

const out = process.argv[2] || '.';
const tag = process.argv[3] || 'shot';
const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, serviceWorkers: 'block' });
await ctx.addInitScript(() => {
  try { localStorage.setItem('cstl-legal-consent-v1', '05.10.2026'); localStorage.setItem('cstl_board_rules_ok', '1'); } catch (_) {}
});
const p = await ctx.newPage();
await mockSupabase(p, { posts: [], announcements: [], profiles: [] },
  { user: { id: 'uid-me', email: 'me@example.com', user_metadata: { full_name: 'Володимир Шевчук' } } });
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url + '/index.html');
await p.waitForTimeout(3000);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.evaluate(() => window.switchTab('board'));
await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('.brules-ok')?.click());
await p.waitForTimeout(300);
const opened = await p.evaluate(() => {
  const b = document.querySelector('[data-bd-post]') || document.querySelector('[data-act="post"]');
  if (b) { b.click(); return b.outerHTML.slice(0, 60); } return null;
});
await p.waitForTimeout(900);
if (!(await p.$('.app-modal--board-compose'))) { console.log('модалка не відкрилась', opened); process.exit(1); }
await p.screenshot({ path: `${out}/${tag}-1-top.png` });
await p.evaluate(() => { document.querySelector('.bm-chip[data-cat]')?.click(); });
await p.waitForTimeout(200);
await p.fill('#bm-title', 'Продам дитячий велосипед');
await p.evaluate(() => document.activeElement?.blur());
await p.waitForTimeout(200);
await p.screenshot({ path: `${out}/${tag}-2-filled.png` });
await p.evaluate(() => { const s = document.querySelector('.app-modal--board-compose .app-modal-sheet'); s.scrollTop = s.scrollHeight; });
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/${tag}-3-bottom.png` });
await b.close(); await stop();
console.log('ok', opened);
