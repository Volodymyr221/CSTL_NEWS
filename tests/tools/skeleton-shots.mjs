// 🔧 РАЗОВИЙ ІНСТРУМЕНТ: знімки кістяка завантаження кожної вкладки.
// Щоб Вова побачив форму ДО того, як вмикати прапорець на своєму телефоні.
// Запуск: node tests/tools/skeleton-shots.mjs

import { chromium } from 'playwright';
import { launch, serve, ROOT } from '../_lib.mjs';
import { mockSupabase } from '../_board-fixture.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(ROOT, 'tests/tools/_out');
mkdirSync(OUT, { recursive: true });

const Я = { id: 'uid-me', email: 'me@example.com', user_metadata: { full_name: 'Вова' } };
const ВКЛАДКИ = [['shotam', 'стрічка'], ['board', 'дошка'],
                 ['discussions', 'питання'], ['buses', 'автобуси']];

const { url, stop } = await serve();
const b = await launch(chromium);

for (const стан of ['off', 'circle']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                   hasTouch: true, serviceWorkers: 'block', deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await mockSupabase(p, {
    posts: [], announcements: [], profiles: [],
    app_features: [{ key: 'skeleton_shapes', label: 'Кістяки', stage: стан }],
    feature_testers: [{ uid: 'uid-me' }],
  }, { user: Я, slow: { posts: 60000, page_posts: 60000, pages: 60000 } });
  await p.route('**://api.open-meteo.com/**', r => r.abort());
  await p.route('**/data/schedule.json*', async (r) => {
    await new Promise(res => setTimeout(res, 60000)); r.abort();
  });
  // Гейт правил Дошки накриває екран при першому вході і ховає саме те, заради
  // чого знімок робиться. Ставимо згоду ДО старту — ключ із `board.js`.
  await p.addInitScript(() => {
    try { localStorage.setItem('cstl_board_rules_v1', JSON.stringify({ anon: true })); } catch (_) {}
  });
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  await p.evaluate(() => document.querySelector('.consent-accept')?.click());
  await p.waitForTimeout(600);


  for (const [tab, назва] of ВКЛАДКИ) {
    await p.evaluate(t => window.switchTab?.(t), tab);
    await p.waitForTimeout(900);
    const файл = join(OUT, `sk-${назва}-${стан}.png`);
    await p.screenshot({ path: файл });
    console.log(`✓ ${файл}`);
  }
  await ctx.close();
}

await stop();
await b.close();
