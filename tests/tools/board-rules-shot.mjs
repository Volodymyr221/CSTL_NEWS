// Разові знімки: гейт правил Дошки, список карток, блок безпеки в оголошенні.
// Нічого не змінює. Запуск: node tests/tools/board-rules-shot.mjs
import { chromium } from 'playwright';
import { launch, serve } from '../_lib.mjs';

const ts = Date.now() - 3 * 864e5;
const mk = (id, extra) => ({
  id, type: 'board', category: 'продам', title: 'Продаю машину',
  text: 'Терміново продам автомобіль у гарному стані, один власник, торг можливий при огляді.',
  photos: [], price: null, currency: 'UAH', location: 'Вся Олицька громада',
  author: 'Тест', owner_uid: 'u1', status: 'published', ts,
  created_at: new Date(ts).toISOString(), bumped_at: new Date(ts).toISOString(), ...extra,
});
const POSTS = [
  mk(901, { title: 'КУПЛЮ ЗЕРНО', category: 'куплю', text: 'Куплю зерно' }),
  mk(902, { title: 'Продам мотоцикл', text: 'У робочому стані, документи є.' }),
  mk(903, { title: 'ПРОДАМ БУДИНОК В ЖОРНИЩЕ', location: 'Жорнище', text: 'Ділянка 25 соток, поруч ліс і озеро. Ціна договірна.' }),
  mk(904, { title: null, text: 'Продам корову тільну третім телям спокійна дійна добре їсть ціна договірна дзвоніть у будь-який час' }),
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
await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(700);
await p.screenshot({ path: '/tmp/shot-rules.png' });

await p.evaluate(() => document.querySelector('.brules-ok')?.click());
await p.waitForTimeout(600);
await p.screenshot({ path: '/tmp/shot-cards.png' });

await p.evaluate(() => document.querySelector('#board-content .bd-ad')?.click());
await p.waitForTimeout(900);
await p.evaluate(() => { const s = document.querySelector('.cm-ad-scroll'); if (s) s.scrollTop = s.scrollHeight; });
await p.waitForTimeout(500);
await p.screenshot({ path: '/tmp/shot-safety.png' });

await b.close(); stop();
console.log('знімки: /tmp/shot-rules.png · /tmp/shot-cards.png · /tmp/shot-safety.png');
