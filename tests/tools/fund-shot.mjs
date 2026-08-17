// tests/tools/fund-shot.mjs — знімок віджета зборів на ТЕСТОВИХ даних.
// ⚠️ Дані підміняються `page.route` і в репозиторій не потрапляють: вигадані
// збори не мають шансу опинитись у застосунку (чужі гроші, чужі назви).
import { chromium } from 'playwright';
import { chromiumPath, serve, ROOT } from '../_lib.mjs';
import { mockSupabase } from '../_board-fixture.mjs';
import { join } from 'path';
const { url, stop } = await serve();
const ep = chromiumPath();
const b = await chromium.launch({ ...(ep ? { executablePath: ep } : {}) });
const p = await (await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true, serviceWorkers:'block' })).newPage();
// 🔴 17.08 — збори переїхали З ФАЙЛУ В БАЗУ, тож підміна через `page.route` на
// `data/fundraisers.json` більше не працює: такого файлу немає, і застосунок по
// нього не ходить. Тепер підміняємо саму базу — ту дорогу, якою він ходить
// НАСПРАВДІ.
// ⚠️ N = 0 більше НЕ означає «показати справжні дані»: справжні лежать у проді,
// і сюди їх не дістати без ключів. Нуль тепер = порожня база, тобто перевірка
// того, що секція зникає ЗОВСІМ.
const N = +(process.argv[2] ?? 1);
// ⚠️ Дати рахуємо ВІД СЬОГОДНІ, а не пишемо константами: інакше через тиждень
// «залишилось 3 дні» тихо перетворилось би на завершений збір, і знімок показував
// би не те, що перевіряють.
const inDays = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const ITEMS = [
  { id:'t1', title:'Тестовий збір — не для прода', org:'ТЕСТ',
    url:'https://send.monobank.ua/jar/EXAMPLE', goal:500000, kind:'military',
    photo:'./photos/olyka.evening-1.jpg', until:inDays(3), place:'Олика', verified:true,
    note:'Це тестові дані для перевірки вигляду картки. У застосунок не потрапляють.', active:true },
  { id:'t2', title:'Другий тестовий збір', org:'ТЕСТ', url:'https://send.monobank.ua/jar/EXAMPLE2',
    goal:120000, kind:'humanitarian', photo:'./photos/olyka.day-4.jpg', place:'Олика', active:true },
  { id:'t3', title:'Третій тестовий збір — без фото', org:'ТЕСТ', url:'https://send.monobank.ua/jar/EXAMPLE3',
    goal:80000, kind:'community', active:true },
];
await mockSupabase(p, { fundraisers: ITEMS.slice(0, N) });
await p.goto(url, { waitUntil:'domcontentloaded' });
await p.waitForTimeout(2500);
await p.evaluate(() => window.switchTab && window.switchTab('community'));
await p.waitForTimeout(7000);
// Банер згоди `fixed` і перекриває низ картки — знімок без цього обрізав кнопку.
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(400);

console.log(JSON.stringify(await p.evaluate(() => {
  const sec = document.getElementById('hm-fund');
  if (!sec || sec.hidden) return { видно:false };
  const card = sec.querySelector('.hm-fund');
  const go = sec.querySelector('.hm-fund-go');
  const r = go && go.getBoundingClientRect();
  const cr = card && card.getBoundingClientRect();
  // Ціль лежить у панелі — перевіряємо, що вона НЕ наїхала на імʼя збирача.
  const org = sec.querySelector('.hm-fund-cell:not(.hm-fund-cell--goal) .hm-fund-v');
  const goal = sec.querySelector('.hm-fund-v--big');
  const a = org && org.getBoundingClientRect(), b = goal && goal.getBoundingClientRect();
  return {
    видно: true,
    кікер: sec.querySelector('.hm-kicker')?.textContent,
    карток: sec.querySelectorAll('.hm-fund').length,
    висотаКартки: cr ? Math.round(cr.height) : '—',
    заголовок: sec.querySelector('.hm-fund-ttl')?.textContent.trim().slice(0,30),
    хтоЗбирає: org?.textContent.trim().slice(0, 24),
    ціль: goal?.textContent.trim(),
    наїзд: !!(a && b && a.right > b.left + 1),
    статистик: sec.querySelectorAll('.hm-fund-stat').length,
    кнопка: go?.textContent.replace(/\s+/g,' ').trim(),
    // 17.08: напис подовшав на слово Вови, кегль зменшено і дозволено перенос.
    // Тому міряємо не «один рядок», а те, що справді важить: чи лишився текст
    // УСЕРЕДИНІ бордової плашки.
    написУКнопці: (() => {
      const t = sec.querySelector('.hm-fund-go-tx');
      if (!t || !go) return null;
      const tr = t.getBoundingClientRect(), gr = go.getBoundingClientRect();
      return tr.bottom <= gr.bottom + 0.5 && tr.right <= gr.right + 0.5;
    })(),
    дотик: r ? `${Math.round(r.width)}×${Math.round(r.height)}` : '—',
    підказка: sec.querySelector('.hm-fund-hint')?.textContent.replace(/\s+/g,' ').trim(),
    сумаНаКартці: /зібрано|донат|%/i.test(sec.textContent),
    крапок: sec.querySelectorAll('.hm-fdots i').length,
    векторІконка: !!sec.querySelector('.hm-fund-ic svg'),
  };
})));
// ⚠️ Висота вікна на час ЗНІМКА, а не на час верстки: таб-бар `fixed` накладався
// на низ картки і зрізав кнопку з підказкою — на знімку це виглядало як обрізана
// верстка, хоча в застосунку низ просто нижче згину. Ширину (390px) не чіпаємо:
// саме вона визначає розкладку, і міняти її означало б міряти інший телефон.
await p.setViewportSize({ width: 390, height: 1200 });
await p.waitForTimeout(300);
const el = await p.$('#hm-fund');
if (el) { await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
  await el.screenshot({ path: join(ROOT,'tests/tools/_shots',`fund-${N}.png`) }); }
console.log('📸 tests/tools/_shots/fund-' + N + '.png');
await b.close(); await stop();
