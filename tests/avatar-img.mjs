// tests/avatar-img.mjs — ФОТО В АВАТАРІ НЕ РОЗЛІТАЄТЬСЯ НА ВЕСЬ ЕКРАН.
//
// 🔴 БАГ, ЗНАЙДЕНИЙ ВОВОЮ НА ПРОДІ 11.08 (знімок з iPhone, v4224): у списку
// «Питання» фото профілю замість кружечка 24px малювалось прямокутником на пів
// екрана і накривало сусідні картки.
//
// 🔑 КОРІНЬ — не в новій вкладці. `avatarCircle()` (core/utils.js) з фото віддає
//     <span class="bd-avatar bd-avatar--img"><img src="…"></span>
// а в стилях зони Дошки/Питань для `.bd-avatar--img` і для вкладеного `<img>`
// НЕ БУЛО ЖОДНОГО ПРАВИЛА. У приватного чату вони є (`.pm-avatar--img` у
// `style/messages.css`: `overflow: hidden` + `img { width/height 100%,
// object-fit: cover }`) — і саме тому там усе було гаразд, а тут ні.
// Тобто `<img>` виводився у ВЛАСНОМУ розмірі файлу.
//
// ⚠️ Чому не спливло раніше: у старій картці чату аватара в СПИСКУ не було
// взагалі (стояв текст «Автор: Іван»). Аватар жив лише всередині розмови. Нова
// картка питання показує його в списку — і давній пропуск у стилях став видимим.
// Тобто зміна не створила баг, а ВИТЯГЛА його; правило потрібне зоні цілком.
//
// 🔬 ЩО МІРЯЄМО: не наявність CSS-правила, а РЕАЛЬНИЙ розмір намальованого фото.
// Правило можна написати і все одно отримати розліт (напр. якщо забути
// `overflow: hidden` у батька), тому критерій — геометрія на екрані.
//
// 🔴 КОНТРОЛЬ: `CSS_REV=<до фікса>` — стенд МУСИТЬ упасти.
//     CSS_REV=e6eb2f0b node tests/avatar-img.mjs

import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const CSS_REV = process.env.CSS_REV || '';

// Фото 400×300 — НАВМИСНО не квадратне і значно більше за кружечок: саме такий
// файл і розлітався. Data-URI, щоб стенд не залежав від мережі.
const PHOTO = 'data:image/svg+xml;base64,' + Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#8a5"/></svg>`
).toString('base64');

const t0 = Date.now() - 3 * 864e5;
const POSTS = [{
  id: 801, type: 'chat', text: 'Коли буде концерт на День міста?', author: 'Володимир',
  owner_uid: 'u-vova', status: 'published', tags: [], ts: t0,
  created_at: new Date(t0).toISOString(), published_at: new Date(t0).toISOString(),
}];
const COMMENTS = [{
  id: 9001, post_id: 801, author: 'Володимир', text: 'Начебто 24 серпня.',
  sender_uid: 'u-vova', reply_to_id: null, created_at: new Date(t0 + 36e5).toISOString(),
  edited_at: null, deleted_at: null, client_tag: null,
}];

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
if (CSS_REV) {
  const old = projectFile('style/board.css', CSS_REV);
  await p.route('**/style/board.css', r => r.fulfill({ contentType: 'text/css', body: old }));
}
await mockSupabase(p, { posts: POSTS, comments: COMMENTS, announcements: [] },
                  { user: { id: 'u-me', name: 'Я' },
                    profiles: [{ uid: 'u-vova', name: 'Володимир', avatar_url: PHOTO }] });
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(300);
await p.evaluate(() => window.switchTab && window.switchTab('discussions'));
await p.waitForTimeout(2200);   // гідрація фото приходить окремим запитом

// ⚠️ 11.08, РЕДАКЦІЯ 3 — МІРЯЄМО НА ЕКРАНІ ПИТАННЯ, А НЕ В КАРТЦІ СПИСКУ.
// У списку аватара більше НЕМА: щільний рядок обходиться імʼям, бо кружечок на
// кожному рядку додавав ваги і повертав «плитковість», від якої відходили.
// Захист від бага це не послаблює: правило `.bd-avatar img` спільне для всієї
// зони, і фото на екрані питання лізе з того самого `avatarCircle()`.
// 🔑 Стенд тримається за ПОВЕДІНКУ («фото не більше за свій кружечок»), а не за
// місце, де кружечок намальовано — саме тому переїзд його не вбив, а лише
// перенацілив. Порівняй із `tab-dots.mjs`, який тримався за рядок коду й помер.
await p.evaluate(() => document.querySelector('[data-question-open="801"]')?.click());
await p.waitForTimeout(1600);

const карткаAvatar = await p.evaluate(() => {
  const av = document.querySelector('.qa-screen .qa-question-by .bd-avatar');
  if (!av) return null;
  const img = av.querySelector('img');
  const rk = av.getBoundingClientRect();
  const ri = img ? img.getBoundingClientRect() : null;
  return {
    фотоЄ: !!img,
    кружечок: { w: Math.round(rk.width), h: Math.round(rk.height) },
    фото: ri ? { w: Math.round(ri.width), h: Math.round(ri.height) } : null,
    overflow: getComputedStyle(av).overflow,
    радіус: getComputedStyle(av).borderRadius,
    fit: img ? getComputedStyle(img).objectFit : null,
  };
});

ok('1. фото профілю справді підтягнулось (інакше нема чого міряти)',
   !!карткаAvatar && карткаAvatar.фотоЄ,
   карткаAvatar ? `кружечок ${карткаAvatar.кружечок.w}×${карткаAvatar.кружечок.h}` : 'аватара немає');

// 🔴 ГОЛОВНА ПЕРЕВІРКА. На знімку Вови фото було ~355px завширшки при кружечку 24px.
ok('2. 🔴 фото НЕ більше за свій кружечок (баг: розліталось на пів екрана)',
   !!карткаAvatar?.фото &&
   карткаAvatar.фото.w <= карткаAvatar.кружечок.w + 1 &&
   карткаAvatar.фото.h <= карткаAvatar.кружечок.h + 1,
   карткаAvatar?.фото
     ? `фото ${карткаAvatar.фото.w}×${карткаAvatar.фото.h} у кружечку ${карткаAvatar.кружечок.w}×${карткаAvatar.кружечок.h}`
     : '—');

ok('3. кружечок обрізає вміст (overflow: hidden) — без цього кути фото вилазять',
   карткаAvatar?.overflow === 'hidden', карткаAvatar?.overflow || '—');

ok('4. фото кадрується, а не сплющується (object-fit: cover)',
   карткаAvatar?.fit === 'cover', карткаAvatar?.fit || '—');

ok('5. кружечок лишився круглим', /50%|9999px|999px/.test(карткаAvatar?.радіус || ''),
   карткаAvatar?.радіус || '—');

// ── Усі аватари відкритого питання: у них різні розміри (28px автор, 26px відповідь) ──
const екранAvatars = await p.evaluate(() => {
  const out = [];
  for (const av of document.querySelectorAll('.qa-screen .bd-avatar')) {
    const img = av.querySelector('img');
    if (!img) continue;
    const rk = av.getBoundingClientRect(), ri = img.getBoundingClientRect();
    out.push({ де: av.parentElement.className.split(' ')[0],
               ok: ri.width <= rk.width + 1 && ri.height <= rk.height + 1,
               фото: `${Math.round(ri.width)}×${Math.round(ri.height)}`,
               кружечок: `${Math.round(rk.width)}×${Math.round(rk.height)}` });
  }
  return out;
});
ok('6. 🔴 на екрані питання фото теж у межах кружечків',
   екранAvatars.length > 0 && екранAvatars.every(a => a.ok),
   екранAvatars.length ? екранAvatars.map(a => `${a.де}: ${a.фото} у ${a.кружечок}`).join(' · ')
                       : 'фото на екрані питання не знайдено');

await stop();
await b.close();
done();
