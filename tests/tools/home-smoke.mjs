// СМОУК головного екрана: пройтись по всіх точках, куди він веде, і зловити
// падіння або помилку в консолі. Не про вигляд — про те, що нічого не зламано.
import { chromium } from 'playwright';
import { chromiumPath, serve } from '../_lib.mjs';

const { url, stop } = await serve();
const ep = chromiumPath();
const browser = await chromium.launch({ ...(ep ? { executablePath: ep } : {}) });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
// ⚠️ Мережеві збої зовнішніх ресурсів (фото чужих RSS-джерел) з пісочниці —
// НЕ дефект застосунку: назовні тут ходити нікуди. Рахуємо лише свої помилки.
page.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|Failed to load resource/.test(t)) return;
  errs.push('console: ' + t.slice(0, 120));
});
await page.route('**://api.open-meteo.com/**', r => r.abort());
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
await page.evaluate(() => window.switchTab && window.switchTab('community'));
await page.waitForTimeout(2500);

// 🔴 Спершу приймаємо банер згоди — він `fixed` унизу екрана і ПЕРЕХОПЛЮЄ тапи
// по всьому, що після прокрутки опиняється внизу (телефони, капсули). Жива
// людина його теж закриває першим рухом; стенд, який його ігнорує, міряє не той
// екран. Той самий прийом, що з гейтом правил Дошки в `tests/board-rules.mjs`.
const consent = page.locator('.consent-accept');
if (await consent.count()) { await consent.click(); await page.waitForTimeout(400); }

const dir = process.env.SHOT_DIR || '/tmp';
// Закрити все, що відкрилось.
//
// 🔴 ДІАГНОЗ, ЗНАЙДЕНИЙ ПІСЛЯ ДВОХ НЕВДАЛИХ СПРОБ (правило «дві невдачі — стоп
// і пре-мортем»): у застосунку ТРИ різні механізми закриття, і одного способу
// не досить.
//   • стаття    — власна модалка `#article-modal` + глобальна `closeArticleModal()`;
//   • аркуші    — спільний примітив `core/modal.js`, кнопка `.app-modal-close`;
//   • шари      — `core/layers.js` (хаб новин, сторінка оголошення), закриває
//                 тільки «назад» у історії браузера.
// Перші дві спроби тиснули Escape і шукали `.app-modal-close` — стаття лишалась
// відкритою, перехоплювала тапи, і ВСІ наступні кроки «падали» на робочому коді.
// Дев'ятий випадок у проєкті, коли бреше сама перевірка, а не код.
const closeAll = async () => {
  // ⚠️ Гейт правил Дошки (03.08) — блокуюче вікно `dismissible:false`, яке
  // накриває екран при першому вході на вкладку. Крок «плитка Дошки → вкладка
  // Дошка» його викликає, і далі він перехоплював УСІ тапи, через що падали
  // наступні кроки. Приймаємо його так само, як це робить жива людина.
  const gate = page.locator('.brules-ok');
  if (await gate.count()) { await gate.click({ force: true }).catch(() => {}); await page.waitForTimeout(400); }

  for (let i = 0; i < 5; i++) {
    const open = await page.evaluate(() => {
      const art = document.querySelector('#article-modal.open');
      if (art && typeof window.closeArticleModal === 'function') { window.closeArticleModal(); return 'article'; }
      const btn = document.querySelector('.app-modal-close');
      if (btn) { btn.click(); return 'modal'; }
      if (document.querySelector('.nh-screen, .cm-ad-screen')) return 'layer';
      return null;
    });
    if (!open) break;
    // ⚠️ Для шарів — САМЕ `page.goBack()`, а не `history.back()` зсередини
    // сторінки: другий не чекає на обробку переходу, і замок прокрутки
    // (`body.cm-zoom-open` → `.app-main { overflow: hidden }`) лишався ввімкненим.
    // Через це наступні кроки не могли прогорнути екран і «падали». Продукт при
    // цьому справний — перевірено окремо: справжній «назад» відпускає замок.
    if (open === 'layer') await page.goBack().catch(() => {});
    await page.waitForTimeout(450);
  }
  await page.evaluate(() => window.switchTab && window.switchTab('community'));
  await page.waitForTimeout(500);
};

const step = async (name, fn) => {
  const before = errs.length;
  await closeAll();
  try { await fn(); } catch (e) { errs.push(`${name}: ${e.message.split('\n')[0].slice(0, 90)}`); }
  await page.waitForTimeout(700);
  console.log((errs.length > before ? '❌ ' : '✅ ') + name);
};

await step('головна плитка → її вміст', async () => {
  await page.locator('#hm-hero .hm-hero').click();
  await page.waitForTimeout(700);
});
await step('тап по новині у стрічці → стаття', async () => {
  await page.locator('#hm-news [data-article-id]').first().click();
  await page.waitForTimeout(700);
});
await step('«Усі новини» → хаб', async () => {
  await page.locator('[data-cm-news-all]').first().click();
  await page.waitForTimeout(900);
});
await step('тап по події → модалка', async () => {
  await page.locator('#hm-events [data-ev-id]').first().click();
  await page.waitForTimeout(700);
});
await step('плитка Дошки → вкладка Дошка', async () => {
  await page.locator('#hm-t-board').click();
  await page.waitForTimeout(900);
});
await step('розкриття «Усі телефони»', async () => {
  await page.locator('.hm-tels > summary').click();
});
await step('плитка автобуса → Автобуси', async () => {
  const t = page.locator('#hm-t-bus');
  if (await t.count() && await t.isVisible()) await t.click();
});
await step('повернення на Громаду', async () => {
  await page.evaluate(() => window.switchTab && window.switchTab('community'));
});
await step('прохід по всіх вкладках', async () => {
  for (const t of ['shotam', 'discussions', 'board', 'buses', 'community']) {
    await page.evaluate(x => window.switchTab && window.switchTab(x), t);
    await page.waitForTimeout(400);
  }
});

await closeAll();
await page.evaluate(() => { document.querySelector('.app-main').scrollTop = 0; });
await page.waitForTimeout(400);
await page.screenshot({ path: `${dir}/home-1.png` });
await page.evaluate(() => { document.querySelector('.app-main').scrollTop = 700; });
await page.waitForTimeout(400);
await page.screenshot({ path: `${dir}/home-2.png` });
await page.evaluate(() => { document.querySelector('.app-main').scrollTop = 1400; });
await page.waitForTimeout(400);
await page.screenshot({ path: `${dir}/home-3.png` });

console.log(errs.length ? '\n❌ помилки:\n' + errs.join('\n') : '\n✅ помилок немає');
await browser.close();
await stop();
process.exit(errs.length ? 1 : 0);
