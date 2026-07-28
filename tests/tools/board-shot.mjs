// Смоук Дошки: піднімає застосунок, іде на вкладку Дошка, знімає екран.
// Supabase з пісочниці недосяжний — картки підсуваємо руками в DOM тим самим
// шаблоном, що й renderBoardCard, щоб бачити РЕАЛЬНИЙ вигляд фону/шапки/карток.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { launch, serve, blockExternal } from '../_lib.mjs';

const { url, stop } = await serve();
const browser = await launch(chromium);
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
await blockExternal(page);
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.slice(0, 160)));

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

// Прибрати splash якщо висить
await page.evaluate(() => document.getElementById('splash')?.remove());

// Перейти на Дошку
await page.evaluate(() => window.switchTab ? window.switchTab('board') : document.querySelector('[data-tab-btn="board"]')?.click());
await page.waitForTimeout(1200);

// Підсунути картки, якщо база не віддала (пісочниця без мережі до Supabase)
await page.evaluate(() => {
  const body = document.getElementById('bd-body');
  if (!body) return 'НЕМА bd-body';
  const hasCards = body.querySelector('.cm-board-note');
  if (hasCards) return 'картки прийшли з бази';
  const card = (t, cat, color, loc, title, text, who, when) => `
    <article class="cm-board-note bd-card bd-card--board" data-post-id="${t}">
      <span class="cm-board-pin"></span>
      <span class="cm-board-cat cm-board-cat--${color}">${cat}</span>
      <span class="cm-board-loc">📍${loc}</span>
      <h3 class="cm-board-title">${title}</h3>
      <p class="cm-board-text">${text}</p>
      <div class="cm-board-foot">
        <div class="cm-board-foot-actions">
          <a class="cm-board-call" href="#">☎</a>
          <button class="cm-board-msg-btn">💬</button>
        </div>
        <div class="cm-board-foot-who">
          <span class="cm-board-author cm-board-author--card">— ${who}</span>
          <span class="cm-board-time">${when}</span>
        </div>
      </div>
    </article>`;
  const L = [
    card('1', 'ПРОДАМ', 'red', 'ЖОРНИЩЕ', 'Продам будинок в Жорнище', 'Будинок 90 м², ділянка 25 соток, газ, вода, поруб школа і магазин. Торг при огляді.', 'ВОЛОДИМИР', '13 липня'),
    card('3', 'ВІДДАМ', 'green', 'ОЛИКА', 'Віддам кошенят', 'Три кошенятки, до лотка привчені, їдять самостійно. Віддам у добрі руки.', 'МАРІЯ', '11 липня'),
    card('5', 'ПОСЛУГА', 'purple', 'ОЛИЦЬКА ГРОМАДА', 'Ремонт покрівлі', 'Виконуємо ремонт дахів, водовідведення, утеплення. Досвід 12 років.', 'ІГОР', '9 липня'),
  ].join('');
  const R = [
    card('2', 'КУПЛЮ', 'green', 'ОЛИЦЬКА ГРОМАДА', 'Куплю будинок', 'Шукаю будинок для купівлі. Розгляну пропозиції в місті, селищі або сільській місцевості.', 'ВОЛОДИМИР', '10 липня'),
    card('4', 'ШУКАЮ', 'blue', 'ОЛИКА', 'Шукаю роботу', 'Шукаю роботу водієм категорії C. Стаж 8 років, права відкриті.', 'ПЕТРО', '10 липня'),
    card('6', 'ЗАГУБИЛОСЬ', 'amber', 'ОЛИКА', 'Загубився пес', 'Рудий, середнього розміру, відгукується на Рекс. Загубився біля костелу.', 'ОКСАНА', '8 липня'),
  ].join('');
  body.innerHTML = `<div class="cm-board-corkboard board-corkboard--full">
      <div class="cm-board-col">${L}</div><div class="cm-board-col">${R}</div></div>`;
  return 'картки підсунуто';
}).then(r => console.log('DOM:', r));

await page.waitForTimeout(500);
// 🔴 Було зашито АБСОЛЮТНИЙ шлях у теку однієї конкретної сесії
// (`/tmp/claude-0/…/c54d5b52-…/scratchpad`). Наступна сесія має інший ідентифікатор,
// тож інструмент мовчки писав знімки в неіснуючу теку — «відпрацював», нічого не давши.
// Це та сама хвороба, через яку 27.07 загубились сторожі клавіатури.
// Тепер тека береться з аргументу, а за замовчуванням — поруч із самим інструментом.
const SHOTS = process.argv[2] || new URL('./_out', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
await page.screenshot({ path: `${SHOTS}/board-1-top.png` });

// Прокрутити вниз — шапка мусить поїхати вгору
await page.evaluate(() => { document.querySelector('.app-main').scrollBy(0, 260); });
await page.waitForTimeout(200);
await page.evaluate(() => { document.querySelector('.app-main').scrollBy(0, 260); });
await page.waitForTimeout(700);
await page.screenshot({ path: `${SHOTS}/board-2-scrolled.png` });

const state = await page.evaluate(() => {
  const c = document.querySelector('.bd-controls');
  const main = document.querySelector('.app-main');
  return {
    collapsed: c?.classList.contains('bd-controls--collapsed'),
    transform: c ? getComputedStyle(c).transform : null,
    scrollTop: Math.round(main.scrollTop),
    bgOfBoard: getComputedStyle(document.querySelector('.board-bg')).backgroundColor,
    bgImage: getComputedStyle(document.querySelector('.board-bg')).backgroundImage,
  };
});
console.log('СТАН ПІСЛЯ СКРОЛУ:', JSON.stringify(state, null, 2));
console.log('ПОМИЛКИ КОНСОЛІ:', errors.length ? errors : 'нема');

await browser.close();
await stop();
