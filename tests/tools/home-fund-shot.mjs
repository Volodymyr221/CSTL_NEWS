// ІНСТРУМЕНТ: показати, як виглядає блок «Актуальні збори» з реальними даними.
//
// ⚠️ НАВІЩО ОКРЕМИЙ ІНСТРУМЕНТ, а не «покласти приклад у data/fundraisers.json»:
// той файл їде на ПРОД. Вигаданий збір із вигаданою сумою і вигаданим
// організатором виглядав би на живому сайті як справжній — і хтось міг би за ним
// піти. Тому в репозиторії список порожній, а зразок живе тут і підміняється
// лише в браузері стенда (`page.route`), тобто нікуди не публікується.
//
// Запуск: node tests/tools/home-fund-shot.mjs
import { chromium } from 'playwright';
import { chromiumPath, serve } from '../_lib.mjs';

const SAMPLE = {
  updated: '2026-08-03',
  items: [
    {
      id: 'sample-fpv',
      active: true,
      title: 'На FPV-дрони для підрозділу, де служать наші',
      org: 'Волонтерська група «Олика допомагає»',
      verifiedBy: 'Олицька громада',
      goal: 50000,
      raised: 31200,
      note: 'Збір на 10 дронів. Звіти публікуємо щотижня.',
      url: 'https://example.org/jar',
    },
    {
      id: 'sample-school',
      active: true,
      title: 'Генератор для Олицького ліцею',
      org: 'Батьківський комітет ліцею',
      goal: 28000,
      raised: 26400,
      url: 'https://example.org/jar2',
    },
  ],
};

const { url, stop } = await serve();
const ep = chromiumPath();
const browser = await chromium.launch({ ...(ep ? { executablePath: ep } : {}) });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.route('**/data/fundraisers.json', r =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE) }));
await page.route('**://api.open-meteo.com/**', r => r.abort());
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
await page.evaluate(() => window.switchTab && window.switchTab('community'));
await page.waitForTimeout(2500);

const out = await page.evaluate(() => {
  const host = document.getElementById('hm-fund');
  const cards = [...host.querySelectorAll('.hm-fund')];
  return {
    висотаБлока: Math.round(host.getBoundingClientRect().height),
    карток: cards.length,
    висотаПершої: cards[0] ? Math.round(cards[0].getBoundingClientRect().height) : 0,
    відсоток: [...host.querySelectorAll('[role=progressbar]')].map(b => b.getAttribute('aria-valuenow')),
    починаєтьсяНа: Math.round(host.getBoundingClientRect().top + document.querySelector('.app-main').scrollTop),
  };
});
console.log('блок «Актуальні збори»:', JSON.stringify(out, null, 2));

const dir = process.env.SHOT_DIR || '/tmp';
await page.screenshot({ path: `${dir}/fund-top.png` });
await page.evaluate(() => { document.querySelector('.app-main').scrollTop = 330; });
await page.waitForTimeout(400);
await page.screenshot({ path: `${dir}/fund-block.png` });
console.log('скріншоти:', `${dir}/fund-top.png`, `${dir}/fund-block.png`);

await browser.close();
await stop();
