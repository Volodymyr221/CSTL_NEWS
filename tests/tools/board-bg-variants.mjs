// Інструмент вибору фону Дошки: знімає ОДИН І ТОЙ САМИЙ екран із різними варіантами
// фону і поверхні картки, щоб Вова вибрав оком, а не за числами.
//
// Скарга Вови 28.07: «фон такий, що верхня шапка і самі карточки трошки зливається
// з заднім фоном — можливо його зробити трішечки насиченішим темнішим… щоб карточки
// і шапка виділялися».
//
// Заміряно ДО правки: картка #FBFBF9 на фоні #ECEEF1 = 1.122:1 (як у Facebook, тобто
// на самій межі). Плюс ДРУГА причина, якої в FB немає: картка ТЕПЛА (жовтуватий білий,
// залишок від кремового корка), а фон ХОЛОДНИЙ сірий — тепле на холодному читається
// «брудно» навіть при тій самій різниці яскравості. Тому у варіантах картка стає
// чистим білим #FFFFFF (та сама поверхня, що в «Стрічці» — заразом DRY).
//
// 🔴 ПОЛАГОДЖЕНО 28.07 (/byyou) — ІНСТРУМЕНТ БУВ ЗЛАМАНИЙ І МОВЧКИ ПОКАЗУВАВ ОДНЕ Й ТЕ САМЕ.
// Він перебивав `--app-bg`, але потік 1 того ж дня переселив Дошку на ОКРЕМИЙ токен
// `--board-bg` (`base.css:274` + `.board-bg`). Тобто після тієї зміни варіанти A/B/C
// давали БАЙТ-У-БАЙТ однакові знімки (звірено md5) — інструмент «працював», нічого не
// змінюючи. Класика «мірка бреше»: зелено виглядало, доводило нуль.
//
// 🔄 ЗАРАЗОМ ЗМІНЕНО САМУ ГІПОТЕЗУ. Стара серія (A/B/C) шукала ТЕМНІШИЙ фон. Це виявився
// хибний шлях: Вова 28.07 сказав «карточки зливаються з фоном і це сильно давить на очі» —
// тобто затемнення фону дало +0.10 контрасту і водночас тиск на очі. На такій різниці
// яскравості око ловить КРАЙ, а не заливку (так роблять iOS/Material). Тому нова серія
// тримає фон СВІТЛИМ і додає картці чіткий 1px край + зібрану тінь.
//
// Запуск: node tests/tools/board-bg-variants.mjs [тека для знімків]
import { chromium } from 'playwright';
import { launch, serve, blockExternal } from '../_lib.mjs';

const OUT = process.argv[2] || '/tmp';

// Варіанти: [ярлик, фон Дошки, край картки, тінь картки]
// Край — головний важіль нової серії: 1px лінія читається оком навіть там, де різниця
// заливок мала. Тінь при цьому ЗБИРАЄМО (менший радіус, менша непрозорість): широка
// розмита тінь на світлому тлі читається як бруд, а не як край.
const EDGE   = '1px solid rgba(16,18,22,0.10)';
const SHADOW = '0 1px 2px rgba(16,18,22,0.06), 0 4px 10px rgba(16,18,22,0.10)';
const VARIANTS = [
  ['0-зараз',      '#E1E5EB', 'none', null],   // null = не чіпаємо чинну тінь
  ['A-край',       '#E1E5EB', EDGE,   SHADOW], // той самий фон, доданий край
  ['B-світліший',  '#ECEEF1', EDGE,   SHADOW], // фон як у Стрічки — легше очам
  ['C-тепліший',   '#EFEFEC', EDGE,   SHADOW], // менш холодний сірий
];

const { url, stop } = await serve();
const browser = await launch(chromium);
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await blockExternal(page);
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

// Прибрати splash і банер згоди — вони затуляють нижню частину екрана.
await page.evaluate(() => {
  document.getElementById('splash')?.remove();
  document.querySelector('.consent-bar, .cookie-bar, [class*="consent"]')?.remove();
});
await page.evaluate(() => window.switchTab?.('board'));
await page.waitForTimeout(1200);

for (const [label, bg, edge, shadow] of VARIANTS) {
  await page.evaluate(({ bg, edge, shadow }) => {
    let s = document.getElementById('__bgvar');
    if (!s) { s = document.createElement('style'); s.id = '__bgvar'; document.head.appendChild(s); }
    // ⚠️ Перебиваємо САМЕ `--board-bg` (і сам шар `.board-bg`) — Дошка живе на ньому,
    //    а не на `--app-bg`. Через це стара версія інструмента нічого не змінювала.
    s.textContent = `
      :root { --board-bg: ${bg}; }
      .board-bg { background: ${bg} !important; }
      .app-main[data-tab="board"] { background: ${bg} !important; }
      #board-content .cm-board-note:not(.cm-board-note--official) {
        border: ${edge} !important;
        ${shadow ? `box-shadow: ${shadow} !important;` : ''}
      }
    `;
  }, { bg, edge, shadow });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/bg-${label}.png` });
  console.log(`${label.padEnd(14)} фон ${bg} · край ${edge === 'none' ? '—' : 'є'}`);
}

await browser.close();
await stop();
