// ІНСТРУМЕНТ (не сторож): ЧОМУ БЕЙДЖ «N НОВИХ» НЕ РУХАЄТЬСЯ ПІСЛЯ ЧИТАННЯ.
//
// 🗣️ Скарга Вови (01.09): «вчора прочитав 8 нових статей, сьогодні зранку
// заходжу, нові не зʼявились, а пише так само 8 нових».
//
// 🔬 ГІПОТЕЗА, ЯКУ ЦЕЙ ПРИЛАД ПЕРЕВІРЯЄ. Бейдж рахує ЛИШЕ «Громаду»
// (`countNewCommunity` → `NEWS_GEO_GROUPS[0]`), а `markArticleSeen()` має
// ранній вихід `if (!matchGeoGroup(art, NEWS_GEO_GROUPS[0])) return;`.
// На знімку Вови віджет стояв на сторінці **ВОЛИНЬ**. Тобто він читав те, що
// бачив перед собою — статті Волині, — а число рахує зовсім інший розділ.
//
// 🛑 НІЧОГО НЕ СТВЕРДЖУЄ, ЛИШЕ МІРЯЄ. Прилад 31.08 у цьому ж місці збрехав
// чотири рази, тож тут кожен крок друкує і бейдж, і ключі сховища.
//
// Запуск: node tests/tools/news-badge-geo-probe.mjs
import { chromium } from 'playwright';
import { chromiumPath, serve } from '../_lib.mjs';
import { mockSupabase } from '../_board-fixture.mjs';

const UID = '11111111-2222-3333-4444-555555555555';
const { url, stop } = await serve();
const ep = chromiumPath();
const b = await chromium.launch({ ...(ep ? { executablePath: ep } : {}) });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
await mockSupabase(p, {}, { user: { id: UID, email: 'vova@example.com' } });
await p.route('**://api.open-meteo.com/**', r => r.abort());

// Мітка «бачив» місячної давнини — інакше «нових» не буває за побудовою.
// Сієм РІВНО ОДИН РАЗ (на цьому прилад 31.08 і спіймався).
const СТАРА = Date.now() - 30 * 24 * 3600e3;
await p.addInitScript(([uid, ts]) => {
  try {
    if (localStorage.getItem('__probe_seeded')) return;
    localStorage.setItem('__probe_seeded', '1');
    localStorage.setItem('cstl_news_seen_ts:' + uid, String(ts));
  } catch (_) {}
}, [UID, СТАРА]);

const бейдж = () => p.evaluate(() =>
  document.querySelector('.cm-news-new')?.textContent.trim() || '—');
const розділ = () => p.evaluate(() =>
  document.getElementById('hm-ncat')?.textContent.trim() || '—');
const ids = () => p.evaluate(() => {
  const k = Object.keys(localStorage).find(x => x.startsWith('cstl_news_seen_ids'));
  return k ? `${k} = ${localStorage.getItem(k)}` : 'ключа ids ще немає';
});

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.evaluate(() => window.switchTab && window.switchTab('community'));
await p.waitForSelector('#cm-news-content .hm-npage', { timeout: 15000 });
await p.waitForTimeout(1200);

console.log('\n══ КРОК 1: як застосунок відкрився ══');
console.log('  розділ у вікні :', await розділ());
console.log('  бейдж          :', await бейдж());
console.log('  ' + await ids());

// Скільки статей у кожному розділі бачить сам застосунок.
console.log('\n══ КРОК 2: що лежить у каруселі ══');
console.log(await p.evaluate(() => {
  const pages = [...document.querySelectorAll('#cm-news-content .hm-npage')];
  return pages.map((pg, i) => `  сторінка ${i}: карток ${pg.querySelectorAll('[data-article-id]').length}`).join('\n');
}));

// ── ЧИТАЄМО СТАТТІ НА ТІЙ СТОРІНЦІ, ЯКА ЗАРАЗ ПЕРЕД ОЧИМА ──────────────────
async function читати(скільки, підпис) {
  console.log(`\n══ ${підпис} ══`);
  console.log('  розділ у вікні :', await розділ());
  const було = await бейдж();
  for (let i = 0; i < скільки; i++) {
    const відкрив = await p.evaluate(() => {
      const track = document.querySelector('#cm-news-content .hm-ntrack') || document;
      const pages = [...track.querySelectorAll('.hm-npage')];
      // сторінка, що зараз найближча до центру екрана
      let best = pages[0], bd = Infinity;
      for (const pg of pages) {
        const d = Math.abs(pg.getBoundingClientRect().left);
        if (d < bd) { bd = d; best = pg; }
      }
      const cards = [...best.querySelectorAll('[data-article-id]')]
        .filter(c => !c.dataset.probeRead);
      if (!cards.length) return null;
      cards[0].dataset.probeRead = '1';
      cards[0].click();
      return Number(cards[0].dataset.articleId);
    });
    if (відкрив == null) { console.log('  картки скінчились на', i); break; }
    await p.waitForTimeout(350);
    await p.keyboard.press('Escape').catch(() => {});
    await p.evaluate(() => document.querySelector('#article-modal .nh-back, [data-ad-close]')?.click());
    await p.waitForTimeout(250);
  }
  const стало = await бейдж();
  console.log(`  бейдж було → стало: ${було} → ${стало}`);
  console.log('  ' + await ids());
  return { було, стало };
}

await читати(3, 'КРОК 3: читаю 3 статті на СТОРІНЦІ, ЯКА ВІДКРИЛАСЬ (Громада)');

// ── Тепер гортаємо на ВОЛИНЬ і читаємо ТАМ ────────────────────────────────
await p.evaluate(() => {
  const track = document.querySelector('#cm-news-content .hm-ntrack');
  const pages = [...(track?.querySelectorAll('.hm-npage') || [])];
  if (track && pages[1]) track.scrollTo({ left: pages[1].offsetLeft, behavior: 'instant' });
});
await p.waitForTimeout(900);
await читати(3, 'КРОК 4: гортаю на ВОЛИНЬ і читаю 3 статті ТАМ');

console.log('\n══ КРОК 5: відкриваю хаб «Усі новини» ══');
await p.evaluate(() => document.querySelector('#cm-news-board [data-cm-news-all]')?.click());
await p.waitForTimeout(1000);
await p.evaluate(() => document.querySelector('.nh-back')?.click());
await p.waitForTimeout(800);
console.log('  бейдж після хаба:', await бейдж());

console.log('\n══ КРОК 6: ПЕРЕЗАХІД (це і є «сьогодні зранку») ══');
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.evaluate(() => window.switchTab && window.switchTab('community'));
await p.waitForSelector('#cm-news-content .hm-npage', { timeout: 15000 });
await p.waitForTimeout(1200);
console.log('  розділ у вікні :', await розділ());
console.log('  бейдж          :', await бейдж());
console.log('  ' + await ids());
console.log('  мітка часу     :', await p.evaluate(() => {
  const k = Object.keys(localStorage).find(x => x.startsWith('cstl_news_seen_ts'));
  const v = k && Number(localStorage.getItem(k));
  return v ? `${k} = ${new Date(v).toISOString()}` : 'немає';
}));

await b.close();
await stop();
