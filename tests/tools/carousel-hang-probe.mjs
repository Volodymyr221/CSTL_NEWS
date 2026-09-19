// 🔧 РАЗОВИЙ ПРИЛАД: чи можна відтворити в headless дотик, який гасить плавну
// прокрутку каруселі — те, на що скаржиться Вова 19.09.
//
// 🗣️ Скарга: «якщо блок автоматично проскролюється і в цей момент я вертикально
// скролю сторінку і попадає на той блок — відбувається типу як натиск, і блок
// зависає на середині між двома карточками».
//
// 🛑 ВІДПОВІДЬ ПРИЛАДУ — НІ, І САМЕ ТОМУ ВІН ЛИШАЄТЬСЯ В РЕПОЗИТОРІЇ.
// 📐 Заміряно 19.09: ні `Input.dispatchTouchEvent` (сирі дотики), ні
// `Input.synthesizeScrollGesture` із `gestureSourceType: 'touch'` тут ВЗАГАЛІ не
// прокручують сторінку — `.app-main` стояв на 53px від початку й до кінця прогону,
// хоч сам дотик до доріжки доходив (`touchstart: 1`). Тобто компонувальник дотику
// не бачить, плавна прокрутка не гаситься, і доріжка щоразу доїжджає до картки.
// ➡️ Прилад, який шле такий дотик і бачить «✅ доїхала», доводить не справність
// коду, а власну безсилість. Цей файл стоїть тут як доказ межі, щоб наступна сесія
// не витратила вечір на ту саму спробу.
// 🔑 Сторож `tests/carousel-hang.mjs` тому міряє НАМІР модуля (чи видасть він ще
// один `scrollTo`), а не положення доріжки.
//
// Запуск: node tests/tools/carousel-hang-probe.mjs
//         BUNDLE_REV=origin/main node tests/tools/carousel-hang-probe.mjs

import { chromium } from 'playwright';
import { chromiumPath, serve, projectFile } from '../_lib.mjs';

const REV = process.env.BUNDLE_REV || '';
const { url, stop } = await serve();
const executablePath = chromiumPath();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 },
                                       isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const page = await ctx.newPage();
if (REV) {
  const old = projectFile('bundle.js', REV);
  await page.route('**/bundle.js', r => r.fulfill({ contentType: 'application/javascript', body: old }));
}
await page.route('**://*.supabase.co/**', r => r.abort());
await page.route('**://api.open-meteo.com/**', r => r.abort());
await page.route('**://**/*.{png,jpg,jpeg,webp,gif}', r => r.abort());
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.evaluate(() => window.switchTab && window.switchTab('community'));
await page.waitForTimeout(1500);

await page.evaluate(() => document.getElementById('hm-ntrack')
  ?.scrollIntoView({ block: 'center', behavior: 'instant' }));
await page.waitForTimeout(500);

// Прилад має бачити не лише положення, а й ЧИ ДІЙШОВ ДОТИК і що з паузою.
await page.evaluate(() => {
  const t = document.getElementById('hm-ntrack');
  window.__лог = { touchstart: 0, touchmove: 0, touchend: 0, pointerdown: 0, стрічка: [] };
  ['touchstart', 'touchmove', 'touchend', 'pointerdown'].forEach(n =>
    t.addEventListener(n, () => { window.__лог[n]++; }, { passive: true }));
  const кадр = () => {
    window.__лог.стрічка.push([Math.round(performance.now()), Math.round(t.scrollLeft),
                               t.dataset.paused || '-', Math.round(document.querySelector('.app-main')?.scrollTop || 0)]);
    requestAnimationFrame(кадр);
  };
  requestAnimationFrame(кадр);
});

const геометрія = await page.evaluate(() => {
  const t = document.getElementById('hm-ntrack');
  if (!t) return null;
  const r = t.getBoundingClientRect();
  return {
    рамка: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    точки: [...t.querySelectorAll('.hm-npage')].map(s => Math.round(s.offsetLeft - t.offsetLeft)),
    left: t.scrollLeft,
  };
});
console.log('доріжка:', JSON.stringify(геометрія));
if (!геометрія) { await browser.close(); await stop(); process.exit(1); }

// Чекаємо, поки авто-крок ПОЧНЕТЬСЯ (прокрутка зрушила з місця).
const старт = геометрія.left;
let чекав = 0;
while (чекав < 20000) {
  const l = await page.evaluate(() => document.getElementById('hm-ntrack').scrollLeft);
  if (Math.abs(l - старт) > 4) { console.log(`авто-крок пішов на ${чекав}мс, left=${Math.round(l)}`); break; }
  await page.waitForTimeout(30);
  чекав += 30;
}

// Палець лягає на доріжку і їде ВГОРУ — так виглядає вертикальний скрол сторінки.
const cdp = await ctx.newCDPSession(page);
const x = геометрія.рамка.x + Math.round(геометрія.рамка.w / 2);
const y0 = геометрія.рамка.y + Math.round(геометрія.рамка.h / 2);
// 🔑 Саме `synthesizeScrollGesture` з `gestureSourceType: 'touch'`, а не
// `dispatchTouchEvent`: перша редакція приладу слала сирі дотики — і вони НЕ
// породжували жесту прокрутки (сторінка не зрушила ні на піксель), тобто прилад
// «доводив», що вади немає, просто не зробивши того, на що скаржиться Вова.
await cdp.send('Input.synthesizeScrollGesture', {
  x, y: y0, xDistance: 0, yDistance: 260, speed: 800,
  gestureSourceType: 'touch', preventFling: true,
});

const лог = await page.evaluate(() => ({ ...window.__лог, стрічка: undefined }));
console.log('події на доріжці:', JSON.stringify(лог));

// Дивимось, де доріжка СТАЛА і чи доїхала сама.
const слід = [];
for (let i = 0; i < 24; i++) {
  await page.waitForTimeout(150);
  const l = await page.evaluate(() => document.getElementById('hm-ntrack').scrollLeft);
  слід.push(Math.round(l));
}
console.log('слід після дотику:', слід.join(' '));

const кінець = слід[слід.length - 1];
const найближча = геометрія.точки.reduce((a, b) => Math.abs(b - кінець) < Math.abs(a - кінець) ? b : a);
console.log(`кінцеве left=${кінець} · найближча точка прилягання=${найближча} · розбіжність=${Math.abs(кінець - найближча)}px`);
console.log(Math.abs(кінець - найближча) > 4 ? '🔴 ЗАВИСЛА МІЖ КАРТКАМИ' : '✅ доїхала до картки');

const стрічка = await page.evaluate(() => window.__лог.стрічка);
const t0 = стрічка[0][0];
console.log('кадри (мс, left, paused, scrollY):');
console.log(стрічка.filter((r, i) => i % 3 === 0).map(r => `${r[0] - t0}:${r[1]}/${r[2]}/${r[3]}`).join(' '));

await browser.close();
await stop();
