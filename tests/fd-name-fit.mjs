// Стенд: НАЗВА СПІЛЬНОТИ НЕ РВЕТЬСЯ ПОСЕРЕД СЛОВА — НІ В СПОКОЇ, НІ АКТИВНА.
//
// 🗣️ Скарга Вови (31.08, три знімки): «коли спільнота виділяється, переноситься одна
// буква — ТУРИСТИЧН / А ОЛИКА»; «Олицька міська рада» наведена ставала трьома
// рядками з трьома крапками. Дослівно: «щоб воно так, як пише, так і було».
//
// 🔴 ДВІ ПРИЧИНИ, І ДРУГА НЕ ПРО АКТИВНИЙ СТАН.
//   1. Активна назва жирнішала (500 → 700), а жирні літери ширші на ≈9%.
//      Заміряно: «Туристична» 58.2px → 63.4px при колонці 61px.
//   2. Ряд це grid `1fr` — КОЛОНКА ЗВУЖУЄТЬСЯ З КОЖНОЮ СПІЛЬНОТОЮ:
//      5 кружечків → 61px, 6 → **50px**. При шести рвалося вже три назви, і
//      жирність тут ні до чого. `MAX_CIRCLES = 6`, тобто шоста можлива сьогодні.
//
// ➡️ Тому цей стенд ганяє сцену на ШЕСТИ спільнотах: на пʼяти вада другого роду
// не відтворюється взагалі, і перевірка світилась би зеленою над нею.
//
// Запуск: node tests/fd-name-fit.mjs

import { chromium } from 'playwright';
import { chromiumPath, serve, reporter } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();

const PAGES = [
  { id: 1, name: 'КЦ «Центр культури»',  sort_order: 0, avatar_url: null, is_system: false },
  { id: 2, name: 'Історія громади',      sort_order: 1, avatar_url: null, is_system: false },
  { id: 3, name: 'Олицька міська рада',  sort_order: 2, avatar_url: null, is_system: false },
  { id: 4, name: 'Olyka Castle',         sort_order: 3, avatar_url: null, is_system: false },
  { id: 5, name: 'Туристична Олика',     sort_order: 4, avatar_url: null, is_system: false },
  // 🔑 Шоста — саме вона звужує колонку до 50px і відтворює другу причину.
  { id: 6, name: 'Молодіжна рада',       sort_order: 5, avatar_url: null, is_system: false },
];
// `fetchLatestPostPerPage` фільтрує за `status` і `deleted_at` — без них віджет порожній.
const POSTS = PAGES.map((pg, i) => ({
  id: 100 + i, page_id: pg.id, text: `Допис ${pg.name}`, photos: [], author_uid: 'u1',
  show_author: false, status: 'published', deleted_at: null,
  created_at: new Date(Date.now() - i * 3600e3).toISOString(),
}));

const { url, stop } = await serve();
const ep = chromiumPath();
const b = await chromium.launch({ ...(ep ? { executablePath: ep } : {}) });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
await mockSupabase(p, { pages: PAGES, page_posts: POSTS });
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);
await p.evaluate(() => document.querySelector('.consent-ok, [data-consent-ok], .pwa-cta button')?.click());
await p.evaluate(() => window.switchTab && window.switchTab('community'));
await p.waitForTimeout(3000);

const дані = await p.evaluate(() => {
  const кола = [...document.querySelectorAll('.hm-fd-c')];
  if (!кола.length) return null;
  // 🔴 ВИМИКАЄМО АНІМАЦІЮ НА ЧАС ВИМІРУ. Масштаб активної назви їде 400ms, і
  // перша редакція міряла ОДРАЗУ після додавання класу — виходив приріст ×1,
  // тобто стенд «доводив», що виділення немає, над цілком робочим кодом.
  кола.forEach(c => { c.querySelector('.hm-fd-c-name').style.transition = 'none'; });
  // 🔑 Міряємо ШИРИНУ СЛОВА, а не висоту тексту. Висота марна: `-webkit-line-clamp: 2`
  // уже обрізав, тож вона ЗАВЖДИ дорівнює двом рядкам і ваду приховує. Рве рядок
  // саме `overflow-wrap: anywhere`, коли слово ширше за колонку.
  const міра = (c) => {
    const n = c.querySelector('.hm-fd-c-name');
    const cs = getComputedStyle(n);
    const cv = document.createElement('canvas').getContext('2d');
    cv.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const слова = n.textContent.trim().split(/\s+/).filter(Boolean);
    const найдовше = Math.max(...слова.map(w => cv.measureText(w).width));
    return { назва: n.textContent.trim(), колонка: n.clientWidth,
             кегль: parseFloat(cs.fontSize), вага: cs.fontWeight,
             слово: +найдовше.toFixed(1), рветься: найдовше > n.clientWidth };
  };
  кола.forEach(c => c.classList.remove('hm-fd-c--on'));
  const спокій = кола.map(міра);
  кола.forEach(c => c.classList.add('hm-fd-c--on'));
  const активні = кола.map(міра);
  кола.forEach(c => c.classList.remove('hm-fd-c--on'));

  // 🔴 ВИДІЛЕННЯ І НАКЛАДАННЯ — обидві вимоги Вови разом, і вони тягнуть у різні боки.
  // «Приближалась» вимагає масштабу; «без накладання один на одного» його обмежує.
  // Активуємо кожен кружечок по черзі й міряємо НАМАЛЬОВАНІ прямокутники сусідів.
  let мінЗазор = Infinity, приріст = 0;
  for (let i = 0; i < кола.length; i++) {
    кола.forEach(c => c.classList.remove('hm-fd-c--on'));
    const до = кола[i].querySelector('.hm-fd-c-name').getBoundingClientRect().width;
    кола[i].classList.add('hm-fd-c--on');
    const після = кола[i].querySelector('.hm-fd-c-name').getBoundingClientRect().width;
    if (до > 0) приріст = Math.max(приріст, після / до);
    const r = кола.map(c => c.querySelector('.hm-fd-c-name').getBoundingClientRect());
    for (let j = 0; j < r.length - 1; j++) мінЗазор = Math.min(мінЗазор, r[j + 1].left - r[j].right);
  }
  кола.forEach(c => c.classList.remove('hm-fd-c--on'));
  return { спокій, активні, мінЗазор: +мінЗазор.toFixed(2), приріст: +приріст.toFixed(3) };
});

if (!дані) {
  ok('ПРИЛАД: віджет Стрічки піднявся', false, 'кружечків на сцені немає');
} else {
  // ── 0. ПРИЛАД ──────────────────────────────────────────────────────────────
  // Без цієї перевірки будь-яке «нічого не рветься» нижче могло б означати просто
  // порожню сцену. Шість — бо саме шоста звужує колонку.
  ok('ПРИЛАД: на сцені шість кружечків (колонка звужена)', дані.спокій.length === 6,
     `${дані.спокій.length} · колонка ${дані.спокій[0]?.колонка}px`);

  // ── 1. ГОЛОВНЕ: ЖОДНЕ СЛОВО НЕ ШИРШЕ ЗА КОЛОНКУ ───────────────────────────
  const рветьсяСпокій = дані.спокій.filter(x => x.рветься);
  const рветьсяАктив  = дані.активні.filter(x => x.рветься);
  ok('у спокої жодна назва не рветься посеред слова', рветьсяСпокій.length === 0,
     рветьсяСпокій.map(x => `${x.назва}: ${x.слово}px > ${x.колонка}px`).join(' · ') || 'усі влазять');
  ok('🔴 АКТИВНА назва теж не рветься (скарга Вови)', рветьсяАктив.length === 0,
     рветьсяАктив.map(x => `${x.назва}: ${x.слово}px > ${x.колонка}px`).join(' · ') || 'усі влазять');

  // ── 2. КОРІНЬ ПЕРШОЇ ПРИЧИНИ: ВАГА НЕ МІНЯЄТЬСЯ ───────────────────────────
  // 🛑 Саме звідси бралася вада. Якщо хтось поверне `font-weight` в активний стан,
  // ширина літер зміниться — і перенос поїде знову.
  const вагаОднакова = дані.спокій.every((s, i) => s.вага === дані.активні[i].вага);
  ok('вага шрифту ОДНАКОВА в обох станах (інакше перенос поїде)', вагаОднакова,
     `спокій ${дані.спокій[0]?.вага} · активна ${дані.активні[0]?.вага}`);

  // ── 3. РОЗКЛАДКА НЕ СТРИБАЄ ПРИ АКТИВАЦІЇ ─────────────────────────────────
  const кегльОднаковий = дані.спокій.every((s, i) => Math.abs(s.кегль - дані.активні[i].кегль) < 0.01);
  ok('кегль не змінюється при активації', кегльОднаковий,
     `${дані.спокій[0]?.кегль}px → ${дані.активні[0]?.кегль}px`);

  // ── 4. АВТОПІДБІР СПРАЦЮВАВ, АЛЕ НЕ ЗАНАДТО ───────────────────────────────
  // ⚠️ Підлога 8px названа в `home-feed.js`: нижче напис не читається, і тоді
  // чесніший обрив, ніж нечитабельний рядок.
  const кегль = дані.спокій[0]?.кегль ?? 0;
  ok('кегль стиснуто, але не нижче підлоги 8px', кегль >= 8 && кегль <= 9.5, `${кегль}px`);

  // 🔑 Один кегль на весь ряд: різні розміри в сусідніх колонках читаються як
  // недогляд верстки, однаковий дрібніший — як свідомий масштаб.
  const усіОднакові = new Set(дані.спокій.map(x => x.кегль)).size === 1;
  ok('усі назви ряду мають ОДИН кегль', усіОднакові,
     [...new Set(дані.спокій.map(x => x.кегль))].join(', ') + 'px');

  // ── 5. НАЗВА ВСЕ Ж ВИДІЛЯЄТЬСЯ (друга скарга Вови) ────────────────────────
  // 🗣️ «Погано, що сама назва не виділяється — можливо, приближалась».
  // Після першого фіксу напис перестав змінюватись зовсім, і це була ВТРАТА.
  // 🔑 Масштаб — єдиний спосіб, що не чіпає перенос: `transform` діє ПІСЛЯ розкладки.
  ok('🔴 активна назва ВІЗУАЛЬНО більша (інакше виділення немає)',
     дані.приріст > 1.02, `×${дані.приріст}`);

  // ── 6. І ПРИ ЦЬОМУ НЕ НАКРИВАЄ СУСІДНЮ ────────────────────────────────────
  // 🛑 Пряма вимога Вови: «без накладання один на одного». Між колонками
  // `gap` = 4px, тож масштаб обмежений саме цим, а не смаком.
  ok('🛑 жодна назва не накриває сусідню в жодному стані',
     дані.мінЗазор >= 0, `найменший зазор ${дані.мінЗазор}px`);
}

await stop(); await b.close();
done();
