// tests/carousel-hang.mjs — ПЕРЕРВАНИЙ АВТО-КРОК ДОКОЧУЄТЬСЯ, А НЕ ЗАВИСАЄ.
//
// 🗣️ Скарга Вови 19.09: «якщо блок автоматично проскролюється і в цей момент я
// вертикально скролю сторінку, і попадає саме на той блок — відбувається типу як
// натиск, і блок зависає на середині між двома карточками… Він має доскролитись до
// кінця. Він не має реагувати на рух, коли я вертикально скролю сторінку».
//
// 🔑 ДВІ РІЗНІ ВИМОГИ, І СТЕРЕЖУТЬСЯ ВОНИ ОКРЕМО:
//   А) перерваний крок МУСИТЬ доїхати до картки (блоки 1-2);
//   Б) вертикальний жест НЕ МУСИТЬ глушити карусель, а горизонтальний — мусить (3-4).
// Без Б перша вимога здобувається «ніколи не ставити паузу», без А друга — «ніколи не
// рухатись». Тому обидві сторони тут стоять як зустрічні межі одна одній.
//
// 🛑 ЧЕСНО ПРО МЕЖУ ЦЬОГО СТЕНДА — ЩО САМЕ ТУТ ПІДРОБЛЕНО І ЧОМУ.
// Гасить плавну прокрутку САМ БРАУЗЕР, коли доріжки торкнувся палець. Відтворити це
// в headless не вдалось, і це не здогад: `tests/tools/carousel-hang-probe.mjs`
// 📐 показав, що ні `Input.dispatchTouchEvent`, ні `Input.synthesizeScrollGesture`
// із `gestureSourceType: 'touch'` тут ВЗАГАЛІ не прокручують сторінку (`.app-main`
// стояв на 53px від початку й до кінця прогону), тобто компонувальник дотику не
// бачить. Прилад, що шле такий дотик, «довів» би відсутність вади, просто не зробивши
// того, на що скаржаться.
// ➡️ Тому стенд відтворює НАСЛІДОК, а не спосіб: гасить плавну прокрутку тим самим,
// чим її гасить рушій, — миттєвим `scrollTo` у поточну точку. Далі все справжнє:
// доріжка стоїть між картками, і питання рівно те саме — чи докотить її наш код.
// Дотик при цьому шлеться теж справжній (через CDP), бо гілку паузи має пройти саме він.

import { chromium } from 'playwright';
import { chromiumPath, serve, reporter, projectFile } from './_lib.mjs';

const { ok, done } = reporter();
const REV = process.env.BUNDLE_REV || '';

const { url, stop } = await serve();
const executablePath = chromiumPath();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });

async function сцена() {
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
  // ⚠️ Поза екраном модуль навмисно СПИТЬ (`IntersectionObserver`). Міряти сплячий
  // блок означало б заміряти власний запобіжник — на цьому вже спіймався сторож
  // віджета Стрічки 25.08.
  await page.evaluate(() => document.getElementById('hm-ntrack')
    ?.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForTimeout(500);
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, cdp };
}

const ГЕО = (page) => page.evaluate(() => {
  const t = document.getElementById('hm-ntrack');
  if (!t) return null;
  const r = t.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
           слайдів: t.querySelectorAll('.hm-npage').length,
           точки: [...t.querySelectorAll('.hm-npage')].map(s => Math.round(s.offsetLeft - t.offsetLeft)),
           left: Math.round(t.scrollLeft), пауза: t.dataset.paused || '-' };
});

const LEFT = (page) => page.evaluate(() => Math.round(document.getElementById('hm-ntrack').scrollLeft));

// Дочекатись, поки авто-крок ЗРУШИВ доріжку з місця.
async function дочекатисьКроку(page, мс = 20000) {
  const старт = await LEFT(page);
  for (let t = 0; t < мс; t += 30) {
    const l = await LEFT(page);
    if (Math.abs(l - старт) > 4) return { пішов: true, мс: t, left: l, старт };
    await page.waitForTimeout(30);
  }
  return { пішов: false, мс, left: старт, старт };
}

const відхилення = (точки, left) =>
  Math.min(...точки.map(p => Math.abs(p - left)));

// ── 0. ПРИЛАД БАЧИТЬ ТЕ, ЩО ЗАЯВЛЯЄ ──────────────────────────────────────────
// 🔴 Без цього блоку решта нічого не варта: на нерухомій (чи відсутній) каруселі
// «доїхала до картки» було б ІСТИННИМ над порожнечею.
const { ctx, page, cdp } = await сцена();
const гео = await ГЕО(page);
ok('прилад бачить доріжку новин і її картки',
   !!гео && гео.слайдів > 1, гео ? `сторінок ${гео.слайдів}, точки ${гео.точки.join('/')}` : 'доріжки немає');

// ── 1-2. 🔴 ГОЛОВНЕ: ПЕРЕРВАНИЙ КРОК ДОКОЧУЄТЬСЯ ─────────────────────────────
//
// 🛑 ПЕРША РЕДАКЦІЯ ЦИХ ДВОХ БЛОКІВ БРЕХАЛА, І ВАРТО ЗНАТИ ЯК. Вона гасила плавну
// прокрутку миттєвим `scrollTo` у поточну точку — і `scroll-snap-type: x mandatory`
// ОДРАЗУ ж повертав доріжку на картку, бо для рушія це звичайна програмна прокрутка,
// після якої прилягання обовʼязкове. 📐 Прогін показав `left 0→0`: «зависання», яке
// стенд мав відтворити, не наставало НІКОЛИ, і перевірка «докотився» була зелена і на
// старому коді (контроль `BUNDLE_REV=origin/main`: 5/7, обидва блоки зелені дарма).
// 🔑 Саме тим ця вада й тримається в житті: погашена ПАЛЬЦЕМ анімація прилягання не
// запускає — для рушія прокрутки не було, отже й доліплювати нема чого.
//
// ✅ ТОМУ МІРЯЄМО НЕ ПОЛОЖЕННЯ, А НАМІР: чи видасть модуль ЩЕ ОДИН `scrollTo` туди ж,
// куди вів урваний крок. Саме це і є вся правка; доїхати далі — вже робота браузера.
// Стан «доріжка стоїть між картками» ставиться прямо: `scrollLeft` підміняється
// геттером. Підміна СУВОРІША за життя (положення пришпилене намертво), а не добріша.
const шлях = await page.evaluate(() => new Promise(res => {
  const t = document.getElementById('hm-ntrack');
  window.__scrollTo = [];
  const рідний = t.scrollTo.bind(t);
  t.scrollTo = (...a) => {
    window.__scrollTo.push(a[0] && a[0].left != null ? Math.round(a[0].left) : null);
    return рідний(...a);
  };
  const t0 = performance.now();
  const кадр = () => {
    if (window.__scrollTo.length) { res({ пішов: true, мс: Math.round(performance.now() - t0), ціль: window.__scrollTo[0] }); return; }
    if (performance.now() - t0 > 20000) { res({ пішов: false, мс: 20000, ціль: null }); return; }
    requestAnimationFrame(кадр);
  };
  requestAnimationFrame(кадр);
}));
ok('авто-крок справді стартує — є що переривати',
   шлях.пішов, шлях.пішов ? `крок на ${шлях.мс}мс, ціль left=${шлях.ціль}` : 'кроку не було');

const попередня = гео.точки.filter(p => p < шлях.ціль).pop() ?? 0;
const посередині = Math.round(попередня + (шлях.ціль - попередня) * 0.4);

// Рвемо крок і лишаємо доріжку МІЖ картками — так, як її лишає погашена пальцем анімація.
await page.evaluate((де) => {
  const t = document.getElementById('hm-ntrack');
  Object.defineProperty(t, 'scrollLeft', { configurable: true, get: () => де, set: () => {} });
  window.__scrollTo.length = 0;
}, посередині);

ok('🛑 КОНТРОЛЬ: доріжка справді стоїть МІЖ картками',
   відхилення(гео.точки, посередині) > 4,
   `left=${посередині}, до найближчої картки ${відхилення(гео.точки, посередині)}px (картки ${гео.точки.join('/')})`);

// Палець проходить по доріжці ВЕРТИКАЛЬНО — людина гортає сторінку.
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: гео.x, y: гео.y }] });
for (let i = 1; i <= 5; i++) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: гео.x, y: гео.y - i * 16 }] });
  await page.waitForTimeout(16);
}
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(700);

const докотив = await page.evaluate(() => window.__scrollTo.slice());
ok('🔴 перерваний крок ДОКОЧУЄТЬСЯ — модуль веде доріжку туди ж, куди вів',
   докотив.includes(шлях.ціль),
   докотив.length ? `нові прокрутки: ${докотив.join(', ')} (ціль ${шлях.ціль})` : `жодної прокрутки — доріжка лишилась на ${посередині}`);
ok('🛑 докотився ВПЕРЕД, а не відкотився назад до тієї ж картки',
   !докотив.includes(попередня),
   `попередня картка left=${попередня}, видані прокрутки: ${докотив.join(', ') || '—'}`);
await ctx.close();

// ── 3-4. ЧИЙ ЦЕ ЖЕСТ ─────────────────────────────────────────────────────────
// Тут дотик уже не підроблюється нічим: перевіряється наша ж обробка подій.
async function жест(dx, dy) {
  const { ctx, page, cdp } = await сцена();
  const г = await ГЕО(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: г.x, y: г.y }] });
  for (let i = 1; i <= 5; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: г.x + dx * i, y: г.y + dy * i }] });
    await page.waitForTimeout(16);
  }
  const пауза = await page.evaluate(() => document.getElementById('hm-ntrack').dataset.paused || '-');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await ctx.close();
  return пауза;
}

const вертикальний = await жест(0, -16);
ok('🔴 ВЕРТИКАЛЬНИЙ жест (людина гортає сторінку) карусель НЕ глушить',
   вертикальний !== '1', `paused="${вертикальний}"`);

// Зустрічна межа: «не глушить» легко здобути тим, щоб не глушити НІКОЛИ — і тоді
// доріжка їхала б під самим пальцем людини, яка її гортає.
const горизонтальний = await жест(16, 0);
ok('🛑 ГОРИЗОНТАЛЬНИЙ жест (людина гортає доріжку) карусель глушить',
   горизонтальний === '1', `paused="${горизонтальний}"`);

await browser.close();
await stop();
done();
