// Разовий вимір: що саме зламано в модалці БЕЗ ФОТО (скрін IMG_3814).
import { chromium } from 'playwright';
import { launch, serve } from '../_lib.mjs';

const PHOTO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><rect width="1200" height="1600" fill="#8a6"/></svg>');
const ts = Date.now() - 3 * 864e5;
const POSTS = [
  { id: 901, type: 'board', category: 'продам', title: 'ПРОДАМ БУДИНОК',
    text: 'Довгий опис. '.repeat(60), photos: [PHOTO], photo: PHOTO, price: 450000, currency: 'UAH',
    location: 'Жорнище', author: 'Тест', owner_uid: 'u1', status: 'published', ts,
    created_at: new Date(ts).toISOString(), bumped_at: new Date(ts).toISOString() },
  { id: 902, type: 'board', category: 'куплю', title: 'КУПЛЮ МОТОЦИКЛ',
    text: 'Куплю мотоцикл.', photos: [], price: null, price_negotiable: true, currency: 'UAH',
    location: 'Вся Олицька громада', author: 'Тест', owner_uid: 'u1', status: 'published', ts,
    created_at: new Date(ts).toISOString(), bumped_at: new Date(ts).toISOString() },
  { id: 903, type: 'board', category: 'продам', title: 'КОРОТКЕ З ФОТО',
    text: 'Два слова.', photos: [PHOTO], photo: PHOTO, price: 100, currency: 'UAH',
    location: 'Олика', author: 'Тест', owner_uid: 'u1', status: 'published', ts,
    created_at: new Date(ts).toISOString(), bumped_at: new Date(ts).toISOString() },
];

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
await p.route('**://*.supabase.co/**', r => json(r, []));
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.route('**/data/community-board.json*', r => json(r, { posts: POSTS }));
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.evaluate(() => window.switchTab && window.switchTab('board'));
await p.waitForTimeout(1500);

const openAd = async id => {
  await p.evaluate(pid => {
    const el = document.querySelector(`#board-content [data-post-id="${pid}"]`);
    if (el) { el.scrollIntoView({ block: 'center' }); el.click(); }
  }, id);
  await p.waitForTimeout(800);
};
const closeAd = async () => {
  await p.evaluate(() => document.querySelector('.cm-board-modal-note [data-ad-close]')?.click());
  await p.waitForTimeout(500);
};

const probe = async label => {
  const r = await p.evaluate(() => {
    const q = s => document.querySelector(s), rc = e => e ? e.getBoundingClientRect() : null;
    const modal = q('.cm-board-modal-note'), sc = q('.cm-ad-scroll'), sheet = q('.cm-ad-sheet');
    const top = q('.cm-ad-top'), bar = q('.cm-ad-bottom'), photo = q('.cm-ad-photo');
    const H = window.innerHeight;
    // Що видно у трьох контрольних точках: над аркушем, під аркушем, і в центрі порожнечі
    const sr = rc(sheet);
    const pick = (x, y) => { const e = document.elementFromPoint(x, y); return e ? (e.className && String(e.className).slice(0, 42)) || e.tagName : 'НІЧОГО'; };
    return {
      фон_контейнера: modal ? getComputedStyle(modal).backgroundColor : null,
      фон_скролера: sc ? getComputedStyle(sc).backgroundColor : null,
      аркуш_верх: sr ? Math.round(sr.top) : null,
      аркуш_низ: sr ? Math.round(sr.bottom) : null,
      екран: H,
      прогалина_знизу: sr ? Math.round(H - sr.bottom) : null,
      прогалина_зверху: sr ? Math.round(sr.top) : null,
      вміст_скролера: sc ? sc.scrollHeight : null,
      можна_скролити: sc ? sc.scrollHeight - sc.clientHeight : null,
      кнопки_верх: top ? Math.round(rc(top).top) : null,
      кнопки_над_аркушем: (top && sr) ? rc(top).bottom < sr.top : null,
      під_кнопкою_ліворуч: pick(34, (top ? rc(top).top + 22 : 30)),
      панель_верх: bar ? Math.round(rc(bar).top) : null,
      є_фото: !!photo,
      // Що реально видно в точці рівно посередині прогалини під аркушем
      у_прогалині: sr && (H - sr.bottom) > 8 ? pick(195, Math.round(sr.bottom + (H - sr.bottom) / 2)) : '—',
    };
  });
  console.log('\n### ' + label);
  for (const [k, v] of Object.entries(r)) console.log('  ' + k.padEnd(22), v);
  return r;
};

await openAd(902); await probe('БЕЗ ФОТО (КУПЛЮ МОТОЦИКЛ) — скрін IMG_3814');
await p.screenshot({ path: '/tmp/after-nophoto.png' });
await closeAd();

await openAd(903); await probe('З ФОТО, але КОРОТКИЙ опис');
await p.screenshot({ path: '/tmp/after-shortphoto.png' });
await closeAd();

await openAd(901); await probe('З ФОТО, довгий опис (те, що Вова прийняв)');
await closeAd();


// ── Компактна шапка: чи кнопки в межах смуги і чи влазить назва (IMG_3816) ───
await openAd(901);
await p.evaluate(() => { const s = document.querySelector('.cm-ad-scroll'); if (s) s.scrollTop = 600; });
await p.waitForTimeout(400);
const mini = await p.evaluate(() => {
  const q = s => document.querySelector(s), rc = e => e ? e.getBoundingClientRect() : null;
  const bar = q('.cm-ad-mini'), t = q('.cm-ad-mini-title');
  const btns = [...document.querySelectorAll('.cm-ad-top .cm-ad-round')].map(b => rc(b));
  const br = rc(bar);
  return {
    смуга_низ: br ? Math.round(br.bottom) : null,
    кнопки_низ: btns.length ? Math.round(Math.max(...btns.map(r => r.bottom))) : null,
    вилазять_на: (br && btns.length) ? Math.round(Math.max(...btns.map(r => r.bottom)) - br.bottom) : null,
    ширина_назви: t ? Math.round(rc(t).width) : null,
    назва_обрізана: t ? t.scrollWidth > t.clientWidth + 1 : null,
    видимий_кружечок: btns.length ? Math.round(btns[0].width) : null,

  };
});
console.log('\n### КОМПАКТНА ШАПКА');
for (const [k, v] of Object.entries(mini)) console.log('  ' + k.padEnd(20), v);
await p.screenshot({ path: '/tmp/after-mini.png' });
await closeAd();

await b.close(); stop();
