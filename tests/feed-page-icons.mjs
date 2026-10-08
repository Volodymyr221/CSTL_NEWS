// Стенд: ІКОНКИ СПІЛЬНОТ — КОЛО, ДВІ ЛІТЕРИ, ЧЕРВОНЕ ЧИСЛО «НОВЕ» (09.10.2026).
//
// 🗣️ Вова: «це мають бути іконки спільнот… давай глянемо Б» (лічильник нових
// дописів, як на іконці додатка). Квадрат того ж дня повернуто в коло: логотипи
// громади — круглі печатки. Підпис завжди чорний (сірий робив ряд блідим).
// Реалізація — `pageAvatarHtml`, `unreadCount`, `snapshotCircleOrder` у feed.js.
//
// 🛑 Два контролі усередині сцени:
//   • перший захід (памʼяті ще нема) — НІ ОДНОГО числа: інакше новачок бачив би
//     червоне на кожній іконці, і перевірка «число є» зеленіла б над поломкою;
//   • підпис спільноти без нового НЕ сірий — він має лишатися чорним.
import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const { url, stop } = await serve();
const b = await launch(chromium);

const iso = m => new Date(Date.now() - m * 60000).toISOString();
const IMG = i => `${url}/images/volleyball.jpg?${i}`;
const mk = (id, page_id, mins) => ({ id, page_id, author: 'x', author_uid: 'u-page',
  text: `Допис ${id}: текст, щоб картка мала висоту.`, image_urls: [IMG(id)], photos: [],
  created_at: iso(mins), ts: Date.now() - mins * 6e4, status: 'published' });
// Дописи школи (2) — нижче першого екрана: їх «побачення» перевіряємо прокруткою.
const pages = [{ id: 1, name: 'Olyka Castle', sort_order: 1 }, { id: 2, name: 'Олицька школа', sort_order: 2 },
  { id: 3, name: 'Історія Громади', sort_order: 3 }];
// `pages` усередині допису — так його віддає база (join page_posts → pages).
const page_posts = [mk(601, 1, 5), mk(602, 1, 10), mk(603, 3, 15), mk(604, 2, 20), mk(605, 2, 25)]
  .map(x => ({ ...x, pages: { name: pages.find(pg => pg.id === x.page_id).name, avatar_url: null } }));

async function сцена(seen) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.addInitScript((s) => {
    try { localStorage.setItem('cstl-legal-consent-v1', '05.10.2026');
      if (s) localStorage.setItem('cstl-page-seen-v1', JSON.stringify(s)); } catch (_) {}
  }, seen);
  const p = await ctx.newPage();
  await mockSupabase(p, { posts: [], pages, page_posts }, {});
  await p.goto(url + '/index.html');
  await p.waitForTimeout(3500);
  await p.getByText('Поки пропустити').click({ timeout: 500 }).catch(() => {});
  await p.evaluate(() => window.switchTab('shotam'));
  await p.waitForTimeout(1500);
  return { p, ctx };
}
const ряд = p => p.evaluate(() => [...document.querySelectorAll('#feed-circles .fd-circle')].map(c => {
  const a = c.querySelector('.fd-circle-ava');
  return { id: c.dataset.openPage, mono: a?.textContent.trim() || '', radius: getComputedStyle(a).borderTopLeftRadius,
    bg: getComputedStyle(a).backgroundColor, label: getComputedStyle(c.querySelector('.fd-circle-label')).color, badge: c.querySelector('.fd-circle-badge')?.textContent || null };
}));

// ── 1. Перший захід ─────────────────────────────────────────────────────────
{
  const { p, ctx } = await сцена(null);
  const r = await ряд(p);
  ok('🔴 іконка спільноти — коло (логотипи громади круглі)', r.length === 3 && r.every(x => x.radius === '50%'), JSON.stringify(r));
  const castle = r.find(x => x.id === '1'), school = r.find(x => x.id === '2');
  ok('🔴 дві літери: «Olyka Castle» і «Олицька школа» більше не дві однакові «О»',
    castle?.mono === 'OC' && school?.mono === 'ОШ', JSON.stringify(r.map(x => x.mono)));
  ok('у кожної спільноти свій колір (від номера — сусіди не збігаються)', new Set(r.map(x => x.bg)).size === 3, JSON.stringify(r.map(x => x.bg)));
  ok('🛑 контроль: перший захід — жодного червоного числа', r.every(x => x.badge === null), JSON.stringify(r));
  ok('порядок з адмінки, коли нового нема', r.map(x => x.id).join() === '1,2,3', r.map(x => x.id).join());
  const head = await p.evaluate(() => {
    const a = document.querySelector('.fd-card[data-post="601"] .fd-ava');
    return a ? { cls: a.className, r: getComputedStyle(a).borderTopLeftRadius, txt: a.textContent.trim(), bg: getComputedStyle(a).backgroundColor } : null;
  });
  ok('колір у шапці допису той самий, що в ряду', head && head.bg === castle?.bg, `${head?.bg} vs ${castle?.bg}`);
  ok('шапка допису — та сама іконка (коло, «OC»)', head && /is-page/.test(head.cls) && head.r === '50%' && head.txt === 'OC', JSON.stringify(head));
  await ctx.close();
}

// ── 2. У школи два непрочитані ───────────────────────────────────────────────
{
  const now = Date.now();
  const { p, ctx } = await сцена({ 1: now, 2: 0, 3: now });
  const r = await ряд(p);
  ok('🔴 на школі червоне «2»', r.find(x => x.id === '2')?.badge === '2', JSON.stringify(r));
  ok('спільнота з новим стала першою', r[0]?.id === '2', r.map(x => x.id).join());
  ok('решта — без числа', r.filter(x => x.id !== '2').every(x => x.badge === null), JSON.stringify(r));
  ok('🛑 підпис без нового такий самий чорний, як з новим (не сірий)', new Set(r.map(x => x.label)).size === 1, JSON.stringify(r.map(x => x.label)));
  // Людина догортала до дописів школи → число гасне, ряд не перемальовується цілком.
  await p.evaluate(() => document.querySelector('#feed-circles .fd-circles')?.setAttribute('data-probe', '1'));
  await p.evaluate(() => document.querySelector('.fd-card[data-post="604"]')?.scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(1700);
  await p.evaluate(() => document.querySelector('.fd-card[data-post="605"]')?.scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(1700);
  const після = await ряд(p);
  ok('побачив обидва дописи в Стрічці → число зникло', після.find(x => x.id === '2')?.badge === null, JSON.stringify(після));
  ok('ряд латається, а не перемальовується (прокрутка ряду не скидається)',
    await p.evaluate(() => document.querySelector('#feed-circles .fd-circles')?.getAttribute('data-probe') === '1'), 'вузол ряду замінено');
  await ctx.close();
}

// ── 3. Зайшов у спільноту → число гасне ─────────────────────────────────────
{
  const now = Date.now();
  const { p, ctx } = await сцена({ 1: now, 2: 0, 3: now });
  await p.evaluate(() => document.querySelector('#feed-circles .fd-circle[data-open-page="2"]')?.click());
  await p.waitForTimeout(900);
  const скрін = await p.evaluate(() => {
    const a = document.querySelector('.fd-screen-ava-img');
    return a ? { r: getComputedStyle(a.parentElement).borderTopLeftRadius, txt: a.textContent.trim() } : null;
  });
  ok('екран спільноти — теж коло з «ОШ»', скрін && скрін.r === '50%' && скрін.txt === 'ОШ', JSON.stringify(скрін));
  const r = await ряд(p);
  ok('🔴 відкрив школу → її число зникло', r.find(x => x.id === '2')?.badge === null, JSON.stringify(r));
  await ctx.close();
}

await b.close(); await stop();
done();
