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
// Запуск: node tests/tools/board-bg-variants.mjs [тека для знімків]
import { chromium } from 'playwright';
import { launch, serve, blockExternal } from '../_lib.mjs';

const OUT = process.argv[2] || '/tmp';

// Варіанти: [ярлик, фон вкладки, скло шапки, поверхня картки]
// Скло — той самий колір, що фон, з тією ж прозорістю 0.62 (щоб шапка лишалась
// «склом», а не плитою, але вже в тон новому фону).
const VARIANTS = [
  ['0-зараз',    '#ECEEF1', 'rgba(236,238,241,0.62)', '#FBFBF9'],
  ['A-мягко',    '#E7EAEF', 'rgba(231,234,239,0.66)', '#FFFFFF'],
  ['B-помітно',  '#E1E5EB', 'rgba(225,229,235,0.68)', '#FFFFFF'],
  ['C-виразно',  '#DCE1E8', 'rgba(220,225,232,0.70)', '#FFFFFF'],
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

for (const [label, bg, glass, card] of VARIANTS) {
  await page.evaluate(({ bg, glass, card }) => {
    let s = document.getElementById('__bgvar');
    if (!s) { s = document.createElement('style'); s.id = '__bgvar'; document.head.appendChild(s); }
    s.textContent = `
      :root { --app-bg: ${bg}; --app-glass: ${glass}; }
      .cm-board-note { background: ${card} !important; }
    `;
  }, { bg, glass, card });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/bg-${label}.png` });
  console.log(`${label}: фон ${bg} · картка ${card}`);
}

await browser.close();
await stop();
