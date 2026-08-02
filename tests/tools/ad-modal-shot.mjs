// tests/tools/ad-modal-shot.mjs — знімок + заміри МОДАЛКИ ОГОЛОШЕННЯ (три шари).
// Запуск руками: `node tests/tools/ad-modal-shot.mjs`
// Дає кадр із фото і без фото + числа кожного шару у % висоти екрана, щоб порівняти
// з макетом (фото 31.4% · аркуш 52.8% · панель дій 15.8% — заміряно з картинки ChatGPT).
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { chromiumPath, serve } from '../_lib.mjs';

const OUT = 'shots/ad-modal'; mkdirSync(OUT, { recursive: true });
const PHOTO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
  '<stop offset="0" stop-color="#8FA3B8"/><stop offset="1" stop-color="#3C4E63"/></linearGradient></defs>' +
  '<rect width="1200" height="1600" fill="url(#g)"/>' +
  '<rect x="200" y="700" width="800" height="600" fill="#E8E2D6"/>' +
  '<polygon points="150,700 600,420 1050,700" fill="#4A3B32"/></svg>');

const ts = Date.now() - 3 * 864e5;
const mk = (id, photos) => ({
  id, type: 'board', category: 'продам', title: 'ПРОДАМ БУДИНОК В ЖОРНИЩЕ',
  text: 'Продається просторий будинок у тихому та затишному місці. Підходить як для постійного проживання, так і для дачі.\n\nЗемельна ділянка 25 сотих, всі комунікації підведені. Документи готові до продажу.',
  photos, price: 450000, currency: 'UAH', price_negotiable: true, location: 'Жорнище',
  author: 'Volodymyr Shevchuk', author_name: 'Volodymyr Shevchuk', owner_uid: 'u1',
  contact: '+380671234567', status: 'published',
  ts, created_at: new Date(ts).toISOString(), bumped_at: new Date(ts).toISOString(),
});
const POSTS = [mk(901, [PHOTO, PHOTO, PHOTO]), mk(902, [])];

const { url, stop } = await serve();
const b = await chromium.launch({ executablePath: chromiumPath() });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, deviceScaleFactor: 3, serviceWorkers: 'block' });
const p = await ctx.newPage();
const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
await p.route('**://*.supabase.co/**', r => json(r, []));
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.route('**/data/community-board.json*', r => json(r, { posts: POSTS }));

// Банер згоди з Політикою показується при ПЕРШОМУ вході й накриває панель дій —
// саме те, заради чого й робиться знімок. Ключ той самий, що у `core/consent.js`.
await ctx.addInitScript(() => { try { localStorage.setItem('cstl-legal-consent-v1', '1'); } catch (_) {} });
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.evaluate(() => window.switchTab && window.switchTab('board'));
await p.waitForTimeout(1500);

const open = async id => {
  await p.evaluate(pid => {
    const el = document.querySelector(`#board-content [data-post-id="${pid}"]`);
    if (el) { el.scrollIntoView({ block: 'center' }); el.click(); }
  }, id);
  await p.waitForTimeout(800);
};
const close = async () => {
  await p.evaluate(() => document.querySelector('.cm-board-modal-note [data-ad-close]')?.click());
  await p.waitForTimeout(500);
};
const measure = () => p.evaluate(() => {
  const H = window.innerHeight;
  const pct = el => el ? +(el.getBoundingClientRect().height / H * 100).toFixed(1) : null;
  const topPct = el => el ? +(el.getBoundingClientRect().top / H * 100).toFixed(1) : null;
  const q = s => document.querySelector(s);
  const r = el => el ? el.getBoundingClientRect() : null;
  const sheet = q('.cm-ad-sheet'), photo = q('.cm-ad-photo'), bar = q('.cm-ad-bottom');
  return {
    екран: H,
    фото_висота_percent: pct(photo), фото_видно_percent: sheet && photo ? +((r(sheet).top - r(photo).top) / H * 100).toFixed(1) : null,
    аркуш_верх_percent: topPct(sheet), аркуш_висота_percent: pct(sheet),
    панель_верх_percent: topPct(bar), панель_висота_px: bar ? Math.round(r(bar).height) : null,
    радіус_фото: photo ? getComputedStyle(photo).borderTopLeftRadius : null,
    радіус_аркуша: sheet ? getComputedStyle(sheet).borderTopLeftRadius : null,
    радіус_панелі: bar ? getComputedStyle(bar).borderTopLeftRadius : null,
    круглих_кнопок: document.querySelectorAll('.cm-ad-round').length,
    крапок: document.querySelectorAll('.cm-ad-photo .cm-board-modal-dot').length,
    лічильник: q('.cm-ad-hero-count')?.textContent || null,
  };
});

await open(901);
console.log('── З ФОТО ──\n' + JSON.stringify(await measure(), null, 1));
await p.screenshot({ path: `${OUT}/модалка-з-фото.png` });
await p.evaluate(() => { const s = document.querySelector('.cm-board-modal-scrollarea'); if (s) s.scrollTop = 9999; });
await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/модалка-прокручена.png` });
await close();

await open(902);
console.log('── БЕЗ ФОТО ──\n' + JSON.stringify(await measure(), null, 1));
await p.screenshot({ path: `${OUT}/модалка-без-фото.png` });

await b.close(); await stop();
console.log(`\nкадри → ${OUT}/`);
