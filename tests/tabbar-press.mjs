// Стенд: КНОПКИ ТАБ-БАРУ РЕАГУЮТЬ НА НАТИСК, А НЕ НА ВІДПУСКАННЯ.
//
// Знахідка аудиту `apple-design` §1 (09.08): у `style/tabbar.css` було РІВНО
// ОДНЕ правило `:active` — на центральній «Громаді». Решта чотирьох кнопок
// найчастіше вживаного елемента застосунку на палець не реагували ніяк.
// Скіл: «Respond on pointer-down, not on release… Waiting for `click` to show
// feedback feels dead».
//
// 🔴 ЧОМУ ЦЕЙ СТЕНД ТИСНЕ МИШЕЮ, А НЕ ЧИТАЄ CSS.
// `:active` не існує в обчислених стилях — це СТАН. Перевірка виду «чи є в файлі
// рядок `.tab-item:active`» сказала б «є» і тоді, коли правило перебите іншим за
// вагою селектора, або коли кнопку перейменували. Тому тут справжній
// `mouse.down()`: браузер входить у стан натиску, і ми міряємо `transform`
// ЖИВИМ, поки палець умовно тримає кнопку.
// ⚠️ Це вже було в проєкті: 08.08 три перевірки поспіль були зелені на стані,
// якого людина не бачить. Тому знімаємо стан ЯВНО.
//
// 🔴 КОНТРОЛЬ (обовʼязковий):
//     CSS_REV=origin/main node tests/tabbar-press.mjs
// підсовує сторінці `style/tabbar.css` ДО фіксу. Перевірки на чотири звичайні
// вкладки мусять УПАСТИ, а «Громада» — лишитись зеленою: разом вони доводять,
// що стенд міряє саме додане правило, а не «бодай щось десь ворухнулось».
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';

const { ok, done } = reporter();
const REV = process.env.CSS_REV || '';

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  serviceWorkers: 'block',
});
const p = await ctx.newPage();
await p.route('**://*.supabase.co/**', r => r.abort());
await p.route('**://api.open-meteo.com/**', r => r.abort());
if (REV) {
  const body = projectFile('style/tabbar.css', REV);
  await p.route('**/style/tabbar.css', r => r.fulfill({ contentType: 'text/css; charset=utf-8', body }));
}

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1600);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(400);

// 🔴 ДОЧЕКАТИСЬ, ПОКИ ЗНИКНЕ ЗАСТАВКА `#splash`.
// Перша версія цього стенда тиснула на 2-й секунді і показала «жодна вкладка не
// реагує» — включно з «Громадою», чиє правило `:active` існує з давніх-давен.
// Причина: `#splash` (`position: fixed`, `z-index: 9999`) прибирається аж через
// 3.5с + 0.4с згасання + 0.6с (`src/app.js:481`), і до того МИША тисне саме її.
// Заставка не заважає читати обчислені стилі — тому інші стенди її й не помічали,
// — але справжній натиск повз неї не проходить.
// ⚠️ Той самий клас, що вже коштував проєкту хибних вимірів 08.08 (знімок крізь
// ще видиму заставку зіпсував УСІ попередні заміри кольору таб-бару).
await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 15000 });
await p.waitForTimeout(200);

// Зміряти `transform` вкладки, ПОКИ вона натиснута.
const підНатиском = async (tab) => {
  const box = await p.locator(`.tab-item[data-tab="${tab}"]`).boundingBox();
  if (!box) return { помилка: 'кнопки немає на екрані' };
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(160);   // дати перехідній анімації доїхати
  const стан = await p.evaluate(t => {
    const el = document.querySelector(`.tab-item[data-tab="${t}"]`);
    const кружечок = el.querySelector('.tab-home-circle');
    const cs = getComputedStyle(el);
    return {
      кнопка: cs.transform,
      колір: cs.color,
      кружечок: кружечок ? getComputedStyle(кружечок).transform : '',
    };
  }, tab);
  await p.mouse.up();
  await p.waitForTimeout(200);
  // ⚠️ Натиск по вкладці — це і справжній перехід на неї. Дошка при першому
  // вході піднімає гейт правил (`dismissible: false`, накриває весь екран,
  // включно з таб-баром), і НАСТУПНА вкладка вимірялась би крізь нього.
  // Саме на цьому стенд спершу «довів», що «Автобуси» не реагують: під центром
  // їхньої кнопки стояла кнопка `.brules-ok`, а не таб-бар.
  await p.evaluate(() => document.querySelector('.brules-ok')?.click());
  await p.waitForTimeout(300);
  const спокій = await p.evaluate(t =>
    getComputedStyle(document.querySelector(`.tab-item[data-tab="${t}"]`)).transform, tab);
  return { ...стан, спокій };
};

// `matrix(0.92, 0, 0, 0.92, 0, 0)` — саме стиснення. Читаємо перше число матриці,
// а не порівнюємо рядки: браузер віддає матрицю, а не той текст, що в CSS.
const масштаб = (m) => {
  const п = /matrix\(([^)]+)\)/.exec(m || '');
  return п ? parseFloat(п[1].split(',')[0]) : 1;
};

for (const [tab, назва] of [['shotam', 'Стрічка'], ['discussions', 'Обговорення'],
                            ['board', 'Дошка'], ['buses', 'Автобуси']]) {
  const р = await підНатиском(tab);
  const с = масштаб(р.кнопка);
  ok(`🔴 «${назва}» стискається під пальцем`, с > 0.5 && с < 0.99,
     р.помилка || `масштаб ${с}`);
  ok(`«${назва}» повертається у спокій після відпускання`,
     масштаб(р.спокій) === 1, `масштаб ${масштаб(р.спокій)}`);
}

// Контроль другого порядку: «Громада» мусить лишитись на СВОЄМУ правилі —
// стискається її кружечок, а не сама кнопка (інакше поїхали б виїмка бару і
// круг, які малюють псевдоелементи).
const дім = await підНатиском('community');
ok('«Громада» стискає кружечок, як і раніше',
   масштаб(дім.кружечок) < 0.99, `кружечок ${масштаб(дім.кружечок)}`);
ok('🛑 саму кнопку «Громади» НЕ масштабуємо (її вигляд малюють ::before/::after)',
   масштаб(дім.кнопка) === 1, `кнопка ${масштаб(дім.кнопка)}`);

// §14: людині з «менше руху» лишається відгук, але без масштабування.
await p.emulateMedia({ reducedMotion: 'reduce' });
await p.waitForTimeout(250);
const тихо = await підНатиском('board');
ok('при «менше руху» стиснення вимкнене', масштаб(тихо.кнопка) === 1,
   `масштаб ${масштаб(тихо.кнопка)}`);
ok('…але відгук лишається — колір міняється на бордовий',
   /114,\s*47,\s*55/.test(тихо.колір), тихо.колір);

await ctx.close(); await b.close(); await stop();
done();
