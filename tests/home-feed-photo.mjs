// Стенд: ЗНІМОК У ВІДЖЕТІ СТРІЧКИ НЕ ЗУМИТЬСЯ ПІД ЧУЖУ ФОРМУ.
//
// 🔴 ЗАРАДИ ЧОГО (02.09.2026). 🗣️ Вова: «в блоці у стрічці громади фотографія
// така ніби зазумлена… якщо вертикально фотографія менша, ніж місце для
// фотографій — показується повна фотографія. Якщо більше — картка стримує
// висоту». І окремо, прямою умовою: **віджет при цьому НЕ росте**.
//
// 📐 ЩО БУЛО ЗАМІРЯНО ПЕРЕД ПРАВКОЮ (екран 390×844). Знімок стояв `flex: 1 1 auto`
// без пропорції, тобто забирав увесь залишок висоти, а `object-fit: cover` доганяв
// форму обрізкою. Рамка виходила 288×284 — майже КВАДРАТ. Широкий кадр 3:2 було
// видно лише на **68%**: третину зрізало з боків. Це і є «зазумленість».
//
// 🛑 ЧОМУ ЦЕЙ СТЕНД МІРЯЄ ВИСОТУ РАМКИ, А НЕ НАЯВНІСТЬ `aspect-ratio` У СТИЛЯХ.
// Перевірка «у CSS є `aspect-ratio: var(--hm-fd-ar)`» зеленіла б і тоді, коли
// змінну ніхто не пише, — тобто на коді, де кадр так само зумиться. Тому тут
// піднімається живий застосунок, у нього кладуться знімки ТРЬОХ різних форм, і
// питання одне: чи дорівнює висота рамки рідній висоті кадру.
// ⚠️ Знімки віддаються ЧЕРЕЗ МЕРЕЖУ (як на телефоні), бо розмір файлу стає відомий
// лише на `load` — на миттєвому `data:` вада не відтворилась би.
import { chromium } from 'playwright';
import { chromiumPath, serve } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';
import { reporter } from './_lib.mjs';

const { ok, done } = reporter();
const хв = n => new Date(Date.now() - n * 60000).toISOString();

// Одна спільнота = один слайд. Форм три, тож і спільнот три.
const ФОРМИ = [
  { k: 'wide', розмір: [1200, 800],  назва: '3:2 широке' },   // рідна висота 192 < місця
  { k: 'low',  розмір: [900, 1100],  назва: '4:5 невисоке' }, // 352 > місця → стримує
  { k: 'tall', розмір: [900, 1600],  назва: '9:16 високе' },  // 512 > місця → стримує
];
const PAGES = ФОРМИ.map((f, i) => ({ id: i + 1, name: 'Спільнота ' + (i + 1), sort_order: i, avatar_url: null, is_system: false }));

// Підпис навмисно ДОВГИЙ: саме він забирає місце в знімка, тож короткий текст
// сховав би різницю між формами.
const ДОВГИЙ = 'Замок Радзивіллів — перлина Волині та один із найдавніших бастіонних замків '
  + 'України. Його мури памʼятають князів, війни, розквіт і непрості сторінки історії. '
  + 'Сьогодні він оживає: сюди приїздять туристи, проходять екскурсії та фестивалі просто неба. '
  + 'Приходьте родинами — у нас є що показати кожному, хто цікавиться історією рідного краю.';

const POSTS = ФОРМИ.map((f, i) => ({
  id: i + 1, page_id: i + 1, text: ДОВГИЙ, created_at: хв(i + 1), status: 'published',
  image_url: `/__${f.k}.png`, image_urls: [`/__${f.k}.png`], author_uid: 'u1', show_author: true,
  pages: { name: 'Спільнота ' + (i + 1), avatar_url: null },
}));

const { url, stop } = await serve();
const ep = chromiumPath();
const b = await chromium.launch({ ...(ep ? { executablePath: ep } : {}) });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();

await mockSupabase(p, { pages: PAGES, page_posts: POSTS });
for (const f of ФОРМИ) {
  const [w, h] = f.розмір;
  await p.route(`**/__${f.k}.png`, r => r.fulfill({ contentType: 'image/svg+xml',
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#4a3138"/></svg>` }));
}
// Погода й геокодер — швидкі заглушки, інакше стенд платить 4с фолбеку щопрогону.
await p.route('**://nominatim.openstreetmap.org/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ address: { village: 'Олика' } }) }));
await p.route('**://api.open-meteo.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({
  utc_offset_seconds: 10800, current: { temperature_2m: 18, weather_code: 3, apparent_temperature: 17 },
  hourly: { time: [], temperature_2m: [], precipitation_probability: [], weather_code: [] },
  daily: { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [] } }) }));

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);
await p.evaluate(() => document.querySelector('.consent-ok, [data-consent-ok], .pwa-cta button')?.click());
await p.evaluate(() => window.switchTab && window.switchTab('community'));
await p.waitForTimeout(4000);

const зріз = await p.evaluate(() => {
  const track = document.querySelector('.hm-fd-track');
  if (!track) return null;
  return {
    доріжка: track.getBoundingClientRect().height,
    картки: [...track.querySelectorAll('.hm-fd-slide')].map(s => {
      const box = s.querySelector('.hm-fd-p-img');
      const img = box && box.querySelector('img');
      const txt = s.querySelector('.hm-fd-p-txt');
      const post = s.querySelector('.hm-fd-post');
      if (!img || !img.naturalWidth) return null;
      const r = box.getBoundingClientRect();
      const рідна = img.naturalWidth / img.naturalHeight;
      const cs = txt ? getComputedStyle(txt) : null;
      return {
        файл: `${img.naturalWidth}×${img.naturalHeight}`,
        ширинаРамки: r.width,
        висотаРамки: r.height,
        ріднаВисота: r.width / рідна,       // якою була б висота при рідній пропорції
        висотаКартки: post ? post.getBoundingClientRect().height : 0,
        рядків: cs ? parseInt(cs.webkitLineClamp, 10) || 0 : 0,
        висотаПідпису: txt ? txt.getBoundingClientRect().height : 0,
        рядок: cs ? parseFloat(cs.lineHeight) || 0 : 0,
      };
    }).filter(Boolean),
  };
});

if (!зріз || зріз.картки.length < 3) {
  ok('сцена зібралась (три картки зі знімками)', false, `карток: ${зріз ? зріз.картки.length : 'доріжки немає'}`);
  await b.close(); await stop(); done();
}

const [широке, невисоке, високе] = зріз.картки;
const ціле = к => Math.abs(к.ріднаВисота - к.висотаРамки) <= 1;

// ── 1. ГОЛОВНЕ: широкий кадр показується ЦІЛИМ ───────────────────────────────
ok('🔴 широкий кадр (3:2) показується ЦІЛИМ — рамка дорівнює рідній висоті',
   ціле(широке),
   `рамка ${Math.round(широке.ширинаРамки)}×${Math.round(широке.висотаРамки)}, рідна висота ${Math.round(широке.ріднаВисота)}`);

// 📐 Число з заміру ПЕРЕД правкою: рамка була 288×216 при рідній 192, тобто кадр
// розтягувало на 24px і зрізало з боків. Тут стережемо саме це.
ok('…і рамка більше не вища за кадр (та сама вада, лише з іншого боку)',
   широке.висотаРамки <= широке.ріднаВисота + 1,
   `${Math.round(широке.висотаРамки)} проти ${Math.round(широке.ріднаВисота)}`);

// ── 2. КОНТРОЛЬ: високий кадр картка СТРИМУЄ ─────────────────────────────────
// 🔑 Без цієї перевірки «показуємо все рідним розміром» теж зійшло б за успіх —
// і 9:16 розпер би картку на 512px, тобто зламав би пряму умову Вови.
ok('🔴 КОНТРОЛЬ: високий кадр (9:16) картка СТРИМУЄ, а не показує цілим',
   !ціле(високе) && високе.висотаРамки < високе.ріднаВисота,
   `рамка ${Math.round(високе.висотаРамки)} проти рідних ${Math.round(високе.ріднаВисота)}`);
ok('невисокий вертикальний (4:5) теж стримується — місця під нього немає',
   !ціле(невисоке),
   `рамка ${Math.round(невисоке.висотаРамки)} проти рідних ${Math.round(невисоке.ріднаВисота)}`);

// ── 3. ВІДЖЕТ НЕ ВИРІС — пряма умова Вови ────────────────────────────────────
ok('🔴 доріжка лишилась 400px (віджет не росте — умова Вови)',
   Math.round(зріз.доріжка) === 400, `${Math.round(зріз.доріжка)}px`);
ok('усі картки однакової висоти — доріжка не стала рваною',
   зріз.картки.every(к => Math.abs(к.висотаКартки - зріз.картки[0].висотаКартки) <= 1),
   зріз.картки.map(к => Math.round(к.висотаКартки)).join(' · '));

// ── 4. ВИВІЛЬНЕНЕ МІСЦЕ ПІШЛО ПІДПИСУ, А НЕ В ПОРОЖНЕЧУ ──────────────────────
// 🗣️ Вибір Вови 02.09 з трьох варіантів: «віддати підпису».
ok('🔴 під широким кадром підпис отримав БІЛЬШЕ рядків, ніж базові 4',
   широке.рядків > 4, `${широке.рядків} рядків`);
// 🔑 КОНТРОЛЬ: якщо місця не звільнилось, рядків має лишитись рівно 4 — інакше
// стенд зеленів би на коді, що просто завжди роздуває підпис.
ok('КОНТРОЛЬ: під високим кадром рядків рівно 4 (місця не звільнилось)',
   високе.рядків === 4, `${високе.рядків} рядків`);

// ── 5. ВАДА 28.08 НЕ ПОВЕРНУЛАСЬ: текст не ріжеться посеред літери ───────────
// 🛑 Тоді у flex-колонці підпис стискався нижче за свої рядки, і на екрані було
// видно верхні половинки літер. Ознака здоровʼя — висота підпису кратна рядку.
for (const [ім, к] of [['широкою', широке], ['високою', високе]]) {
  const рядківФакт = к.рядок ? к.висотаПідпису / к.рядок : 0;
  ok(`підпис під ${ім} карткою не розрізаний посеред літери`,
     Math.abs(рядківФакт - Math.round(рядківФакт)) < 0.12 && рядківФакт <= к.рядків + 0.12,
     `${Math.round(к.висотаПідпису)}px = ${рядківФакт.toFixed(2)} рядка при стелі ${к.рядків}`);
}

await b.close(); await stop();
done();
