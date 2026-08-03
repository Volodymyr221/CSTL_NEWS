// Разовий вимір: заголовок картки Дошки (капс/акцент) + висота блока безпеки +
// вікно правил. Нічого не змінює — лише міряє. Запуск: node tests/tools/board-title-measure.mjs
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
// Довжини взяті з ЖИВОЇ бази: назви 11-24 символи, а 9 оголошень із 19 назви не мають
// узагалі (найдовший такий текст — 1296 символів).
const POSTS = [
  mk(901, { title: 'КУПЛЮ ЗЕРНО' }),
  mk(902, { title: 'Продам мотоцикл', photos: [PHOTO], photo: PHOTO }),
  mk(903, { title: 'ПРОДАМ БУДИНОК В ЖОРНИЩЕ', location: 'Жорнище' }),
  mk(904, { title: 'Продам будинок в Жорнищі з великою ділянкою землі та новим гаражем поруч ліс і озеро' }),
  mk(905, { title: null, text: 'Продам корову тільну третім телям. Спокійна, дійна, добре їсть. Ціна договірна, дзвоніть у будь-який час.' }),
  mk(906, { title: null, text: 'Продам корову тільну третім телям спокійна дійна добре їсть ціна договірна дзвоніть у будь-який час зранку до вечора можу привезти сам якщо недалеко від Олики також є сіно' }),
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
await p.waitForTimeout(400);
// Гейт правил перекриває екран — приймаємо, щоб дістатись до карток
await p.evaluate(() => document.querySelector('.brules-ok')?.click());
await p.waitForTimeout(500);

const rows = await p.evaluate(() => {
  const rc = e => e.getBoundingClientRect();
  return [...document.querySelectorAll('#board-content .bd-ad')].map(c => {
    const t = c.querySelector('.bd-ad-title'), d = c.querySelector('.bd-ad-desc');
    const cs = t && getComputedStyle(t);
    return {
      заголовок: (t?.textContent || '').slice(0, 34),
      символів: (t?.textContent || '').length,
      рядків: t ? Math.round(rc(t).height / (parseFloat(cs.lineHeight) || 1)) : 0,
      кегль: cs?.fontSize, капс: cs?.textTransform,
      висота_картки: Math.round(rc(c).height),
      опис: d ? d.textContent.trim().slice(0, 30) : '(немає)',
    };
  });
});
console.log('\n### ЗАГОЛОВКИ КАРТОК');
console.table(rows);

await p.evaluate(() => document.querySelector('#board-content .bd-ad')?.click());
await p.waitForTimeout(700);
const safety = await p.evaluate(() => {
  const s = document.querySelector('.cm-ad-safety');
  if (!s) return null;
  const rc = e => e.getBoundingClientRect();
  const ic = s.querySelector('.cm-ad-safety-ic');
  const txt = s.querySelector('.cm-ad-safety-text');
  const lh = parseFloat(getComputedStyle(txt).lineHeight) || 1;
  return { висота_блока: Math.round(rc(s).height), іконка: Math.round(rc(ic).width),
           рядків_тексту: Math.round((rc(txt).height) / lh), символів: txt.textContent.trim().replace(/\s+/g, ' ').length };
});
console.log('\n### БЛОК БЕЗПЕКИ:', JSON.stringify(safety));
// КОНТРОЛЬ: повертаємо СТАРИЙ вигляд і СТАРИЙ текст — інакше «стало 115px» ні про що
// не говорить. Порівнювати треба з числом, а не зі спогадом.
const old = await p.evaluate(() => {
  const s = document.querySelector('.cm-ad-safety');
  const txt = s.querySelector('.cm-ad-safety-text');
  s.style.cssText = 'display:flex;align-items:flex-start;gap:12px;margin-top:28px;padding:14px;border-radius:14px;border:0;background:rgba(114,47,55,0.06)';
  s.querySelector('.cm-ad-safety-ic').style.cssText = 'flex:none;width:24px;height:24px;color:#722F37';
  txt.style.cssText = 'font-size:13px;line-height:1.45;color:#5A5A5A';
  const b = document.createElement('b');
  b.style.cssText = 'display:block;font-size:14px;color:#111;margin-bottom:2px';
  b.textContent = 'Будьте обережні!';
  txt.textContent = ' Не переходьте за сторонніми посиланнями та не здійснюйте передоплату.';
  txt.prepend(b);
  const lh = parseFloat(getComputedStyle(txt).lineHeight) || 1;
  return { висота_блока: Math.round(s.getBoundingClientRect().height),
           рядків_тексту: Math.round(txt.getBoundingClientRect().height / lh),
           символів: txt.textContent.trim().replace(/\s+/g, ' ').length };
});
console.log('### БУЛО (контроль):', JSON.stringify(old));
await p.screenshot({ path: '/tmp/board-title-after.png' });
await b.close(); stop();
