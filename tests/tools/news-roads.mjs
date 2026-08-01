// tests/tools/news-roads.mjs — ДВІ ДОРОГИ ДЛЯ ВІДЖЕТА НОВИН (01.08, потік /byyou).
//
// Питання, на яке відповідають ці знімки:
//   дорога 2 — ЗНЯТИ «прилад» (багряний градієнт) → віджет стає світлим, як інші;
//   дорога 1 — ЛИШИТИ багряним і навести лад у його межах.
// Вова попросив показати спершу 2, потім 1.
//
// 🔑 Як і `news-variants.mjs`: усе малюється накладеним <style> поверх живої
//    сторінки. Жоден файл у `src/` не змінюється — «не сподобалось» коштує нуль.
//
// Спільне для ОБОХ доріг (це знахідки аудиту, не смак):
//   · монограма джерела там, де фото нема → зникають рвані висоти 100/71/100
//   · один формат часу
//   · верхній рядок розвантажений (категорія прибрана, лишається розділ + джерело)
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { chromiumPath, serve } from '../_lib.mjs';

const OUT = 'shots/roads';
mkdirSync(OUT, { recursive: true });

// Прибирає рвані висоти і зайве в обох дорогах.
const COMMON = `
  .cm-block--news .nc-badge--cat,
  .cm-block--news .nc-badge--illus { display: none !important; }
  .cm-block--news .nc-img, .cm-block--news .nc-monogram {
    width: 56px !important; height: 56px !important; flex: 0 0 56px !important;
    border-radius: 8px !important; object-fit: cover !important;
  }
  .cm-block--news .nc-monogram {
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 19px;
  }
  .cm-block--news .nc-title {
    font-size: 15px !important; line-height: 1.3 !important;
    -webkit-line-clamp: 2 !important;
  }
`;

// ── ДОРОГА 2 — ЗНЯТИ ПРИЛАД ───────────────────────────────────────────────
// Блок бере ту саму поверхню, що й решта віджетів Громади (`--bg-card`),
// силует замку і глянець гасяться. Картки — плашки З ОБІДКОМ, як у хабі
// (Вова 01.08: «треба як було до цього, в ободку»).
// Наслідок: шлях новин виглядає ОДНАКОВО у віджеті й у хабі.
const ROAD_2 = COMMON + `
  .cm-block--news {
    background: var(--bg-card) !important;
    border: 0 !important;
    box-shadow: var(--card-shadow) !important;
  }
  .cm-block--news::before { display: none !important; }
  .cm-news-board-bar { color: var(--ink, #1B1B1B) !important; }
  .cm-news-board-label { color: var(--ink, #1B1B1B) !important; }
  .cm-block--news .cm-block-body { background: transparent !important; }
  .cm-block--news .nc {
    background: #FFFFFF !important;
    border: 1px solid rgba(0,0,0,0.09) !important;
    border-radius: 12px !important;
    box-shadow: none !important;
  }
  .cm-block--news .nc-monogram { background: rgba(0,0,0,0.055); color: rgba(0,0,0,0.34); }
  .cm-news-all { color: var(--ink, #1B1B1B) !important; }
`;

// ── ДОРОГА 1 — ЛИШИТИ ПРИЛАД, НАВЕСТИ ЛАД ─────────────────────────────────
// Багряний градієнт, глянець і замок лишаються (рішення Вови 31.07).
// Виправляємо лише те, що аудит назвав дефектом:
//   · ПОДВІЙНА МЕЖА — у картки знімається власний обідок, лишається тінь;
//     розділяє тепер один засіб, а не два в одному місці;
//   · рвані висоти — монограма замість відсутнього фото.
const ROAD_1 = COMMON + `
  .cm-block--news .nc {
    background: #FFFFFF !important;
    border: 0 !important;
    border-radius: 12px !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.16), 0 4px 12px rgba(0,0,0,0.10) !important;
  }
  .cm-block--news .nc-monogram { background: rgba(0,0,0,0.06); color: rgba(0,0,0,0.32); }
`;

// Монограма + єдиний формат часу. У DOM, бо CSS не вміє брати першу літеру тексту.
const RESHAPE = () => {
  document.querySelectorAll('#cm-news-board .nc').forEach((card) => {
    if (!card.querySelector('.nc-img') && !card.querySelector('.nc-monogram')) {
      const src = (card.querySelector('.nc-src')?.textContent || '?').trim();
      const mono = document.createElement('div');
      mono.className = 'nc-monogram';
      mono.textContent = src.charAt(0).toUpperCase();
      card.insertBefore(mono, card.firstChild);
    }
    // «31 липня» і «16 год тому» в одному віджеті — приводимо до відносного.
    const foot = card.querySelector('.nc-foot');
    if (foot && /\d{1,2}\s+\p{L}+/u.test(foot.textContent) && !/тому|щойно/.test(foot.textContent)) {
      foot.textContent = 'вчора';
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
// Банер згоди перекриває віджет на знімку — прибираємо, він тут ні до чого.
await page.evaluate(() => document.querySelector('.consent, .cookie, [class*="consent"]')?.remove());

const apply = (css) => page.evaluate((c) => {
  document.getElementById('road-style')?.remove();
  const s = document.createElement('style');
  s.id = 'road-style'; s.textContent = c;
  document.head.appendChild(s);
}, css);

const VIEW = 844 - 56 - 57;
const rows = [];
const shot = async (label, name) => {
  const el = await page.$('#cm-news-board');
  const h = await page.evaluate(() => {
    const n = document.getElementById('cm-news-board');
    return n ? Math.round(n.getBoundingClientRect().height) : 0;
  });
  rows.push(`${label.padEnd(26)} ${String(h).padStart(4)}px  ${(h / VIEW * 100).toFixed(1)}%`);
  if (el) await el.screenshot({ path: `${OUT}/${name}.png` });
};

await shot('зараз', '0-зараз');

await apply(ROAD_2);
await page.evaluate(RESHAPE);
await page.waitForTimeout(400);
await shot('ДОРОГА 2 — без приладу', '2-без-приладу');

await apply(ROAD_1);
await page.waitForTimeout(400);
await shot('ДОРОГА 1 — прилад + лад', '1-прилад-лад');

console.log('\n' + rows.join('\n'));
console.log(`\nвидима зона ${VIEW}px · знімки → ${OUT}/`);

await browser.close();
await stop();
