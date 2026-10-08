// Стенд: ДОПИС СТРІЧКИ — ТЕКСТ НАД ФОТО, КІЛЬКА ФОТО — КОЛАЖ (08.10.2026).
//
// 🗣️ Вова: «опис також не знизу, а зверху, як у Facebook», «не так, як в Instagram
// свайпи — як у Facebook краще зробити фотографії, якщо їх декілька», «Прочитали 214 —
// просто око і лічильник». Реалізація — `galleryHtml` / `postCardHtml` у feed.js.
//
// 📐 Міряємо ГЕОМЕТРІЮ живих карток, а не розмітку: «текст над фото» — це те, що бачить
// людина (верх фото нижче низу тексту), а не порядок рядків у шаблоні.
// 🛑 Контроль усередині сцени: допис БЕЗ фото не має отримати колаж — інакше
// перевірки «колаж є» зеленіли б і над кодом, що малює його будь-де.
import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const { url, stop } = await serve();
const b = await launch(chromium);

const iso = m => new Date(Date.now() - m * 60000).toISOString();
const IMG = i => `${url}/images/volleyball.jpg?${i}`;
const mk = (id, mins, n) => ({ id, page_id: 1, author: 'x', author_uid: 'u-page',
  text: `Допис ${id}: кілька слів, щоб картка мала текст над фото.`,
  image_urls: Array.from({ length: n }, (_, i) => IMG(`${id}-${i}`)), photos: [],
  created_at: iso(mins), ts: Date.now() - mins * 6e4, status: 'published' });
const page_posts = [mk(501, 10, 1), mk(502, 20, 2), mk(503, 30, 3), mk(506, 40, 6), mk(500, 50, 0)];

const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
await ctx.addInitScript(() => { try { localStorage.setItem('cstl-legal-consent-v1', '05.10.2026'); } catch (_) {} });
const p = await ctx.newPage();
await mockSupabase(p, { posts: [], pages: [{ id: 1, name: 'Olyka Castle' }], page_posts }, {});
await p.goto(url + '/index.html');
await p.waitForTimeout(3500);
await p.getByText('Поки пропустити').click({ timeout: 500 }).catch(() => {});
await p.evaluate(() => window.switchTab('shotam'));
await p.waitForTimeout(2000);
await p.getByText('Поки пропустити').click({ timeout: 500 }).catch(() => {});

const картка = id => p.evaluate(i => {
  const c = document.querySelector(`#feed-list .fd-card[data-post="${i}"], .fd-card[data-post="${i}"]`);
  if (!c) return null;
  const t = c.querySelector('.fd-text')?.getBoundingClientRect();
  const ph = c.querySelector('.fd-photo, .fd-collage')?.getBoundingClientRect();
  const col = c.querySelector('.fd-collage');
  return {
    textBottom: t ? Math.round(t.bottom) : null, photoTop: ph ? Math.round(ph.top) : null,
    collage: col ? col.className : null, tiles: c.querySelectorAll('.fd-col-tile').length,
    more: c.querySelector('.fd-col-more')?.textContent || null,
    carousel: !!c.querySelector('.fd-gal-track, .fd-gallery'),
  };
}, id);

const одне = await картка(501), два = await картка(502), три = await картка(503), шість = await картка(506), без = await картка(500);
ok('🔴 текст допису стоїть НАД фото (як у Facebook)', одне && одне.photoTop >= одне.textBottom, JSON.stringify(одне));
ok('🔴 і над колажем теж', три && три.photoTop >= три.textBottom, JSON.stringify(три));
ok('🖥 одне фото — без колажу, на всю ширину', одне && !одне.collage && одне.photoTop != null, JSON.stringify(одне));
ok('2 фото — колаж із двох плиток поруч', два && /fd-collage--2/.test(два.collage) && два.tiles === 2, JSON.stringify(два));
ok('3 фото — одне велике + два', три && /fd-collage--3/.test(три.collage) && три.tiles === 3, JSON.stringify(три));
ok('6 фото — сітка 2×2 і «+2» на останній плитці', шість && /fd-collage--4/.test(шість.collage) && шість.tiles === 4 && шість.more === '+2', JSON.stringify(шість));
ok('🛑 каруселі зі свайпами більше немає ніде', [одне, два, три, шість].every(x => x && !x.carousel), 'знайдено .fd-gal-*');
ok('контроль: допис без фото — без колажу і без фото', без && !без.collage && без.photoTop == null, JSON.stringify(без));

// Тап по третій плитці відкриває перегляд саме з третього кадру.
await p.evaluate(() => document.querySelector('.fd-card[data-post="503"]')?.scrollIntoView({ block: 'center' }));
await p.waitForTimeout(400);
await p.click('.fd-card[data-post="503"] .fd-col-tile[data-idx="2"]');
await p.waitForTimeout(800);
const перегляд = await p.evaluate(() => ({ є: !!document.querySelector('.fd-viewer'), лічильник: document.querySelector('.fd-viewer-count')?.textContent || '' }));
ok('тап по плитці відкриває перегляд з цього кадру (3 з 3)', перегляд.є && /3\s*\/\s*3/.test(перегляд.лічильник), JSON.stringify(перегляд));

await b.close(); await stop();
done();
