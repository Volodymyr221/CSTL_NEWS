// Стенд №32: КАРТКА ПОСТА «СТРІЧКИ» МАЄ ВИДИМИЙ ОБІДОК, ЯК КАРТКА ДОШКИ.
//
// Вова 30.07 (зі скріншотами IMG_3766 / IMG_3767): «постам в вкладці "стрічка" треба
// ободок зробити такий як в карточках товарів в дошці».
//
// 🔴 ЩО САМЕ МІРЯЄМО (правило «критерій міряє те, що побачить Вова»).
// Не наявність слова `border` у CSS — таку перевірку обійшов би будь-який новий колір,
// у тому числі невидимий. Міряємо КОНТРАСТ обчислених кольорів:
//   1. лінія ↔ фон вкладки — має тримати той самий критерій, що на Дошці (≈1.40, OLX);
//   2. лінія існує як лінія (ширина ≥ 1px і колір НЕ прозорий);
//   3. край дає лінія, а не тінь (`box-shadow: none` — як на картці Дошки);
//   4. лінія в ТОН вкладки: холодна, як фон Стрічки, а не тепла як у Дошки —
//      тепле на холодному читається брудним (урок 29.07, картка #FBFBF9 → #FFF).
//
// ⚠️ ЧОМУ НЕ ПОРІВНЮЮ hex НАПРЯМУ З `--board-line`: фон Стрічки світліший за фон
// Дошки, тому однаковий hex дав би РІЗНИЙ контраст (1.504 замість 1.398). Однаковим
// мусить бути критерій, а не значення — саме це й перевіряється числом.
//
// ⚠️ ЧОГО ЦЕЙ СТЕНД НЕ ПЕРЕВІРЯЄ: чи це «гарно». Числа кажуть лише, що край видимий
// і тримає ту саму міру, що на Дошці. Останнє слово — за оком Вови на iPhone.
import { chromium } from 'playwright';
import { launch, projectFile, reporter } from './_lib.mjs';

const BASE_CSS = projectFile('style/base.css');
const FEED_CSS = projectFile('style/feed.css');

const { ok, done } = reporter();

// Сторож присутності: якщо обідок колись приберуть, стенд скаже це прямо.
if (!/\.fd-card\s*\{[^}]*border:\s*1px solid var\(--fd-line\)/.test(FEED_CSS)) {
  console.log('❌ у feed.css немає `border: 1px solid var(--fd-line)` на .fd-card');
  console.log('   Якщо обідок свідомо прибрали — треба переписати і цей стенд, а не гасити його.');
  process.exit(1);
}

// Сцена: справжні CSS проєкту + мінімальна розмітка поста (як у feed.js:639).
// Дані з Supabase тут не потрібні — міряємо поверхні, не вміст.
const PAGE = '<!doctype html><html><head><meta charset="utf-8"><style>'
  + BASE_CSS + FEED_CSS
  + ':root { --safe-top: 0px; }'
  + '</style></head><body>'
  + '<main class="app-main" data-tab="shotam">'
  + '  <div id="page-shotam" class="page">'
  + '    <div class="fd-list">'
  + '      <article class="fd-card" data-post="1">'
  + '        <header class="fd-card-head"><div class="fd-head-txt">'
  + '          <span class="fd-page-name">ТУРИСТИЧНА ОЛИКА</span>'
  + '          <span class="fd-time">26 липня</span></div></header>'
  + '        <div class="fd-card-body"><p class="fd-text">Текст допису</p></div>'
  + '      </article>'
  + '      <article class="fd-card" data-post="2">'
  + '        <header class="fd-card-head"><div class="fd-head-txt">'
  + '          <span class="fd-page-name">ОЛИЦЬКА МІСЬКА РАДА</span></div></header>'
  + '        <div class="fd-card-body"><p class="fd-text">Другий допис</p></div>'
  + '      </article>'
  + '    </div>'
  + '  </div>'
  + '</main></body></html>';

const browser = await launch(chromium);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.setContent(PAGE, { waitUntil: 'load' });

// Контраст рахуємо за WCAG — з ОБЧИСЛЕНИХ браузером кольорів, не з тексту CSS.
const measured = await page.evaluate(() => {
  const rgb = s => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const cr = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

  const card = document.querySelector('.fd-card');
  const main = document.querySelector('.app-main');
  const cs = getComputedStyle(card);
  const bg = rgb(getComputedStyle(main).backgroundColor);
  const line = rgb(cs.borderTopColor);
  const surf = rgb(cs.backgroundColor);
  return {
    bg, line, surf,
    lineWidth: parseFloat(cs.borderTopWidth),
    lineStyle: cs.borderTopStyle,
    // ⚠️ Прозорість беремо ЧЕТВЕРТИМ числом і лише з `rgba(...)`. Перша версія брала
    // «останнє число перед дужкою» — і на непрозорому `rgb(201, 203, 206)` віддавала
    // 206, тобто СИНІЙ канал під виглядом прозорості. Перевірка при цьому проходила
    // (206 > 0.9), тільки з хибної причини, а в звіт друкувалось «alpha 206».
    lineAlpha: (() => {
      const n = (cs.borderTopColor.match(/[\d.]+/g) || []).map(Number);
      return cs.borderTopColor.startsWith('rgba') && n.length >= 4 ? n[3] : 1;
    })(),
    shadow: cs.boxShadow,
    crLineBg: cr(line, bg),
    crLineCard: cr(line, surf),
    crCardBg: cr(surf, bg),
    warmth: line[0] - line[2],          // R−B: >0 тепла, <0 холодна (мірка з board-cream)
    bgWarmth: bg[0] - bg[2],
  };
});

// ── 1. Лінія існує як лінія ──────────────────────────────────────────────────
ok('обідок є: ширина ≥ 1px', measured.lineWidth >= 1, `${measured.lineWidth}px`);
ok('обідок суцільний, не прозорий', measured.lineStyle === 'solid' && Number(measured.lineAlpha) > 0.9,
   `${measured.lineStyle}, alpha ${measured.lineAlpha}`);

// ── 2. 🔴 ТОЙ САМИЙ КРИТЕРІЙ, ЩО НА ДОШЦІ: контраст лінії до фону ≈1.40 ──────
const TARGET = 1.398;          // пара Дошки #E6E6E3 ↔ #C4C4C1
const TOL = 0.06;              // допуск: різниця, якої око не бачить
ok('контраст лінії до фону = критерій Дошки ≈1.40', Math.abs(measured.crLineBg - TARGET) <= TOL,
   `заміряно ${measured.crLineBg.toFixed(3)} (ціль ${TARGET} ± ${TOL})`);

// ── 3. Край дає ЛІНІЯ, а не тінь (модель Дошки/OLX) ─────────────────────────
ok('тіні на картці немає (один край = один засіб)', measured.shadow === 'none', measured.shadow);

// ── 4. Лінія в ТОН вкладки — холодна, як фон Стрічки ────────────────────────
// Мірка та сама, що в board-cream.mjs: теплота = R−B.
ok('лінія холодна, у тон фону Стрічки (не тепла як у Дошки)',
   measured.warmth <= 0 && measured.bgWarmth <= 0,
   `лінія R−B = ${measured.warmth}, фон R−B = ${measured.bgWarmth}`);

// ── 5. КОНТРОЛЬ: без обідка перевірка №2 МУСИТЬ упасти ──────────────────────
// Без цього «1.399» не доводить нічого — може, у сцені просто нема чому падати.
const control = await page.evaluate(() => {
  const rgb = s => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const cr = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  // Повертаємо СТАРИЙ вигляд: без межі, лише слабка тінь (як було до 30.07).
  const st = document.createElement('style');
  st.textContent = '.fd-card { border: 0 !important; box-shadow: 0 1px 2px rgba(16,18,22,0.05) !important; }';
  document.head.appendChild(st);
  const card = document.querySelector('.fd-card');
  const cs = getComputedStyle(card);
  const bg = rgb(getComputedStyle(document.querySelector('.app-main')).backgroundColor);
  return { width: parseFloat(cs.borderTopWidth), crCardBg: cr(rgb(cs.backgroundColor), bg) };
});
ok('КОНТРОЛЬ: стара верстка (без обідка) критерій НЕ тримає', control.width < 1,
   `ширина межі ${control.width}px — краю не існує, лишається лише контраст самої картки ${control.crCardBg.toFixed(3)}`);

// Довідка для наступної сесії: як картка виглядає в числах ДО і ПІСЛЯ.
console.log(`\nℹ️  край картки: було — тільки контраст поверхні ${measured.crCardBg.toFixed(3)} (нижче за помітність),`
  + ` стало — плюс лінія ${measured.crLineBg.toFixed(3)} до фону і ${measured.crLineCard.toFixed(3)} до самої картки.`);

await browser.close();
done();
