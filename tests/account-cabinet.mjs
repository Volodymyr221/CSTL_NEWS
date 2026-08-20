// tests/account-cabinet.mjs — КАБІНЕТ ЖИТЕЛЯ СТАНДАРТИЗОВАНИЙ.
//
// Скарга Вови 06.08 дослівно: «модалка персонального кабінету не стандартизована,
// вона то і бежевого кольору і не знаю чи шапка в кнопці закриття там
// стандартизовані». Заміряно і знайдено ЧОТИРИ розходження:
//
//   1. фон екрана     `--paper #F4F1E6`  — бежевий, залишок палітри v3;
//   2. hero           власний градієнт `#7a3540 → #5c252c` замість `--brand-grad`;
//   3. секції         `--card-cream #FAF8EF` — теплота R−B = +11 на прохолодному тлі;
//   4. кнопка «назад» текстовий гліф «←», тап-ціль ~32×24 при нормі Apple HIG 44.
//
// 🔑 ЧОМУ СИНТЕТИЧНА СЦЕНА, А НЕ ЖИВИЙ ЗАСТОСУНОК.
// Кабінет відкривається лише залогіненому, а стенди ходять по Дошці анонімно
// (`_board-fixture.mjs` віддає порожню сесію навмисно — перевіряється ПУБЛІЧНИЙ
// вигляд). Підробити сесію означало б перевіряти власну підробку.
// ⚠️ Ціна цього рішення відома: сцена може розійтись із реальною розміткою і
// сторож почне охороняти екран, якого немає. Саме так уже було з `board-header`
// (перевіряв клас, який ніхто не ставить). Тому НИЖЧЕ Є КОНТРОЛЬ: кожен клас
// сцени мусить реально зустрічатись у `src/core/account-ui.js`.

import { chromium } from 'playwright';
import { launch, projectFile, reporter, baseCss} from './_lib.mjs';

const { ok, done } = reporter();

const BASE = baseCss();
const ACC  = projectFile('style/account.css');
const JS   = projectFile('src/core/account-ui.js');

// Класи, які сцена вдає. Кожен перевіряється на існування в JS (контроль нижче).
const КЛАСИ = ['acc-cab', 'acc-cab-top', 'acc-cab-back', 'acc-cab-hero', 'acc-cab-sec'];

const SCENE = `
<div class="acc-cab open" data-t="фон екрана" data-el="фон екрана">
  <div class="acc-cab-top" data-grad="шапка">
    <button class="acc-cab-back" data-back>&lt;</button><b>Мій кабінет</b>
  </div>
  <div class="acc-cab-scroll">
    <div class="acc-cab-hero" data-grad="hero"></div>
    <div class="acc-cab-sec" data-t="секція" data-el="секція"><h3>Розділ</h3></div>
  </div>
</div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${BASE}
${ACC}
/* Сцена статична: анімацію в'їзду вимикаємо, інакше перший кадр міряв би
   позицію за екраном і всі геометричні числа поїхали б. */
.acc-cab { position: static !important; transform: none !important; transition: none !important; }
</style></head><body>${SCENE}</body></html>`;

const b = await launch(chromium);
const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
await pg.setContent(html);

// ── КОНТРОЛЬ ПЕРШИЙ: сцена описує РЕАЛЬНИЙ екран ────────────────────────────
// Без цього стенд міг би роками охороняти класи, які застосунок давно не малює.
const відсутні = КЛАСИ.filter(c => !JS.includes(`"${c}`) && !JS.includes(`'${c}`) && !JS.includes(`class="${c}`) && !JS.includes(`${c}"`) && !JS.includes(`${c} `));
ok('усі класи сцени справді малюються застосунком', відсутні.length === 0,
   відсутні.length ? `у account-ui.js немає: ${відсутні.join(', ')}` : КЛАСИ.join(' · '));

// ── 1. Теплота поверхонь ────────────────────────────────────────────────────
// Той самий критерій і той самий поріг, що в `board-cream.mjs`: R−B, межа 6 лежить
// у розриві між нейтралью (≤3) і найслабшим кремовим (`#FAF8EF` = 11).
// Міряємо ОБЧИСЛЕНИЙ колір, а не наявність слова в CSS — інакше сторож обійшов би
// будь-який новий теплий hex.
const WARM_LIMIT = 6;
const поверхні = await pg.$$eval('[data-t]', ns => ns.map(n => {
  const m = getComputedStyle(n).backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  const [r, g, bl] = m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
  return { role: n.dataset.t, hex: '#' + [r, g, bl].map(v => v.toString(16).padStart(2, '0').toUpperCase()).join(''), warmth: r - bl };
}));
for (const s of поверхні) {
  ok(`нейтрально: ${s.role}`, s.warmth <= WARM_LIMIT, `${s.hex} · теплота ${s.warmth}`);
}

// ── 2. ОДИН БОРДОВИЙ: шапка і hero беруть ТОЙ САМИЙ градієнт ────────────────
// 🔴 Це головна перевірка файлу — рівно та скарга, з якої все почалось.
// Порівнюємо обчислені `background-image` двох сусідніх блоків: якщо хтось знову
// впише «майже такий самий» власний градієнт, рядки розійдуться. Той самий клас
// помилки виправляли 05.08 на шапці Дошки (PR #807).
const град = await pg.$$eval('[data-grad]', ns => ns.map(n => ({
  role: n.dataset.grad, img: getComputedStyle(n).backgroundImage,
})));
const шапка = град.find(x => x.role === 'шапка'), hero = град.find(x => x.role === 'hero');
ok('hero і шапка кабінету — ОДИН бордовий, не два схожі',
   !!шапка && !!hero && шапка.img === hero.img && шапка.img !== 'none',
   шапка && hero ? (шапка.img === hero.img ? 'градієнт спільний' : `шапка ≠ hero`) : 'блоків немає');
// Той самий градієнт мусить бути саме БРЕНДОВИМ, а не спільною випадковістю.
const бренд = await pg.evaluate(() => {
  const d = document.createElement('div');
  d.style.backgroundImage = 'var(--brand-grad)';
  document.body.appendChild(d);
  const v = getComputedStyle(d).backgroundImage;
  d.remove();
  return v;
});
ok('і це саме --brand-grad, а не власний градієнт кабінету',
   hero && hero.img === бренд, hero ? hero.img.slice(0, 60) + '…' : 'hero немає');

// ── 3. Межа секції видима ───────────────────────────────────────────────────
// Біла картка на `--app-bg` дає лише 1.162:1 — площиною вона непомітна, помітність
// тримає ОБІДОК. Поріг 1.30 узято з `board-cream.mjs`: ловимо мертві межі, а не
// сперечаємось за десяті (мертва зона для орієнтиру — `--border #E5E5E5` = 1.007).
const межа = await pg.$eval('.acc-cab-sec', n => {
  const cs = getComputedStyle(n);
  const rgb = s => { const m = String(s).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
    if (!m) return null; return (m[4] !== undefined && +m[4] === 0) ? null : [+m[1], +m[2], +m[3]]; };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const cr = (x, y) => { const a = lum(x), b = lum(y); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  let base = [255, 255, 255];
  for (let p = n.parentElement; p; p = p.parentElement) { const c = rgb(getComputedStyle(p).backgroundColor); if (c) { base = c; break; } }
  const bc = rgb(cs.borderTopColor), bw = parseFloat(cs.borderTopWidth) || 0;
  return { є: bw > 0 && !!bc, контраст: bc ? +cr(bc, base).toFixed(3) : 0 };
});
ok('секція має видиму межу (інакше біле на світлому попливе)',
   межа.є && межа.контраст >= 1.30, `контраст ${межа.контраст}`);

// ── 4. Кнопка «назад» ───────────────────────────────────────────────────────
const назад = await pg.$eval('.acc-cab-back', n => {
  const r = n.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
});
// Знайдено власним аудитом: було ~32×24 у найгіршому куті екрана для великого пальця.
ok('тап-ціль «назад» не менша за 44px (Apple HIG)',
   назад.w >= 44 && назад.h >= 44, `${назад.w}×${назад.h}`);
// Гліф «←» — це літера: своя товщина, свій оптичний центр, свій шрифт. Поруч із
// векторними іконками він завжди трохи не той. Той самий висновок уже записаний
// при `.cm-ad-author-go` у board.css.
ok('знак «назад» — векторна іконка, а не текстовий гліф',
   /ICONS\.back/.test(JS) && !/aria-label="Назад">←/.test(JS),
   /ICONS\.back/.test(JS) ? 'ICONS.back' : 'у розмітці досі текстовий знак');

// ── КОНТРОЛЬ ДРУГИЙ: на СТАРОМУ CSS сторож мусить упасти ────────────────────
// Без цього не видно, чи перевірки взагалі щось ловлять.
const старий = html
  .replace('background: var(--app-bg, #ECEEF1);', 'background: var(--paper, #F4F1E6);')
  .replace('background: var(--news-card, #FFFFFF);', 'background: var(--card-cream, #FAF8EF);')
  .replace('background: var(--brand-grad);\n  color: #fff;',
           'background: linear-gradient(160deg, #7a3540 0%, #5c252c 100%);\n  color: #fff;');
await pg.setContent(старий);
const було = await pg.$$eval('[data-t]', ns => ns.map(n => {
  const m = getComputedStyle(n).backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? (+m[1] - +m[3]) : 0;
}));
ok('контроль: на старих кремових значеннях сторож СПРАВДІ падає',
   було.some(w => w > WARM_LIMIT), `теплота була ${було.join(' / ')}`);

// Другий контроль — на головну перевірку файлу. Повертаємо власний градієнт hero
// і переконуємось, що «один бордовий» справді розпадається на два.
const градБуло = await pg.$$eval('[data-grad]', ns => ns.map(n => getComputedStyle(n).backgroundImage));
ok('контроль: з власним градієнтом hero перевірка «один бордовий» падає',
   градБуло.length === 2 && градБуло[0] !== градБуло[1],
   градБуло.length === 2 && градБуло[0] !== градБуло[1] ? 'шапка ≠ hero, як і було до фіксу' : 'контроль порожній');

await b.close();
done();
