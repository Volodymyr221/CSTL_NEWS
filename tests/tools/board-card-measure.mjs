// Разовий вимір картки Дошки — перед перебудовою (замовлення Вови, скрін IMG_3822).
import { chromium } from 'playwright';
import { launch, serve } from '../_lib.mjs';

const PHOTO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><rect width="1200" height="1600" fill="#8a6"/></svg>');
const ts = Date.now() - 3 * 864e5;
const mk = (id, extra) => ({
  id, type: 'board', category: 'продам', title: 'Продаю машину',
  text: 'Терміново продам автомобіль у гарному стані, один власник, торг можливий при огляді.',
  photos: [], price: null, currency: 'UAH', location: 'Вся Олицька громада',
  author: 'Тест', owner_uid: 'u1', status: 'published', ts,
  created_at: new Date(ts).toISOString(), bumped_at: new Date(ts).toISOString(), ...extra,
});
const POSTS = [
  mk(901, { title: 'Віддам собаку', category: 'віддам', text: 'Добрий спокійний пес шукає дім. Привчений до вулиці.' }),
  mk(902, { title: 'КУПЛЮ МОТОЦИКЛ', category: 'куплю', price_negotiable: true, text: 'Куплю мотоцикл у робочому стані.' }),
  mk(903, { photos: [PHOTO], photo: PHOTO, price: 1500 }),
  mk(904, { title: 'ПРОДАМ БУДИНОК В ЖОРНИЩЕ', photos: [PHOTO], photo: PHOTO, location: 'Жорнище',
            text: 'Шукаю будинок для купівлі. Розгляну пропозиції в місті, селищі або сільській місцевості.' }),
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
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(300);

const r = await p.evaluate(() => {
  const rc = e => e.getBoundingClientRect();
  const cards = [...document.querySelectorAll('#board-content .bd-ad')];
  const rows = cards.map(c => {
    const img = c.querySelector('.bd-ad-img'), foot = c.querySelector('.bd-ad-foot');
    const t = c.querySelector('.bd-ad-title'), body = c.querySelector('.bd-ad-body');
    return {
      назва: (t?.textContent || '').slice(0, 22),
      висота_картки: Math.round(rc(c).height),
      фото: img ? Math.round(rc(img).height) : null,
      низ_фото_vs_низ_локації: (img && foot) ? Math.round(rc(img).bottom - rc(foot).bottom) : null,
      порожнеча_під_текстом: (body && img) ? Math.round(rc(c).bottom - 9 - rc(body).bottom) : null,
      опис_на_картці: !!c.querySelector('.bd-ad-desc'),
    };
  });
  const H = window.innerHeight;
  const first = cards[0] ? rc(cards[0]).top : 0;
  const visible = cards.filter(c => rc(c).top < H - 60).length;
  return { rows, видно_карток: visible, екран: H, перша_картка_від_верху: Math.round(first) };
});
console.log('\n### КАРТКА ДОШКИ — ЯК ЗАРАЗ');
console.table(r.rows);
console.log('  видно карток:', r.видно_карток, '· екран:', r.екран, '· перша від верху:', r.перша_картка_від_верху);
await p.screenshot({ path: '/tmp/board-before.png' });
await b.close(); stop();
