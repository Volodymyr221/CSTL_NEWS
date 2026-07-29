// ІНСТРУМЕНТ (руками): node tests/tools/fab-bg-depth.mjs [тека]
// Знімає ТРИ екрани — Дошка · лист «Нове оголошення» · «Мої оголошення» — на кількох
// глибинах фону, щоб Вова вибрав оком, а не за числами.
//
// НАВІЩО. Вова 29.07: «фон Подати оголошення і всіх вкладок меню FAB сильно світлий,
// дуже давить на очі і зливається. Можливо, той самий колір, тільки темніший».
//
// 🔴 ЧОМУ ТУТ ДВА ВАЖЕЛІ, А НЕ ОДИН. Скарга «зливається» і скарга «давить на очі» на
// СВІТЛОМУ тлі тягнуть в ОДИН бік (темніший фон лікує обидві) — на відміну від 28.07,
// коли фон був холодно-сірий і затемнення тиск ПОСИЛЮВАЛО. Різниця в тому, ЩО саме
// давить: тоді — сірість, тепер — яскравість великої майже-білої площини.
// Тому серія міняє ЛИШЕ глибину, тон лишається той самий (R=G, B на 3 менше).
//
// ⚠️ Фон і обідок ходять ПАРОЮ (правило з base.css): чим темніший фон, тим слабший
// потрібен обідок картки — інакше край почне різати. Тому обідок тут теж по кроках.
//
// 🔴 Форма подачі і «Мої оголошення» — за гейтом авторизації, тож малюються КАРКАСОМ
// із тими самими класами: змінюється лише CSS, а не розмітка, тож для вибору кольору
// цього досить. Що НЕ підміняється — самі стилі: вони справжні, з проєкту.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { launch, serve, blockExternal } from '../_lib.mjs';

const OUT = process.argv[2] || new URL('./_out', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

// [ярлик, фон, щільність обідка картки]
const VARIANTS = [
  ['0-зараз', '#E6E6E3', 0.22],
  ['F1',      '#DEDEDA', 0.20],
  ['F2',      '#D6D6D1', 0.18],
  ['F3',      '#CECEC8', 0.16],
];

const SHEET = `
  <div class="app-modal-backdrop"></div>
  <div class="app-modal-sheet" role="dialog">
    <div class="app-modal-handle"></div>
    <button class="app-modal-close" type="button">✕</button>
    <div class="cm-board-modal-head">
      <h3 class="cm-board-modal-title"><span class="cm-board-title-ic"></span>Нове оголошення</h3>
      <p class="cm-board-modal-sub">Заповніть поля нижче.</p>
    </div>
    <form>
      <div class="bm-section">
        <label class="bm-label">Категорія <span class="bm-label-req">*</span></label>
        <div class="bm-chips">
          <button type="button" class="bm-chip active"><span class="bm-chip-label">Продам</span></button>
          <button type="button" class="bm-chip"><span class="bm-chip-label">Куплю</span></button>
          <button type="button" class="bm-chip"><span class="bm-chip-label">Послуга</span></button>
        </div>
      </div>
      <div class="bm-section">
        <label class="bm-label">Опис <span class="bm-label-req">*</span></label>
        <textarea class="cm-board-input" rows="3">Продам дитячий велосипед, стан хороший.</textarea>
        <label class="bm-label">Ціна</label>
        <input class="cm-board-input" value="1500">
        <label class="bm-label">Населений пункт</label>
        <input class="cm-board-input" value="Олика">
        <label class="bm-label">Телефон</label>
        <input class="cm-board-input" value="+380 99 123 45 67">
      </div>
      <button class="cm-board-submit" type="button">Опублікувати</button>
      <p class="cm-board-hint">Запит йде модератору. Після перевірки зʼявиться на дошці.</p>
    </form>
  </div>`;

const ADS = `
  <header class="pm-head pm-head--list">
    <button class="pm-back" type="button">←</button>
    <div class="pm-head-titles"><div class="pm-head-name pm-head-name--ico">Мої оголошення</div></div>
  </header>
  <div class="pm-ad-tabs">
    <button class="pm-ad-tab active" type="button">Активні</button>
    <button class="pm-ad-tab" type="button">На модерації</button>
    <button class="pm-ad-tab" type="button">Архів</button>
  </div>
  <div class="pm-list">
    ${[['Продам дитячий велосипед', 'Продам · 1 500 ₴'],
       ['Ремонт пральних машин удома', 'Послуга · Договірна'],
       ['Віддам котенят у добрі руки', 'Віддам · Безкоштовно']].map(([t, m]) => `
      <div class="pm-ad">
        <div class="pm-ad-thumb" style="background:linear-gradient(135deg,#ece4d8,#dccfba)"></div>
        <div class="pm-ad-body">
          <div class="pm-ad-title">${t}</div>
          <div class="pm-ad-meta">${m}</div>
          <div class="pm-ad-actions"><span class="pm-ad-msgs pm-ad-msgs--none">Поки немає звернень</span></div>
        </div>
      </div>`).join('')}
  </div>`;

const { url, stop } = await serve();
const browser = await launch(chromium);
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await blockExternal(page);
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  document.getElementById('splash')?.remove();
  document.querySelector('.consent-bar, .cookie-bar, [class*="consent"]')?.remove();
});
await page.evaluate(() => window.switchTab?.('board'));
await page.waitForTimeout(1200);

const mount = (cls, html) => page.evaluate(({ cls, html }) => {
  document.getElementById('__repl')?.remove();
  const w = document.createElement('div');
  w.id = '__repl';
  w.className = cls;
  w.innerHTML = html;
  document.body.appendChild(w);
}, { cls, html });
const unmount = () => page.evaluate(() => document.getElementById('__repl')?.remove());

for (const [label, bg, edge] of VARIANTS) {
  await page.evaluate(({ bg, edge }) => {
    let s = document.getElementById('__depth');
    if (!s) { s = document.createElement('style'); s.id = '__depth'; document.head.appendChild(s); }
    s.textContent = `
      :root { --board-bg: ${bg}; }
      .board-bg { background: ${bg} !important; }
      .app-main[data-tab="board"] { background: ${bg} !important; }
      #board-content .cm-board-note:not(.cm-board-note--official),
      .pm-thread, .pm-ad { border-color: rgba(16,18,22,${edge}) !important; }
    `;
  }, { bg, edge });
  await page.waitForTimeout(250);

  await unmount();
  await page.screenshot({ path: `${OUT}/depth-${label}-1-дошка.png` });

  await mount('app-modal app-modal--sheet app-modal--board-compose open', SHEET);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/depth-${label}-2-подача.png` });

  await mount('pm-screen pm-screen--ads visible', ADS);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/depth-${label}-3-мої.png` });

  // ⚠️ КОНТРОЛЬ (урок потоку: інструмент уже раз мовчки давав однакові знімки).
  // Друкуємо ЖИВИЙ колір аркуша — якщо він не рухається за варіантом, підміна не спрацювала.
  const live = await page.evaluate(() => {
    const s = document.querySelector('#__repl .pm-screen, .pm-screen#__repl') || document.getElementById('__repl');
    return getComputedStyle(s).backgroundColor;
  });
  console.log(`${label.padEnd(8)} фон ${bg} · обідок ${edge} · заміряно на екрані: ${live}`);
}

await unmount();
await browser.close();
await stop();
