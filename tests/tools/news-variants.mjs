// tests/tools/news-variants.mjs — ВАРІАНТИ ВИГЛЯДУ НОВИН, знімками (01.08, потік /byyou).
//
// Навіщо окремим інструментом, а не правкою бойового коду: на кроці 5 Вова
// дивиться і каже, який варіант беремо. Реалізовувати треба ОДИН — а щоб вибрати,
// потрібно побачити всі. Той самий прийом, яким 28.07 обирали шапку Дошки
// (`board-head-variants.mjs`) і 29.07 фон (`board-bg-variants.mjs`).
//
// 🔑 ГОЛОВНЕ: варіанти малюються НАКЛАДЕНИМ <style> поверх живої сторінки.
//    Жоден файл у `src/` не змінюється — тому «не сподобалось» коштує нуль.
//
// Знімає: віджет Громади (зараз / C / A) + хаб (зараз / A / B) і МІРЯЄ висоту
// віджета в кожному варіанті — щоб вибір спирався не лише на око.
//
// Запуск: node tests/tools/news-variants.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { chromiumPath, serve } from '../_lib.mjs';

const OUT = 'shots/variants';
mkdirSync(OUT, { recursive: true });

// ── СПІЛЬНА ОСНОВА ВСІХ НОВИХ ВАРІАНТІВ ───────────────────────────────────
// Знімає КОРОБКУ: плашку картки, її обідок, заокруглення і проміжок. Замість
// них — волосяна лінія між рядками. Це і є та зміна, заради якої весь потік:
// кожна межа забирала ширину в заголовка.
const BASE_ROWS = `
  .cm-block--news .nc, .nh-list .nc {
    background: none !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    margin: 0 !important;
  }
  .cm-block--news .cm-news-top3, .nh-list { gap: 0 !important; }
  .cm-block--news .nc + .nc, .nh-list .nc + .nc {
    border-top: 1px solid rgba(0,0,0,0.10) !important;
  }
`;

// ── ВАРІАНТ C — СМУГА ДАЙДЖЕСТУ (лише віджет) ─────────────────────────────
// Без фото і без анонсу: три заголовки з міткою розділу. Віджет як ПОГЛЯД.
const WIDGET_C = BASE_ROWS + `
  .cm-block--news .nc { padding: 11px 14px !important; align-items: baseline !important; }
  .cm-block--news .nc-img { display: none !important; }
  .cm-block--news .nc-excerpt { display: none !important; }
  .cm-block--news .nc-src { display: none !important; }
  .cm-block--news .nc-badge--cat, .cm-block--news .nc-badge--illus { display: none !important; }
  .cm-block--news .nc-meta { margin: 0 0 3px !important; }
  .cm-block--news .nc-title {
    font-size: 15px !important; line-height: 1.3 !important;
    -webkit-line-clamp: 2 !important; margin: 0 0 3px !important;
  }
  .cm-block--news .nc-foot { font-size: 11px !important; margin: 0 !important; }
`;

// ── ВАРІАНТ A — СТРІЧКА (віджет і хаб) ────────────────────────────────────
// Фото 64px праворуч ЗАВЖДИ — саме сталість розміру прибирає рвані висоти
// (заміряно було 100/71/100). Верхній рядок `джерело · час` одним рядком
// звільняє цілий рядок під заголовок.
const ROWS_A = BASE_ROWS + `
  .cm-block--news .nc, .nh-list .nc { padding: 12px 14px !important; align-items: flex-start !important; }
  .cm-block--news .nc-img, .nh-list .nc-img {
    width: 64px !important; height: 64px !important;
    border-radius: 8px !important; object-fit: cover !important; flex: 0 0 64px !important;
  }
  .cm-block--news .nc-excerpt, .nh-list .nc-excerpt { display: none !important; }
  .cm-block--news .nc-badge--cat, .nh-list .nc-badge--cat,
  .cm-block--news .nc-badge--illus, .nh-list .nc-badge--illus { display: none !important; }
  .cm-block--news .nc-meta, .nh-list .nc-meta { margin: 0 0 4px !important; }
  .cm-block--news .nc-title, .nh-list .nc-title {
    font-size: 15.5px !important; line-height: 1.29 !important;
    -webkit-line-clamp: 3 !important; margin: 0 !important;
  }
  /* час переїхав у верхній рядок → нижній більше не потрібен */
  .cm-block--news .nc-foot, .nh-list .nc-foot { display: none !important; }
  .nc-monogram {
    width: 64px; height: 64px; border-radius: 8px; flex: 0 0 64px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 20px; letter-spacing: -0.5px;
    background: rgba(0,0,0,0.055); color: rgba(0,0,0,0.34);
  }
`;

// ── ВАРІАНТ B — ЖУРНАЛ (лише хаб) ─────────────────────────────────────────
// Перша новина розділу велика: фото на всю ширину 16:9, заголовок 22px.
// Далі — рядки як в A. Дає ієрархію «головне / решта».
const HUB_B = ROWS_A + `
  .nh-list .nc:first-child { display: block !important; padding: 0 0 14px !important; }
  .nh-list .nc:first-child .nc-img {
    width: 100% !important; height: 200px !important;
    border-radius: 0 !important; flex: none !important; margin-bottom: 10px !important;
  }
  .nh-list .nc:first-child .nc-monogram { width: 100% !important; height: 200px !important; border-radius: 0; }
  .nh-list .nc:first-child .nc-body { padding: 0 14px !important; }
  .nh-list .nc:first-child .nc-title {
    font-size: 22px !important; line-height: 1.18 !important; letter-spacing: -0.5px !important;
  }
`;

// Переносить час у верхній рядок і підставляє монограму джерела там, де фото нема.
// Робиться в DOM, бо CSS не вміє ні переставляти вузли, ні брати першу літеру тексту.
const RESHAPE = () => {
  document.querySelectorAll('.nc').forEach((card) => {
    const meta = card.querySelector('.nc-meta');
    const foot = card.querySelector('.nc-foot');
    if (meta && foot && !meta.querySelector('.nc-when')) {
      const when = document.createElement('span');
      when.className = 'nc-src nc-when';
      when.textContent = '· ' + foot.textContent.trim();
      meta.appendChild(when);
    }
    if (!card.querySelector('.nc-img') && !card.querySelector('.nc-monogram')) {
      const src = (card.querySelector('.nc-src')?.textContent || '?').trim();
      const mono = document.createElement('div');
      mono.className = 'nc-monogram';
      mono.textContent = src.charAt(0).toUpperCase();
      card.insertBefore(mono, card.firstChild);
    }
  });
};

const { url, stop } = await serve();
const executablePath = chromiumPath();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('❌ помилка сторінки:', e.message));
await page.route('**://*.supabase.co/**', r => r.abort());
await page.route('**://api.open-meteo.com/**', r => r.abort());
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.evaluate(() => window.switchTab && window.switchTab('community'));
await page.waitForTimeout(1500);

const applyCss = (css) => page.evaluate((c) => {
  document.getElementById('variant-style')?.remove();
  const s = document.createElement('style');
  s.id = 'variant-style';
  s.textContent = c;
  document.head.appendChild(s);
}, css);

const clearCss = () => page.evaluate(() => document.getElementById('variant-style')?.remove());

const widgetH = () => page.evaluate(() => {
  const el = document.getElementById('cm-news-board');
  return el ? Math.round(el.getBoundingClientRect().height) : 0;
});

const shotWidget = async (name) => {
  const el = await page.$('#cm-news-board');
  if (el) await el.screenshot({ path: `${OUT}/${name}.png` });
};

const VIEW = 844 - 56 - 57;
const rows = [];
const noteWidget = async (label, name) => {
  const h = await widgetH();
  rows.push(`${label.padEnd(28)} ${String(h).padStart(4)}px  ${(h / VIEW * 100).toFixed(1)}%`);
  await shotWidget(name);
};

// ── ВІДЖЕТ ────────────────────────────────────────────────────────────────
await noteWidget('віджет — ЗАРАЗ', 'w0-зараз');

await applyCss(WIDGET_C);
await page.waitForTimeout(400);
await noteWidget('віджет — C (смуга)', 'w1-C-смуга');

await clearCss();
await applyCss(ROWS_A);
await page.evaluate(RESHAPE);
await page.waitForTimeout(400);
await noteWidget('віджет — A (стрічка)', 'w2-A-стрічка');

// ── ХАБ ───────────────────────────────────────────────────────────────────
await clearCss();
await page.evaluate(() => document.querySelectorAll('.nc-when, .nc-monogram').forEach(n => n.remove()));
await page.evaluate(() => {
  const b = document.querySelector('[data-cm-news-all], [data-cm-news-open]');
  if (b) b.click();
});
await page.waitForTimeout(1800);
await page.screenshot({ path: `${OUT}/h0-хаб-зараз.png` });

await applyCss(ROWS_A);
await page.evaluate(RESHAPE);
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/h1-хаб-A-стрічка.png` });

await clearCss();
await applyCss(HUB_B);
await page.evaluate(RESHAPE);
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/h2-хаб-B-журнал.png` });

console.log('\n' + rows.join('\n'));
console.log(`\nвидима зона ${VIEW}px · знімки → ${OUT}/`);

await browser.close();
await stop();
