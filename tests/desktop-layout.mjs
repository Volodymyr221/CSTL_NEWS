// Стенд: КОМПʼЮТЕРНА ВЕРСІЯ (08.10.2026) — рама навколо застосунку.
//
// 🗣️ Вова: «детально продумати комп'ютерну версію… просто і сучасно», «Зараз, на
// повну». Реалізація — `style/desktop.css` (усе під одним @media) + `core/desktop-shell.js`.
// До 08.10 замість цього був екран «поки що тільки телефон» (`desktop-gate`).
//
// 🔑 Стенд стереже ДВА боки, і другий важливіший:
//   • на компʼютері (широке вікно + миша) — застосунок будується, ліва панель,
//     колонка гнучка (600–760px), смуги розділів не вилазять за колонку, вікна по центру, Esc;
//   • на ТЕЛЕФОНІ — нічого з цього не просочилось: таб-бар унизу, шапка на місці,
//     застосунок на всю ширину. Рама робилась за 11 днів до запуску, і головний
//     ризик був саме в тому, щоб зачепити телефонну версію.
// 📐 Міряємо ГЕОМЕТРІЮ живих вузлів, а не наявність правил у CSS: правило може стояти
// і не діяти (специфічність, порядок підключення), а людина бачить саме геометрію.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { launch, serve, reporter, ROOT } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const { url, stop } = await serve();
const b = await launch(chromium);

const iso = m => new Date(Date.now() - m * 60000).toISOString();
const POSTS = [
  { id: 11, type: 'board', category: 'продам', title: 'Велосипед', text: 'Гарний стан.', photos: [], price: 4500,
    currency: 'UAH', location: 'Олика', author: 'Житель', owner_uid: 'u2', status: 'published',
    created_at: iso(30), bumped_at: iso(30) },
];
const СПІЛЬНОТИ = ['Історія Громади', 'Olyka Castle', 'Туристична Олика', 'Центр культури', 'Міська рада', 'Молодіжна рада', 'Школа', 'Бібліотека']
  .map((name, i) => ({ id: i + 1, name }));
const tables = { posts: POSTS, comments: [], announcements: [], reactions: [], saved_posts: [], pages: СПІЛЬНОТИ,
  page_posts: [1, 2, 3].map(i => ({ id: 500 + i, page_id: i, author: 'x', author_uid: 'u-page', text: 'Допис ' + i,
    photos: [], created_at: iso(i * 60), ts: Date.now() - i * 36e5, status: 'published' })) };

async function open(ctxOpts) {
  const ctx = await b.newContext({ serviceWorkers: 'block', ...ctxOpts });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('cstl-legal-consent-v1', '05.10.2026');
      localStorage.setItem('cstl_board_rules_v1', '1');
    } catch (_) {}
  });
  const p = await ctx.newPage();
  await mockSupabase(p, tables);
  await p.goto(url + '/index.html');
  await p.waitForSelector('.tab-bar .tab-item', { timeout: 15000 });
  await p.waitForTimeout(3500);   // заставка + перший рендер
  await p.getByText('Поки пропустити').click({ timeout: 500 }).catch(() => {});
  return { ctx, p };
}
const rect = (p, sel) => p.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom, display: cs.display, vis: cs.visibility };
}, sel);

// ── 0. Один запит на дві половини ───────────────────────────────────────────
{
  const css = readFileSync(ROOT + '/style/desktop.css', 'utf8');
  const js = readFileSync(ROOT + '/src/core/desktop-shell.js', 'utf8');
  const mq = (js.match(/DESKTOP_MQ\s*=\s*'([^']+)'/) || [])[1];
  ok('🔴 запит компʼютера в JS і в CSS однаковий (інакше рама й стилі розійдуться)',
     !!mq && css.includes('@media ' + mq), mq || 'DESKTOP_MQ не знайдено');
}

// ── 1. ТЕЛЕФОН: нічого не просочилось ───────────────────────────────────────
{
  const { ctx, p } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const tab = await rect(p, '.tab-bar');
  const head = await rect(p, '.app-header');
  const main = await rect(p, '.app-main');
  const brand = await p.evaluate(() => !!document.querySelector('.dk-brand, .dk-rail'));
  ok('📱 таб-бар унизу на всю ширину', tab && Math.abs(tab.b - 844) < 2 && tab.w >= 389, JSON.stringify(tab));
  ok('📱 шапка на місці', head && head.display !== 'none' && head.h > 30, JSON.stringify(head));
  ok('📱 застосунок на всю ширину', main && main.w >= 389 && main.x === 0, JSON.stringify(main));
  ok('🔴 📱 рама компʼютера на телефоні не будується', !brand, brand ? 'знайдено .dk-*' : 'немає');
  await ctx.close();
}

// ── 2. КОМПʼЮТЕР 1440: рама ──────────────────────────────────────────────────
const { ctx, p } = await open({ viewport: { width: 1440, height: 900 } });
{
  const tab = await rect(p, '.tab-bar');
  const main = await rect(p, '.app-main');
  const head = await rect(p, '.app-header');
  const rail = await rect(p, '.dk-rail');
  ok('🔴 🖥 застосунок будується на компʼютері (екрана «тільки телефон» більше немає)',
     !!tab && !(await p.$('.dg')), JSON.stringify(tab));
  ok('🖥 навігація — картка біля лівого краю (≤ 48px) на всю висоту', tab && tab.x > 0 && tab.x <= 48 && tab.h >= 860 && tab.w <= 270, JSON.stringify(tab));
  ok('🖥 навігація приєднана до колонки (проміжок ≤ 24px, а не рама від краю вікна)', tab && main && main.x - tab.r <= 25 && main.x - tab.r >= 8, `${main?.x} − ${tab?.r}`);
  ok('🖥 центральна колонка гнучка: на 1440 забирає вільне місце (740 = 1440 − поля 2×40 − меню − права колонка − проміжки)', main && Math.round(main.w) === 740, JSON.stringify(main));
  ok('🖥 колонка не перетинається з навігацією', main && tab && main.x >= tab.r, `${main?.x} ≥ ${tab?.r}`);
  ok('🖥 шапки телефона немає', head && head.display === 'none', JSON.stringify(head));
  ok('🖥 права колонка праворуч від центральної', rail && main && rail.x >= main.r + 20, JSON.stringify(rail));
  const шапка = await p.evaluate(() => { const h = document.querySelector('.hm-top'); if (!h) return null;
    const r = h.getBoundingClientRect(); const cs = getComputedStyle(h);
    return { top: Math.round(r.top), radius: cs.borderTopLeftRadius, border: cs.borderTopWidth }; });
  ok('🖥 бордова шапка Громади — картка з полем зверху й заокругленими кутами (верх на одній лінії з меню, 16px)',
     шапка && Math.abs(шапка.top - 16) <= 1 && шапка.radius === '20px' && шапка.border === '0px', JSON.stringify(шапка));
  // Вова 08.10: «без фото головна не йде — втрачає стиль». Фото лишається тлом Громади.
  const фото = await p.evaluate(() => getComputedStyle(document.querySelector('.hm-bg') || document.body).display);
  ok('🖥 Громада на компʼютері — з фото на тлі (без нього капсули й скло втрачають стиль)', фото !== 'none', фото);
  const brand = await p.evaluate(() => document.querySelector('.tab-bar .dk-brand')?.firstChild?.textContent);
  ok('🖥 бренд «ГРОМАДА» в навігації', brand === 'ГРОМАДА', brand);
  const more = await p.evaluate(() => [...document.querySelectorAll('.tab-bar [data-dk-nav]')].map(x => x.dataset.dkNav));
  ok('🖥 другорядні пункти дзеркалять бічне меню (Новини, Збережені…)',
     ['news', 'saved', 'messages'].every(id => more.includes(id)), more.join(','));
  ok('🖥 вкладки в «Ще» не дублюються', !more.some(id => ['community', 'shotam', 'board', 'buses', 'discussions'].includes(id)), more.join(','));
}
// ── 08.10«б» — шліфовка після відгуку Вови («не професійно, копія інстаграму») ──
{
  const стан = await p.evaluate(() => ({
    caps: [...document.querySelectorAll('.tab-bar .dk-cap')].map(x => x.textContent.trim()),
    info: !!document.querySelector('.tab-bar [data-dk-nav="policy"]'),
    // порядок: розділи → «Створити» → Моє (рішення Вови 08.10«д»)
    порядок: (() => { const y = s => document.querySelector(s)?.getBoundingClientRect().top ?? -1;
      return y('.dk-sec [data-dk-nav="news"]') < y('.dk-cta-btn') && y('.dk-cta-btn') < y('.dk-more [data-dk-nav="messages"]'); })(),
    foot: [...document.querySelectorAll('.dk-foot [data-dk-nav]')].map(x => x.dataset.dkNav),
    myq: !!document.querySelector('.dk-more [data-dk-fab="discussions:disc-mine"]'),
  }));
  ok('🖥 групи меню з підписами («Моє»), а «Інформація» переїхала в підвал',
     стан.caps.includes('Моє') && !стан.caps.includes('Інформація') && !стан.info, JSON.stringify(стан));
  ok('🖥 порядок: Новини й Збори з розділами → «Створити» → «Моє»', стан.порядок, JSON.stringify(стан));
  const підвал = await p.evaluate(() => {
    const f = document.querySelector('.dk-foot button');
    return f ? [getComputedStyle(f).color, getComputedStyle(document.querySelector('.dk-foot')).backgroundColor] : null;
  });
  ok('🖥 підвал читається: темний текст на білій картці (а не білий на білому)',
     !!підвал && підвал[1] === 'rgb(255, 255, 255)' && !/255, 255, 255/.test(підвал[0]), JSON.stringify(підвал));
  ok('🖥 підвал правої колонки: політика, правила, підтримка', ['policy', 'boardrules', 'support'].every(x => стан.foot.includes(x)), стан.foot.join(','));
  ok('🖥 «Мої питання» мають вхід (кругла кнопка, де вони жили, на компʼютері прихована)', стан.myq, '');
  const меню = await rect(p, '.dk-cta-menu');
  await p.click('.dk-cta-btn');
  await p.waitForTimeout(200);
  const відкрито = await rect(p, '.dk-cta-menu');
  ok('🖥 «Створити» відкриває меню дій', (!меню || меню.display === 'none') && відкрито && відкрито.display !== 'none' && відкрито.h > 60, JSON.stringify(відкрито));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  const закрито = await rect(p, '.dk-cta-menu');
  ok('🖥 Esc закриває меню «Створити»', !закрито || закрито.display === 'none', JSON.stringify(закрито));
  await p.click('.dk-cta-btn');
  await p.click('.dk-cta-menu [data-dk-fab="board:post"]');
  await p.waitForTimeout(1800);
  const після = await p.evaluate(() => ({
    tab: document.querySelector('.app-main')?.dataset.tab,
    реакція: !!document.querySelector('.app-modal, .acc-join, .toast'),
  }));
  ok('🔴 🖥 «Подати оголошення» веде на Дошку і запускає ту саму дію, що кругла кнопка',
     після.tab === 'board' && після.реакція, JSON.stringify(після));
  await p.evaluate(() => document.querySelector('.app-modal .app-modal-close')?.click());
  await p.waitForTimeout(600);
  const fab = await rect(p, '.board-trigger--fixed');
  ok('🖥 круглої кнопки «+» у куті колонки на компʼютері немає', !fab || fab.display === 'none', JSON.stringify(fab));
  const тло = await p.evaluate(() => {
    const m = document.querySelector('.app-main');
    return { main: getComputedStyle(m).backgroundColor, body: getComputedStyle(document.body).backgroundColor,
             board: getComputedStyle(document.documentElement).getPropertyValue('--board-bg').trim() };
  });
  ok('🖥 вкладка лежить прямо на тлі сайту: колонка прозора, тло сторінки = тло Дошки',
     тло.main === 'rgba(0, 0, 0, 0)' && тло.body !== 'rgba(0, 0, 0, 0)', JSON.stringify(тло));
  await p.evaluate(() => window.switchTab('discussions'));
  await p.waitForTimeout(800);
  await p.evaluate(() => { const m = document.querySelector('.app-main'); m.style.minHeight = '0'; const f = document.createElement('div'); f.style.height = '3000px'; f.id = 'tst-fill'; m.appendChild(f); m.scrollTop = 0; });
  await p.mouse.move(1400, 700);
  await p.mouse.wheel(0, 400);
  await p.waitForTimeout(400);
  const прокрут = await p.evaluate(() => { const m = document.querySelector('.app-main'); const v = m.scrollTop; document.getElementById('tst-fill')?.remove(); return v; });
  ok('🖥 колесо миші на порожньому полі збоку крутить колонку', прокрут > 100, `scrollTop ${прокрут}`);
}
// Ряд спільнот Стрічки (Вова 08.10: «перша спільнота обрізана, впритик до краю»)
{
  // Попередній крок міг лишити відкритим вікно (запрошення увійти / правила Дошки).
  await p.click('.brules-ok', { timeout: 500 }).catch(() => {});
  await p.evaluate(() => document.querySelector('.app-modal .app-modal-close')?.click());
  await p.waitForTimeout(500);
  await p.evaluate(() => window.switchTab('shotam'));
  await p.waitForTimeout(1500);
  // Гостю на вкладці зʼявляється запрошення увійти — закриваємо, як людина.
  await p.getByText('Поки пропустити').click({ timeout: 800 }).catch(() => {});
  await p.waitForTimeout(500);
  const ряд = await p.evaluate(() => {
    const r = document.querySelector('.fd-circles'); const c = r?.querySelector('.fd-circle');
    const m = document.querySelector('.app-main').getBoundingClientRect();
    return r && c ? { fit: r.classList.contains('is-fit'), over: r.scrollWidth > r.clientWidth + 2,
      first: c.getBoundingClientRect().left - m.left } : null;
  });
  ok('🔴 🖥 ряд спільнот, що не влазить, гортається з лівого краю (перша спільнота не обрізана)',
     ряд && ряд.over && !ряд.fit && ряд.first >= 8, JSON.stringify(ряд));
  const кр = await rect(p, '.fd-circles');
  await p.mouse.move(кр.x + кр.w / 2, кр.y + кр.h / 2);
  await p.mouse.wheel(0, 300);
  await p.waitForTimeout(300);
  const зсув = await p.evaluate(([x, y]) => ({ sl: document.querySelector('.fd-circles').scrollLeft,
    під: document.elementFromPoint(x, y)?.className}), [кр.x + кр.w / 2, кр.y + кр.h / 2]);
  ok('🖥 колесо миші над рядом спільнот гортає його вбік', зсув.sl > 100, JSON.stringify(зсув));
}
// Смуги розділів не вилазять за колонку
for (const [tab, sel] of [['buses', '.bus-search'], ['buses', '.bus-week-strip'], ['board', '.bd-controls']]) {
  await p.evaluate(t => window.switchTab(t), tab);
  await p.waitForTimeout(1200);
  // Гейт правил Дошки показується при першому вході — приймаємо, як людина.
  await p.click('.brules-ok', { timeout: 600 }).catch(() => {});
  await p.waitForTimeout(400);
  const r = await rect(p, sel);
  const m = await rect(p, '.app-main');
  ok(`🖥 ${sel} (${tab}) у межах колонки`, r && m && r.x >= m.x - 1 && r.r <= m.r + 1, `${JSON.stringify(r)} / колонка ${m?.x}–${m?.r}`);
}
// Список зупинок «Звідки» (Вова 08.10: «розтягується на всю ширину»)
{
  await p.evaluate(() => window.switchTab('buses'));
  await p.waitForTimeout(1200);
  await p.click('#bs-from-input');
  await p.waitForTimeout(600);
  const dd = await rect(p, '#bs-dropdown');
  const m = await rect(p, '.app-main');
  ok('🖥 список зупинок «Звідки» у межах колонки', dd && dd.w > 100 && dd.x >= m.x - 1 && dd.r <= m.r + 1,
     `${JSON.stringify(dd)} / колонка ${m?.x}–${m?.r}`);
  await p.keyboard.press('Escape');
  await p.evaluate(() => document.getElementById('bs-dd-x')?.click());
  await p.waitForTimeout(400);
}
// Вікно по центру + Esc
{
  await p.click('.dk-foot [data-dk-nav="policy"]');
  await p.waitForTimeout(900);
  const s = await rect(p, '.app-modal-sheet');
  ok('🖥 вікно відкривається по центру екрана, а не аркушем на всю ширину',
     s && s.w <= 600 && Math.abs((s.x + s.w / 2) - 720) < 40 && s.b < 900, JSON.stringify(s));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(900);
  ok('🔴 🖥 Esc закриває вікно', !(await p.$('.app-modal-sheet')), 'вікно лишилось');
}
// Клік по розділу закриває відкритий екран
{
  await p.click('.tab-bar [data-dk-nav="news"]');
  await p.waitForTimeout(1200);
  const nh = await rect(p, '.nh-screen');
  const m = await rect(p, '.app-main');
  ok('🖥 екран Новин відкривається в колонці', nh && m && Math.abs(nh.x - m.x) < 2 && Math.round(nh.w) === Math.round(m.w), JSON.stringify(nh));
  const позначка = await p.evaluate(() => ({
    news: document.querySelector('.tab-bar [data-dk-nav="news"]')?.classList.contains('dk-on'),
    вкладка: getComputedStyle(document.querySelector('.tab-bar .tab-item.active, .tab-bar .tab-item--home.active')).backgroundColor,
  }));
  ok('🖥 відкриті Новини позначені в навігації, а вкладка під ними гасне',
     позначка.news && позначка.вкладка === 'rgba(0, 0, 0, 0)', JSON.stringify(позначка));
  await p.click('.tab-bar .tab-item[data-tab="board"]');
  await p.waitForTimeout(1200);
  const лишився = await p.evaluate(() => !!document.querySelector('.nh-screen'));
  const активна = await p.evaluate(() => document.querySelector('.app-main')?.dataset.tab);
  ok('🔴 🖥 клік по розділу в навігації закриває відкритий екран', !лишився && активна === 'board',
     `екран ${лишився ? 'лишився' : 'закрито'}, вкладка ${активна}`);
  // Екран поверх екрана: відкриті Новини → клік «Збори». Закриття шару асинхронне
  // (`history.go`), і без очікування воно закривало б уже НОВИЙ екран.
  await p.click('.brules-ok', { timeout: 600 }).catch(() => {});
  await p.waitForTimeout(400);
  await p.click('.tab-bar [data-dk-nav="news"]');
  await p.waitForTimeout(1200);
  await p.click('.tab-bar [data-dk-nav="fund"]');
  await p.waitForTimeout(1500);
  const стан2 = await p.evaluate(() => ({ news: !!document.querySelector('.nh-screen'), fund: !!document.querySelector('.fs-screen') }));
  ok('🔴 🖥 з відкритих Новин клік «Збори» відкриває Збори, а не блимає і зникає', !стан2.news && стан2.fund, JSON.stringify(стан2));
  await p.goBack().catch(() => {});
  await p.waitForTimeout(800);
}
await ctx.close();

// ── 3. КОМПʼЮТЕР 1200: правої колонки немає, колонка забирає її місце ─────────
{
  const { ctx, p } = await open({ viewport: { width: 1200, height: 800 } });
  const rail = await rect(p, '.dk-rail');
  const main = await rect(p, '.app-main');
  const tab = await rect(p, '.tab-bar');
  ok('🖥 вужче за 1360 права колонка ховається', !rail || rail.display === 'none', JSON.stringify(rail));
  ok('🖥 на 1200 колонка ширша за 640 і не налазить на навігацію', main && main.w >= 640 && main.w <= 760 && main.x >= tab.r && main.r <= 1200 - 30,
     JSON.stringify(main));
  await ctx.close();
}

// ── 4. ЗАЛОГІНЕНИЙ: картка внизу навігації знає, хто увійшов ───────────────────
// 🗣️ Вова 08.10 зі знімка: «я зайшов в акаунт, а знизу зліва пише "вхід", чому?»
// Меню телефона перемальовується лише відкритим, а ліва панель — його дзеркало
// постійно. `slow.getSession` — сесія приходить ПІСЛЯ першого рендера, як на проді.
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('cstl-legal-consent-v1', '05.10.2026'); } catch (_) {} });
  const p = await ctx.newPage();
  await mockSupabase(p, { ...tables, threads: [], messages: [], thread_user_state: [], page_admins: [{ page_id: 1, user_uid: 'u-me' }] }, {
    user: { id: 'u-me', email: 'me@example.com', user_metadata: { name: 'Вова' } },
    profiles: [{ uid: 'u-me', name: 'Вова Тестовий', avatar_url: '' }], slow: { getSession: 2500 } });
  await p.goto(url + '/index.html');
  await p.waitForSelector('.dk-me', { timeout: 15000 });
  await p.waitForTimeout(5000);
  const me = await p.evaluate(() => document.querySelector('.dk-me')?.textContent.trim());
  ok('🔴 🖥 після входу внизу навігації — імʼя, а не «Приєднатись»', !!me && !/Приєднатись/.test(me) && /Вова/.test(me), me);

  // Новий допис у спільноті — вікно по центру, а не аркуш знизу (Вова 08.10).
  await p.evaluate(() => window.switchTab('shotam'));
  await p.waitForTimeout(1500);
  await p.getByText('Поки пропустити').click({ timeout: 500 }).catch(() => {});
  // Вікна, що могли вискочити залогіненому (доповнити профіль, правила), закриваємо.
  for (let i = 0; i < 3 && await p.$('.app-modal.open'); i++) {
    await p.evaluate(() => document.querySelector('.app-modal.open .app-modal-close')?.click());
    await p.click('.brules-ok', { timeout: 300 }).catch(() => {});
    await p.waitForTimeout(500);
  }
  await p.click('.fd-circle[data-open-page="1"]');
  await p.waitForTimeout(1500);
  const екран = await rect(p, '.fd-screen');
  ok('🔴 🖥 екран спільноти йде до низу вікна — вкладка під ним не просвічує знизу',
     екран && Math.abs(екран.b - 900) <= 1, JSON.stringify(екран));
  await p.waitForTimeout(1500);
  await p.click('.fd-compose-open');
  await p.waitForTimeout(800);
  const вікно = await rect(p, '.fd-composer');
  ok('🖥 «Написати пост…» відкриває вікно по центру екрана (не аркуш від низу)',
     вікно && Math.abs((вікно.x + вікно.w / 2) - 720) < 30 && вікно.b < 900 - 24 && вікно.y > 24 && вікно.w >= 640 && вікно.w <= 720,
     JSON.stringify(вікно));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(600);
  ok('🖥 Esc закриває вікно нового допису', !(await p.$('.fd-composer')), 'вікно лишилось');
  await p.click('.fd-compose-open');
  await p.waitForTimeout(800);
  await p.click('.fd-composer .dk-sheet-x');
  await p.waitForTimeout(600);
  ok('🖥 хрестик ✕ закриває вікно нового допису', !(await p.$('.fd-composer')), 'вікно лишилось');
  await ctx.close();
}

// ── 6. ЕКРАН ПОВЕРХ ВКЛАДКИ НЕ ПРОСВІЧУЄ НІ ЗВЕРХУ, НІ ЗНИЗУ ────────────────────
// Вова 08.10 (знімок: Громада → Новини): «зверху і знизу видно сторінку під —
// такого не має бути з жодними сторінками». Над екраном (смуга 16px) має бути тло
// сторінки, а знизу екран іде до краю вікна. `elementFromPoint` бачить елемент, а не
// псевдоелемент: смуга тла — це `body::before`, тож у ній мусить бути `body`.
{
  const { ctx, p } = await open({ viewport: { width: 1440, height: 900 } });
  await p.evaluate(() => window.switchTab('community'));
  await p.waitForTimeout(1200);
  await p.click('.tab-bar [data-dk-nav="news"]');
  await p.waitForTimeout(1300);
  const m = await rect(p, '.nh-screen');
  // Смуга тла має `pointer-events: none` (клік крізь неї не потрібен), а такі вузли
  // `elementFromPoint` пропускає — на час виміру вмикаємо їй влучання.
  await p.addStyleTag({ content: 'body::before { pointer-events: auto !important; }' });
  const під = await p.evaluate(([x]) => ({
    верх: document.elementFromPoint(x, 6)?.tagName,
    низ: document.elementFromPoint(x, 898)?.closest('.nh-screen') ? 'nh' : document.elementFromPoint(x, 898)?.className,
  }), [m.x + m.w / 2]);
  ok('🔴 🖥 Громада → Новини: над екраном тло сторінки, а не вкладка; знизу — сам екран',
     під.верх === 'BODY' && під.низ === 'nh', JSON.stringify(під));
  await ctx.close();
}

// ── 5. НИЗЬКИЙ ЕКРАН: меню прокручується, а назва і кабінет стоять ─────────────
// Вова 08.10: «нижня частина (кабінет) фіксована, а верхня — ГРОМАДА — ні».
{
  const { ctx, p } = await open({ viewport: { width: 1440, height: 600 } });
  const до = await rect(p, '.dk-brand');
  const можна = await p.evaluate(() => { const n = document.querySelector('.tab-bar'); n.scrollTop = 9999; return n.scrollTop; });
  await p.waitForTimeout(200);
  const після = await rect(p, '.dk-brand');
  const me = await rect(p, '.dk-me');
  ok('🖥 меню прокручене — назва «ГРОМАДА» лишається вгорі, кабінет унизу',
     можна > 0 && до && після && Math.abs(після.y - до.y) <= 1 && me && me.b <= 600 - 16 + 1,
     `прокрут ${можна}, назва ${до?.y}→${після?.y}, кабінет низ ${me?.b}`);
  // Кружечок «Громади» (з таб-бару телефона, z-index 1001) не сміє налазити на назву
  // під час прокрутки — Вова 08.10: «іконка громади налазить на шапку».
  const поверх = [];
  for (const y of [30, 50, 70]) {
    await p.evaluate(y => { document.querySelector('.tab-bar').scrollTop = y; }, y);
    await p.waitForTimeout(120);
    поверх.push(...await p.evaluate(() => { const r = document.querySelector('.dk-brand').getBoundingClientRect();
      return [[r.left + 40, r.top + 30], [r.left + 40, r.bottom - 8], [r.left + 120, r.bottom - 8]]
        .map(([x, y]) => document.elementFromPoint(x, y)?.closest('.dk-brand') ? '' : document.elementFromPoint(x, y)?.className)
        .filter(Boolean); }));
  }
  ok('🔴 🖥 при прокрутці меню ніщо не налазить на назву (кружечок «Громади» ховається під нею)',
     поверх.length === 0, поверх.join(', ') || 'чисто');
  await ctx.close();
}

await b.close(); await stop();
done();
