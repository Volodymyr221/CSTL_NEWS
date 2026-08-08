// Стенд №52: ВІДЖЕТ ПОГОДИ НА ГОЛОВНІЙ — ЩО ЛЮДИНА СПРАВДІ БАЧИТЬ.
//
// 🔴 ЗАРАДИ ЧОГО ВІН ІСНУЄ. 08.08 Вова попросив «вмістити ще іконку загальної
// погоди» в маленькі картки семиденного ряду. Виявилось, що іконки там були **весь
// час** — 7 штук у розмітці — але розміром **0×0 px**, тобто їх фізично не було
// видно. Причина: це `<img>`, а правило `width: 1em` існувало лише для трьох інших
// поверхонь, і `.hm-wx-icon` до переліку не входив. `font-size: 15px`, що стояв на
// контейнері, для `<img>` не означає нічого.
//
// 🔑 ЧОМУ ЦЕ КЛАС «ТИХИХ» ДЕФЕКТІВ: нічого не падає, консоль чиста, розмітка
// правильна, `querySelector` знаходить елемент. Перевірка «іконка є в DOM» була б
// ЗЕЛЕНОЮ весь час. Єдиний спосіб побачити — зміряти те, що намальовано.
// ➡️ Тому тут скрізь міряються ПІКСЕЛІ, а не наявність вузлів.
//
// ⚠️ Погоду підміняємо власною відповіддю: справжній Open-Meteo у пісочниці
// недосяжний, а без даних віджет малює стан помилки й міряти нема чого.
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const REV = process.env.BUNDLE_REV || '';

const ряд = (n, v) => Array.from({ length: n }, (_, i) => v(i));
const ПОГОДА = {
  current: { temperature_2m: 23.4, apparent_temperature: 21.2, weather_code: 2 },
  daily: {
    time: ряд(7, i => new Date(Date.now() + i * 864e5).toISOString().slice(0, 10)),
    // Навмисно РІЗНІ коди: ясно, дощ, хмарно, сніг, гроза, туман — щоб перевірка
    // не пройшла випадково на одній-єдиній іконці, яка могла б бути винятком.
    weather_code: [2, 61, 0, 3, 71, 95, 45],
    temperature_2m_max: ряд(7, i => 24 - i),
    temperature_2m_min: ряд(7, i => 14 - i),
  },
  hourly: {
    time: ряд(24, i => new Date(Date.now() + i * 36e5).toISOString().slice(0, 13) + ':00',),
    temperature_2m: ряд(24, () => 20),
    precipitation_probability: ряд(24, () => 10),
    weather_code: ряд(24, () => 2),
  },
};

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  serviceWorkers: 'block',
});
const p = await ctx.newPage();

await mockSupabase(p, { posts: [], threads: [], messages: [], thread_user_state: [], announcements: [] });
await p.route('**://api.open-meteo.com/**', r =>
  r.fulfill({ contentType: 'application/json', body: JSON.stringify(ПОГОДА) }));
if (REV) {
  const body = projectFile('bundle.js', REV);
  await p.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body }));
}

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2200);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(2500);

const s = await p.evaluate(() => {
  const кор = document.querySelector('.hm-wx');
  const іконки = [...document.querySelectorAll('.hm-wx-icon img')].map(e => {
    const r = e.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), top: r.top, bottom: r.bottom };
  });
  const рамка = кор ? кор.getBoundingClientRect() : null;
  const px = (sel, prop) => {
    const e = document.querySelector(sel);
    return e ? parseFloat(getComputedStyle(e)[prop]) : 0;
  };
  const місце = document.querySelector('.hm-wx-place-n');
  return {
    дні: [...document.querySelectorAll('.hm-wx-wd')].map(e => e.textContent.trim()),
    іконки,
    усіВМежах: !!рамка && іконки.every(i => i.top >= рамка.top - 1 && i.bottom <= рамка.bottom + 1),
    описPx: px('.hm-wx-desc', 'fontSize'),
    підPx: px('.hm-wx-sub', 'fontSize'),
    опис: document.querySelector('.hm-wx-desc')?.textContent.trim() || '',
    підРядок: document.querySelector('.hm-wx-sub')?.textContent.trim() || '',
    капс: місце ? getComputedStyle(місце).textTransform : '',
    місцеТекст: місце ? місце.textContent.trim() : '',
    // 🔴 ОБРІЗКА МІРЯЄТЬСЯ scrollWidth vs clientWidth, А НЕ ШИРИНАМИ ЕЛЕМЕНТІВ.
    // Перша версія порівнювала ширину `.hm-wx-desc` із шириною батька `.hm-wx-txt` —
    // і це ТАВТОЛОГІЯ: опис це блок усередині батька, його ширина дорівнює
    // батьківській за визначенням. Перевірка давала «143px у 143px» і «138px у
    // 138px», тобто не могла впасти ніколи, хоч би який кегль ми поставили.
    // Справжнє питання інше: чи текст ШИРШИЙ за коробку, в якій його показують.
    описПрирода: document.querySelector('.hm-wx-desc')?.scrollWidth || 0,
    описКоробка: document.querySelector('.hm-wx-desc')?.clientWidth || 0,
    // 🔑 ЗАПАС ШУКАЄМО В РЯДКУ, А НЕ В КОРОБЦІ ТЕКСТУ. Коробка опису стискається
    // під свій текст, тож усередині неї «запасу» не буває ніколи — і перевірка на
    // нього була б третьою брехливою поспіль у цьому файлі. Обрізка настане тоді,
    // коли РЯДОК (градуси + текст + капсула місця) перестане вміщатись, і flex
    // почне стискати саме текст. Отже міряємо вільне місце в рядку.
    вільнеВРядку: (() => {
      const row = document.querySelector('.hm-wx-main');
      if (!row) return 0;
      const діти = [...row.children];
      const зайнято = діти.reduce((n, e) => n + e.getBoundingClientRect().width, 0);
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      return Math.round(row.clientWidth - зайнято - gap * (діти.length - 1));
    })(),
    висота: рамка ? Math.round(рамка.height) : 0,
  };
});

// ── СЦЕНА ───────────────────────────────────────────────────────────────────
ok('сцена: віджет погоди намальовано', s.дні.length === 7, `днів: ${s.дні.length}`);

// ── 1. ІКОНКИ ДНІВ СПРАВДІ ВИДНО ────────────────────────────────────────────
// 🔴 Головна перевірка файлу. Саме тут був дефект: вузли є, пікселів нема.
const найменша = Math.min(...s.іконки.map(i => Math.min(i.w, i.h)));
ok('🔴 іконка є в КОЖНІЙ картці дня', s.іконки.length === 7, `${s.іконки.length} з 7`);
ok('🔴 іконки мають НЕНУЛЬОВИЙ розмір (не «є в DOM», а видно)',
   найменша >= 10, `найменша сторона: ${найменша}px`);
ok('іконки не вилазять за межі віджета', s.усіВМежах);

// ── 2. ПІДПИСИ ДНІВ ОДНАКОВІ ────────────────────────────────────────────────
// Було «Сьог» серед «Нд · Пн · Вт» — обрубок, що читався як обрізаний текст.
ok('🔴 усі підписи днів однієї форми (двобуквені), без обрубків',
   s.дні.every(d => /^[А-ЯІЇЄҐ][а-яіїєґ]$/.test(d)), s.дні.join(' · '));

// ── 3. РОЗМІРИ ТЕКСТУ ───────────────────────────────────────────────────────
// Замовлення «трішки рівномірно збільшити». Міряємо і величини, і те, що
// ІЄРАРХІЯ збереглась: опис лишається більшим за уточнення.
ok('опис погоди підріс до 14.5px', s.описPx >= 14 && s.описPx <= 15, `${s.описPx}px`);
ok('рядок «відчувається» підріс до 13px', s.підPx >= 12.5 && s.підPx <= 13.5, `${s.підPx}px`);
ok('🔴 ієрархія збережена: опис БІЛЬШИЙ за уточнення', s.описPx > s.підPx,
   `${s.описPx} проти ${s.підPx}`);

// 🔑 Найдовший опис у словнику — «Мінлива хмарність». Після збільшення кегля він
// мусить лишитись ЦІЛИМ, інакше «трішки більше» перетворилось би на «з крапками».
// 🔑 Найдовший опис у словнику — «Мінлива хмарність». Після збільшення кегля він
// мусить лишитись ЦІЛИМ, інакше «трішки більше» перетворилось би на «з крапками».
// ⚠️ Запас рахуємо явно: на iPhone шрифт San Francisco трохи ширший за системний у
// пісочниці, тож нуль запасу тут = обрізка на живому телефоні.
ok('🔴 найдовший опис погоди не обрізається', s.описПрирода <= s.описКоробка,
   `тексту ${s.описПрирода}px, коробка ${s.описКоробка}px`);
ok('🔴 у рядку лишається запас на ширший шрифт iPhone (≥8px)',
   s.вільнеВРядку >= 8, `вільного місця: ${s.вільнеВРядку}px`);

// ── 4. НАСЕЛЕНИЙ ПУНКТ ВЕЛИКИМИ ─────────────────────────────────────────────
ok('🔴 назва населеного пункту капсом', s.капс === 'uppercase', s.капс || '(не задано)');
ok('назва не порожня', s.місцеТекст.length > 0, s.місцеТекст);

// ── 5. ВІДЖЕТ НЕ РОЗДУВСЯ ───────────────────────────────────────────────────
// Вова: «тільки щоб не сильно його розширювати». Стеля з запасом: до фіксу було
// 118px, після — 121px. Поріг 140 ловить справжнє роздування, а не 3px.
ok('віджет не роздувся (≤140px)', s.висота > 0 && s.висота <= 140, `${s.висота}px`);

await ctx.close(); await b.close(); await stop();
done();
