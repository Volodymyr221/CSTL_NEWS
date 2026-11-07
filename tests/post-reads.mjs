// Стенд: «👁 N» (СКІЛЬКИ ЛЮДЕЙ БАЧИЛИ ДОПИС) — ПРИБРАНО З КАРТКИ (31.10.2026).
//
// 🗣️ Вова 31.10: «Треба забрати лічильник переглядів з постів. Взагалі його
// прибрати». І окремо: «запис лишаємо».
//
// Історія: 01.10 рядок «Прочитали N» заведено для автора (щоб адмін спільноти
// бачив, що його читають), 08.10 — око й число. 31.10 показ знято.
//
// 🔑 ЩО ТУТ СТЕРЕЖЕМО — дві речі, і обидві з найвигіднішої для лічильника сцени:
// я в команді сторінки, мій допис має 12 читачів, тобто ДО 31.10 число тут
// було б на екрані напевно.
//   1. на картці немає `.fd-reads` — ні на своєму, ні деінде;
//   2. застосунок НЕ питає базу (`post_read_counts`) — зайвий запит на кожне
//      оновлення Стрічки без жодного показу.
// ⚠️ ЗАПИС подій читання лишився (Вова: «запис лишаємо») — його стереже
// окремий стенд `tests/content-views.mjs`, тут не дублюємо.
import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();

const Я = { id: 'uid-me', email: 'me@example.com', user_metadata: { full_name: 'Вова' } };
const ЗАРАЗ = Date.now();

// Сцена: сторінка 4 — МОЯ (я в її команді), сторінка 9 — чужа.
const допис = (id, page_id, зайве = {}) => ({
  id, page_id, author_uid: 'u-page',
  text: `Допис ${id} — кілька слів, щоб картка мала висоту і її було видно.`,
  photos: [], created_at: new Date(ЗАРАЗ - id * 6e4).toISOString(),
  ts: ЗАРАЗ - id * 6e4, status: 'published', ...зайве,
});

const СЦЕНА = {
  posts: [], announcements: [], profiles: [],
  pages: [
    { id: 4, name: 'Олицька міська рада', verified: true },
    { id: 9, name: 'Сусідня спільнота' },
  ],
  page_posts: [
    допис(501, 4),                            // моя сторінка, читачі є
    допис(502, 4),                            // моя сторінка, читачів нуль
    допис(503, 4, { status: 'draft' }),       // моя чернетка, читачі «є»
    допис(504, 9),                            // ЧУЖА сторінка, читачів багато
  ],
  page_admins: [{ page_id: 4, uid: Я.id, role: 'owner' }],
  content_reads: [
    { post_id: 501, 'людей': 12 },
    { post_id: 502, 'людей': 0 },
    { post_id: 503, 'людей': 7 },
    { post_id: 504, 'людей': 50 },
  ],
};

const { url, stop } = await serve();
const b = await launch(chromium);

async function сцена(хто) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                   hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await mockSupabase(p, СЦЕНА, хто ? { user: хто } : {});
  await p.route('**://api.open-meteo.com/**', r => r.abort());
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  await p.evaluate(() => document.querySelector('.consent-accept')?.click());
  await p.waitForTimeout(1200);
  // Стрічка — друга вкладка. Без переходу картки взагалі не побудовані.
  await p.evaluate(() => window.switchTab && window.switchTab('feed'));
  await p.waitForTimeout(1600);
  return { ctx, p };
}

// ── 0. КОНТРОЛЬ: КАРТКА СВОГО ДОПИСУ ВЗАГАЛІ НАМАЛЬОВАНА ────────────────────
// Без нього «рядка немає» зеленіло б і тоді, коли Стрічка не відкрилась зовсім.
const { ctx: c1, p: p1 } = await сцена(Я);
const картка = await p1.evaluate(() => !!document.querySelector('.fd-card[data-post="501"]'));
ok('🔴 контроль: картка свого допису (12 читачів) на екрані', картка);

// ── 1. ЛІЧИЛЬНИКА НЕМАЄ НІДЕ ────────────────────────────────────────────────
const рядків = await p1.evaluate(() => document.querySelectorAll('.fd-reads').length);
ok('🛑 «👁 N» не показується на жодній картці', рядків === 0, `рядків: ${рядків}`);

// ── 2. ЗА ЧИСЛОМ БАЗУ НЕ ПИТАЄМО ────────────────────────────────────────────
// Контроль, що журнал викликів узагалі пишеться: Стрічка без жодного RPC
// означала б, що міряти нема чого, і «0 викликів» нічого б не доводило.
const журнал = await p1.evaluate(() => (window.__cstlRpcCallsLog || []).map(r => r.fn));
ok('🔴 контроль: журнал викликів бази пишеться', журнал.length > 0, `викликів: ${журнал.length}`);
ok('🛑 запиту `post_read_counts` немає', !журнал.includes('post_read_counts'),
   `виклики: ${JSON.stringify([...new Set(журнал)])}`);
await c1.close();

await b.close(); await stop();
done();
