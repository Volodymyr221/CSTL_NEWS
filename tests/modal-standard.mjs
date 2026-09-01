// Стенд: СТАНДАРТ МОДАЛОК — одна база на весь застосунок.
//
// 🔴 НАВІЩО ЗАВЕДЕНИЙ (01.09.2026, сесія «c»).
// 🗣️ Замовлення Вови: «стандартизувати всі модалки… шапку модалки, щоб була ця
// рисочка і іконка хрестика… вона відрізняється зараз, в деяких модалках вона
// одна, в деяких інша… не по кольору, а взагалі по формі, по логіці закриття,
// так само за одним фон… нам треба зробити базу, тобто якщо ми добавляємо якусь
// модалку нову, то вона має бути стандартизована».
//
// 🔬 ЩО БУЛО ЗАМІРЯНО ДО ПРАВКИ (лист прокручено до кінця, 390×844):
//   • спільний примітив `.app-modal--sheet` — рисочка і ✕ їхали з top 96.4 на
//     **−838.6**, тобто **−935px, повністю за екран**. І це не вада однієї
//     модалки: `.app-modal-sheet` САМ є скролером, рисочка лежала в ньому
//     звичайним вузлом, а ✕ мав `position: absolute` — абсолют усередині
//     скролера прокручується разом із вмістом. Ваду успадкували ВСІ 10 модулів,
//     що кличуть примітив;
//   • затемнення розходилось: 0.45 у примітиві й Стрічці проти **0.50** у статті;
//   • радіус: 22px проти 20px;
//   • ✕ був сірий у примітиві й бордовий у статті та «Подати оголошення»;
//   • аркуші Стрічки НЕ блокували фон узагалі.
//
// 🔑 ЧОМУ СТЕРЕЖЕМО ТОКЕНИ, А НЕ ЗНАЧЕННЯ. Однакові числа, вписані в трьох
// файлах, розходяться при першій же правці — саме так і сталося. Тому база живе
// в `--modal-radius` / `--modal-backdrop`, а стенд перевіряє, що модалки беруть
// ЇХ, а не свою копію. Нову модалку тоді неможливо зробити «майже такою».
import { chromium } from 'playwright';
import { launch, projectFile } from './_lib.mjs';

const tokens = projectFile('style/tokens.css');
const modal  = projectFile('style/modal.css');
const feed   = projectFile('style/feed.css');
const base   = projectFile('style/base.css');
const comm   = projectFile('style/community.css');
const board  = projectFile('style/board.css');

const res = []; const ok = (n, c, i = '') => { res.push(c); console.log(`${c ? '✅' : '❌'} ${n}${i ? '  — ' + i : ''}`); };
const LONG = Array.from({ length: 60 }, (_, i) => `<p>Рядок ${i + 1}. Текст, довший за екран.</p>`).join('');

const сторінка = (тіло) => `<!doctype html><html><head><meta charset="utf-8"><style>
 *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
 html,body{height:100%;overflow:hidden}
 ${tokens}
 :root{--modal-bg:#fff;--ink:#2b2b2b;--gray-light:#eee;--ink-soft:#888;--white:#fff;--header-h:56px;
       --gray:#888;--black:#111;--border:#ddd;--board-bg:#F3EFE3;--app-bg:#fff;--bg-card:#fff;
       --board-line:#ddd;--board-card:#fff;--board-press:#eee;--news-accent:#722F37;--brand-grad-sm:#722F37;
       --fd-surface:#fff;--fd-ink:#111;--fd-chip:#eee;--fd-accent:#722F37;--fd-muted:#888;--fd-line:#ddd;--fd-divider:#ddd}
 ${modal}${feed}${base}${comm}${board}
</style></head><body>${тіло}</body></html>`;

const примітив = (mod = '') => `
 <div class="app-modal app-modal--sheet open${mod}">
  <div class="app-modal-backdrop"></div>
  <div class="app-modal-sheet">
    <div class="app-modal-head"><div class="app-modal-handle"></div><button class="app-modal-close">X</button></div>
    <h2 class="app-modal-title">Заголовок</h2>
    <div class="app-modal-body">${LONG}</div>
  </div>
 </div>`;

const стаття = `
 <div class="article-modal open"><div class="article-modal-inner">
   <div class="modal-sticky-header"><div class="modal-handle"></div><button class="modal-close-btn">X</button></div>
   <div class="article-modal-content">${LONG}</div>
 </div></div>`;

const b = await launch(chromium);

// ── 1. ШАПКА НЕ ЇДЕ ЗА ЕКРАН — У КОЖНІЙ РОДИНІ ──────────────────────────────
// Це головна вимога Вови. Міряємо ЖИВІ вузли після прокрутки до кінця, а не CSS:
// `position: sticky` можна написати і водночас звести нанівець предком з
// `overflow: hidden` — на папері правило є, на екрані шапки немає.
const родини = [
  ['спільний примітив', примітив(), '.app-modal-sheet', '.app-modal-handle', '.app-modal-close'],
  ['«Подати оголошення»', примітив(' app-modal--board-compose'), '.app-modal-sheet', '.app-modal-handle', '.app-modal-close'],
  ['стаття', стаття, '.article-modal-inner', '.modal-handle', '.modal-close-btn'],
];
for (const [назва, тіло, скролер, грабер, хрест] of родини) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.setContent(сторінка(тіло)); await p.waitForTimeout(120);
  const r = await p.evaluate(([sc, g, x]) => {
    const T = s => { const e = document.querySelector(s); return e ? +e.getBoundingClientRect().top.toFixed(1) : null; };
    const el = document.querySelector(sc);
    const до = { g: T(g), x: T(x) };
    el.scrollTop = 99999;
    return { до, після: { g: T(g), x: T(x) }, скрол: el.scrollTop };
  }, [скролер, грабер, хрест]);
  ok(`🔴 ${назва}: рисочка НЕ їде за вмістом`, r.скрол > 100 && Math.abs(r.після.g - r.до.g) < 1,
     `${r.до.g} → ${r.після.g} (прокручено ${r.скрол}px)`);
  ok(`🔴 ${назва}: ✕ НЕ їде за вмістом`, r.скрол > 100 && Math.abs(r.після.x - r.до.x) < 1,
     `${r.до.x} → ${r.після.x}`);
  await p.close();
}

// ── 2. ОДНА ПОВЕРХНЯ І ОДНЕ ЗАТЕМНЕННЯ ──────────────────────────────────────
const p2 = await b.newPage({ viewport: { width: 390, height: 844 } });
await p2.setContent(сторінка(примітив() + стаття + `
  <div class="fd-sheet-back open"><div class="fd-sheet-vp"><div class="fd-sheet"><div class="fd-sheet-handle"></div></div></div></div>`));
await p2.waitForTimeout(120);
const спільне = await p2.evaluate(() => {
  const cs = s => getComputedStyle(document.querySelector(s));
  return {
    затемнення: ['.app-modal-backdrop', '.article-modal', '.fd-sheet-back'].map(s => cs(s).backgroundColor),
    радіуси: ['.app-modal-sheet', '.article-modal-inner', '.fd-sheet'].map(s => cs(s).borderTopLeftRadius),
    хрестики: ['.app-modal-close', '.modal-close-btn'].map(s => cs(s).color),
  };
});
ok('🔴 затемнення ОДНАКОВЕ в усіх родинах', new Set(спільне.затемнення).size === 1, спільне.затемнення.join(' · '));
ok('🔴 радіус аркуша ОДНАКОВИЙ в усіх родинах', new Set(спільне.радіуси).size === 1, спільне.радіуси.join(' · '));
ok('✕ одного кольору (бордовий — вибір Вови 14.07)', new Set(спільне.хрестики).size === 1, спільне.хрестики.join(' · '));

// ── 3. ФОН ПІД МОДАЛКОЮ НЕ ПРОКРУЧУЄТЬСЯ ────────────────────────────────────
// 🗣️ «за одним фон там, він може скролитись». Аркуші Стрічки замка не мали.
const замок = await p2.evaluate(() => {
  const main = document.createElement('div'); main.className = 'app-main';
  document.body.appendChild(main);
  const було = getComputedStyle(main).overflow;
  return { зАркушем: було };   // .fd-sheet-back уже в документі
});
ok('🔴 фон заблоковано, поки в документі є аркуш Стрічки', замок.зАркушем === 'hidden', `overflow: ${замок.зАркушем}`);
const безАркуша = await p2.evaluate(() => {
  document.querySelector('.fd-sheet-back').remove();
  return getComputedStyle(document.querySelector('.app-main')).overflow;
});
ok('КОНТРОЛЬ: без аркуша фон знову прокручується', безАркуша !== 'hidden', `overflow: ${безАркуша}`);
await p2.close();

// ── 4. БАЗА — ЦЕ ТОКЕН, А НЕ ПЕРЕПИСАНЕ ЧИСЛО ───────────────────────────────
// 🛑 Найдешевший спосіб зламати стандарт — вписати «таке саме» число руками.
// Тому шукаємо в стилях модалок сирі значення повз токен.
const усіСтилі = modal + feed;
const сиріЗатемнення = (усіСтилі.match(/background:\s*rgba\(0,\s*0,\s*0,\s*0\.[45]\d?\)/g) || []);
ok('🛑 жодна модалка не вписує затемнення повз токен', сиріЗатемнення.length === 0,
   сиріЗатемнення.join(' · ') || 'усі беруть --modal-backdrop');
ok('токени бази оголошені', /--modal-radius:/.test(tokens) && /--modal-backdrop:/.test(tokens));

// ── 5. КОНТРОЛЬ САМОЇ МІРКИ ─────────────────────────────────────────────────
// 🛑 06.08 сторож `docs-refs` показав зелене на завідомо битому шляху — діра була
// не в стороже, а в КОНТРОЛІ. Тому перевіряємо, що вада, від якої стенд заведено,
// ним справді ловиться.
const p5 = await b.newPage({ viewport: { width: 390, height: 844 } });
await p5.setContent(сторінка(примітив()).replace('.app-modal-head {', '.app-modal-head-OFF {'));
await p5.waitForTimeout(120);
const контроль = await p5.evaluate(() => {
  const T = s => { const e = document.querySelector(s); return e ? +e.getBoundingClientRect().top.toFixed(1) : null; };
  const el = document.querySelector('.app-modal-sheet');
  const до = T('.app-modal-handle'); el.scrollTop = 99999;
  return { зсув: +(T('.app-modal-handle') - до).toFixed(1) };
});
ok('🛑 КОНТРОЛЬ: без липкої шапки стенд ЛОВИТЬ втечу рисочки', Math.abs(контроль.зсув) > 100,
   `зсув ${контроль.зсув}px`);
await p5.close();

await b.close();
const пройшло = res.filter(Boolean).length;
console.log(`\n${пройшло === res.length ? '✅' : '❌'} ${пройшло}/${res.length} перевірок пройдено`);
process.exit(пройшло === res.length ? 0 : 1);
