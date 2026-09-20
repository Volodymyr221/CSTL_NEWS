// 🔧 РАЗОВИЙ ПРИЛАД: чи гортається екран ОЧІКУВАННЯ і наскільки він довший за вікно.
// 🗣️ Питання Вови 20.09: «в момент завантаження новий фон завантаження скролиться,
// він має бути може статичним?»
// Запуск: node tests/tools/skeleton-scroll-probe.mjs

import { chromium } from 'playwright';
import { launch, serve } from '../_lib.mjs';
import { mockSupabase } from '../_board-fixture.mjs';

const Я = { id: 'uid-me', email: 'me@example.com', user_metadata: { full_name: 'Вова' } };
const ВКЛАДКИ = [['shotam', 'стрічка'], ['board', 'дошка'],
                 ['discussions', 'питання'], ['buses', 'автобуси']];

const { url, stop } = await serve();
const b = await launch(chromium);

for (const стан of ['off', 'circle']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                   hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await mockSupabase(p, {
    posts: [], announcements: [], profiles: [],
    app_features: [{ key: 'skeleton_shapes', label: 'Кістяки', stage: стан }],
    feature_testers: [{ uid: 'uid-me' }],
  }, { user: Я, slow: { posts: 60000, page_posts: 60000, pages: 60000 } });
  await p.route('**://api.open-meteo.com/**', r => r.abort());
  await p.route('**/data/schedule.json*', async (r) => { await new Promise(res => setTimeout(res, 60000)); r.abort(); });
  await p.addInitScript(() => {
    try { localStorage.setItem('cstl_board_rules_v1', JSON.stringify({ anon: true })); } catch (_) {}
  });
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  await p.evaluate(() => document.querySelector('.consent-accept')?.click());
  await p.waitForTimeout(600);

  console.log(`\n──── прапорець ${стан} ────`);
  for (const [tab, назва] of ВКЛАДКИ) {
    await p.evaluate(t => window.switchTab?.(t), tab);
    await p.waitForTimeout(900);
    const м = await p.evaluate(() => {
      const m = document.querySelector('.app-main');
      // ⚠️ `.scr-loading` є у КІЛЬКОХ вкладок одразу (контейнери живуть поруч,
      // приховані). Перша редакція брала `querySelector` і друкувала висоту 0 —
      // тобто міряла чужий сплячий контейнер, а не той, що на екрані.
      const sk = [...document.querySelectorAll('.scr-loading')].find(e => e.offsetParent !== null)
              || document.querySelector('.scr-loading');
      const r = sk ? sk.getBoundingClientRect() : null;
      return {
        кістяк: !!sk,
        висотаКістяка: r ? Math.round(r.height) : 0,
        вікно: m ? m.clientHeight : 0,
        вміст: m ? m.scrollHeight : 0,
        гортається: m ? m.scrollHeight - m.clientHeight : 0,
      };
    });
    // Чи справді доїжджає — не «чи теоретично більше», а чи зрушить `scrollTop`.
    await p.evaluate(() => { const m = document.querySelector('.app-main'); if (m) m.scrollTop = 9999; });
    await p.waitForTimeout(250);
    const зрушив = await p.evaluate(() => Math.round(document.querySelector('.app-main')?.scrollTop || 0));
    await p.evaluate(() => { const m = document.querySelector('.app-main'); if (m) m.scrollTop = 0; });
    console.log(`${назва.padEnd(10)} кістяк=${м.кістяк ? 'є' : '—'} висота=${м.висотаКістяка} вікно=${м.вікно} вміст=${м.вміст} запас=${м.гортається} реально_прокрутилось=${зрушив}`);
  }
  await ctx.close();
}
await stop();
await b.close();
