// Стенд №27: ЖЕСТ, ЯКИЙ БУВ ПРОКРУТКОЮ, НЕ СТАЄ ЗАКРИТТЯМ.
//
// Скарга Вови 30.07 зі скріншотом: «якщо скролю донизу і не відпускаючи палець від
// екрану починаю скролити до верху, то верхня шапка починає відриватись від верху
// модалки» (лист подачі оголошення, iPhone).
//
// 🔴 ЩО САМЕ МІРЯЄМО, І ЧОМУ НЕ «ЧИ ВІДРИВАЄТЬСЯ ШАПКА».
// Відрив — це наслідок на iOS WebKit: `transform` на скролері зі `position: sticky`
// дітьми рве їх від тіла. Chromium цього НЕ відтворює (як і гумовий відскок), тож
// міряти сам відрив тут неможливо — вийшла б перевірка, яка завжди зелена й нічого
// не варта. Тому міряємо ПРИЧИНУ, яку відтворити можна точно: **чи ставиться
// `transform` на аркуш у жесті, що починався як прокрутка**. Немає transform —
// немає й того, що його рве.
//
// ⚠️ ГАНЯЄМО СПРАВЖНІЙ `src/core/modal.js` (через локальний сервер і живий
// ES-імпорт), а не копію логіки. Копія тут була б особливо шкідлива: саме цю
// механіку вже двічі правили, і копія лишилась би зеленою після відкату.
//
// ⚠️ ЧОГО СТЕНД НЕ ПОКРИВАЄ: чи ПРИЄМНО це пальцем на iPhone. Наслідок правки —
// граб за шапку прокрученого аркуша більше не закриває одразу (спершу палець
// дотягне контент до верху). Чи це «ок» — вирішує Вова на телефоні.
import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';

const { ok, done } = reporter();
const { url, stop } = await serve();
const browser = await launch(chromium);
const pg = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });

const errors = [];
pg.on('pageerror', e => errors.push(e.message.slice(0, 160)));

// Живий примітив + аркуш, у якого є ЩО прокручувати і є sticky-шапка (як лист подачі).
// Порожня сторінка з ОРІGIN сервера — щоб живий ES-імпорт із того ж походження
// не спіткнувся об політику. `setContent` лишає about:blank, тому спершу goto на корінь.
await pg.goto(url + '/', { waitUntil: 'domcontentloaded' });
await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%;overflow:hidden}
  .app-modal{position:fixed;inset:0;display:flex;align-items:flex-end}
  .app-modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.4)}
  .app-modal-sheet{position:relative;width:100%;max-height:90svh;overflow-y:auto;background:#fff;padding:0 18px}
  .app-modal-handle{position:sticky;top:0;z-index:6;height:24px;background:#eee}
  .app-modal-body p{margin:14px 0}
</style></head><body></body></html>`);

// Імпортуємо РЕАЛЬНИЙ модуль із локального сервера.
const imported = await pg.evaluate(async (base) => {
  try {
    const m = await import(base + '/src/core/modal.js');
    window.__openModal = m.openModal;
    return true;
  } catch (e) { return String(e).slice(0, 200); }
}, url);
ok('справжній core/modal.js завантажився', imported === true,
   imported === true ? 'живий модуль, не копія' : `🔴 ${imported}`);
if (imported !== true) { await browser.close(); await stop(); done(); }

await pg.evaluate(() => {
  window.__openModal({
    variant: 'sheet',
    bodyHtml: '<p>рядок</p>'.repeat(60),
    className: 'app-modal--board-compose',
  });
});
await pg.waitForTimeout(120);

// Ловимо КОЖНЕ значення transform, яке код виставляє на аркуш, — через MutationObserver
// по атрибуту style. Так ми бачимо навіть те, що потім затерли.
await pg.evaluate(() => {
  const p = document.querySelector('.app-modal-sheet');
  window.__seen = [];
  new MutationObserver(() => {
    const t = p.style.transform;
    if (t) window.__seen.push(t);
  }).observe(p, { attributes: true, attributeFilter: ['style'] });
});

// Один НЕПЕРЕРВНИЙ жест: тягнемо палець УГОРУ (контент скролиться донизу),
// потім, не відпускаючи, розвертаємось УНИЗ. Саме те, що описав Вова.
// 🔴 ТОЧНИЙ СЦЕНАРІЙ ВОВИ — і він НЕ такий, як я спершу написав.
// Перша версія стенда стартувала палець у тілі вже прокрученого аркуша — і контроль
// показав, що там нічого не рухається НАВІТЬ без замка. Причина: у `touchstart` стоїть
// `if (!inHeader && panel.scrollTop > 0) return`, тобто жест у тілі прокрученого аркуша
// взагалі не починається. Тобто мій сценарій не відтворював баг, і перевірка №1 була б
// «зеленою» ні про що.
// Справжній шлях: палець стартує НА ВЕРХУ (scrollTop = 0, жест починається) → тягне
// вгору, нативний скрол прокручує контент → палець розвертається вниз, поки контент
// іще прокручений → контент доїжджає до верху ПОСЕРЕД жесту. Саме в цю мить старий код
// ставив transform на скролер зі sticky-дітьми.
// ⚠️ `scrollTop` рухаємо руками: синтетичні touch-події нативний скрол не запускають.
async function oneGesture({ scrollFirst }) {
  await pg.evaluate(() => {
    const p = document.querySelector('.app-modal-sheet');
    p.style.transform = '';
    p.scrollTop = 0;          // жест ЗАВЖДИ починається з верху — інакше він не почнеться
    window.__seen = [];
  });

  const send = (type, y) => pg.evaluate(({ type, y }) => {
    const p = document.querySelector('.app-modal-sheet');
    const t = new Touch({ identifier: 1, target: p, clientX: 195, clientY: y });
    p.dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true,
      touches: type === 'touchend' ? [] : [t],
      changedTouches: [t], targetTouches: type === 'touchend' ? [] : [t],
    }));
  }, { type, y });
  const setScroll = (v) => pg.evaluate((v) => { document.querySelector('.app-modal-sheet').scrollTop = v; }, v);

  await send('touchstart', 400);
  if (scrollFirst) {
    await send('touchmove', 340);   // палець угору = прокрутка донизу
    await setScroll(200);           // нативний скрол відпрацював
    await send('touchmove', 300);
    await send('touchmove', 360);   // РОЗВОРОТ униз, контент іще прокручений
    await send('touchmove', 420);
    await setScroll(0);             // контент доїхав до верху ПОСЕРЕД жесту
  }
  await send('touchmove', 480);
  await send('touchmove', 540);
  await send('touchmove', 600);
  const seen = await pg.evaluate(() => window.__seen.filter(t => t && t !== 'none'));
  await send('touchend', 600);
  return seen;
}

// ── 1) ГОЛОВНЕ: жест, що починався як прокрутка, НЕ рухає аркуш ──────────────
const afterScroll = await oneGesture({ scrollFirst: true });
ok('жест «прокрутив і розвернувся» НЕ ставить transform на аркуш',
   afterScroll.length === 0,
   afterScroll.length === 0 ? 'transform не застосовано ані разу'
     : `🔴 застосовано ${afterScroll.length}: ${afterScroll.slice(0, 3).join(' · ')}`);

// ── 2) ЗВОРОТНЕ: чистий свайп донизу з верху МУСИТЬ працювати ───────────────
// Без цього перша перевірка «зелена» навіть якщо ми зламали закриття зовсім.
const cleanSwipe = await oneGesture({ scrollFirst: false });
ok('чистий свайп з верху аркуша ЗАКРИВАЄ (transform ставиться)',
   cleanSwipe.some(t => /translateY\(\s*[1-9]/.test(t)),
   cleanSwipe.length ? cleanSwipe.slice(0, 2).join(' · ') : '🔴 transform не застосовано — закриття зламано');

// ── 3) СТОРОЖ ПРИСУТНОСТІ: замок на місці і знімається на новому жесті ──────
// 🔴 10.08 — ЖЕСТ ПЕРЕЇХАВ У `core/sheet-motion.js` (`attachSheetDismiss`), і цей
// стенд разом із ним. Причина переїзду: хаб «Збережені» будує власний аркуш із
// рисочкою-грабером, тобто з обіцянкою свайпу, але жесту не мав; копія ~50 рядків
// у другому файлі була б тією самою помилкою, від якої застерігає весь проєкт.
// ⚠️ Перевірки 1-2 вище (живі жести) переїзд НЕ помітили — і це правильно, вони
// міряють поведінку. Впали рівно ті, що трималися за ІМʼЯ ФАЙЛУ; той самий клас,
// що `zoneCss()` у стилях Дошки.
const ЖЕСТ = '/src/core/sheet-motion.js';
const src = await pg.evaluate(async ([base, f]) => (await fetch(base + f)).text(), [url, ЖЕСТ]);
const has = (re, label) => ok(label, re.test(src), re.test(src) ? 'на місці' : '🔴 ВІДСУТНЄ');
has(/wasScrolling/, 'замок `wasScrolling` існує');
// ⚠️ Вікна взяті з ЗАМІРУ, а не «на око»: між `touchstart` і скиданням лежить
// пояснювальний комент (385 символів після переїзду), а між `scrollTop > 0` і
// встановленням замка — 822. Перша версія стенда впала саме на завузькому вікні,
// тобто хибним був критерій, а не код.
has(/touchstart[\s\S]{0,900}wasScrolling\s*=\s*false/,
    'замок скидається на touchstart (інакше аркуш перестав би закриватись назавжди)');
has(/scroller\.scrollTop\s*>\s*0\s*\)\s*\{[\s\S]{0,1000}wasScrolling\s*=\s*true/,
    'замок ставиться саме при scrollTop > 0');

// ── 4) КОНТРОЛЬ: без замка transform МУСИТЬ застосуватись ───────────────────
// 🔴 Без цього блоку перевірка №1 нічого не доводить: «transform не застосовано» була б
// зеленою і в разі, якби жести взагалі не доходили до коду. Тому синтезуємо СТАРУ версію
// модуля (прибираємо рядок замка), імпортуємо її і проганяємо той самий жест.
// Відносні імпорти переписуємо на абсолютні — інакше blob-модуль їх не розрішить.
// ⚠️ Тепер синтез двоступеневий: замок живе в `sheet-motion.js`, а `openModal`
// — у `modal.js`. Тому спершу робимо ЗЛАМАНУ копію модуля жесту, а тоді
// підсовуємо її `modal.js`, переписавши в ньому саме цей імпорт на blob.
const ctl = await pg.evaluate(async ([base, f]) => {
  const rawMotion = await (await fetch(base + f)).text();
  const brokenMotion = rawMotion.replace(/\n\s*if \(wasScrolling\) \{[^\n]*\n/, '\n');
  if (/if \(wasScrolling\)/.test(brokenMotion)) return 'не вдалось прибрати замок — регулярка не збіглась';
  const motionUrl = URL.createObjectURL(new Blob([brokenMotion], { type: 'text/javascript' }));
  const rawModal = await (await fetch(base + '/src/core/modal.js')).text();
  const old = rawModal
    .replace(/from '\.\/sheet-motion\.js'/, `from '${motionUrl}'`)
    .replace(/from '\.\/([\w.-]+)'/g, `from '${base}/src/core/$1'`);
  if (!old.includes(motionUrl)) return 'не вдалось підмінити імпорт sheet-motion';
  const u = URL.createObjectURL(new Blob([old], { type: 'text/javascript' }));
  try {
    const m = await import(u);
    window.__openOld = m.openModal;
    return true;
  } catch (e) { return String(e).slice(0, 200); }
}, [url, ЖЕСТ]);

if (ctl === true) {
  await pg.evaluate(() => {
    document.querySelector('.app-modal')?.remove();
    window.__openOld({ variant: 'sheet', bodyHtml: '<p>рядок</p>'.repeat(60), className: 'app-modal--board-compose' });
  });
  await pg.waitForTimeout(120);
  await pg.evaluate(() => {
    const p = document.querySelector('.app-modal-sheet');
    window.__seen = [];
    new MutationObserver(() => { const t = p.style.transform; if (t) window.__seen.push(t); })
      .observe(p, { attributes: true, attributeFilter: ['style'] });
  });
  const oldSeen = await oneGesture({ scrollFirst: true });
  ok('контроль: БЕЗ замка той самий жест рухає аркуш',
     oldSeen.length > 0,
     oldSeen.length > 0
       ? `старий код застосував transform ${oldSeen.length} раз(и): ${oldSeen.slice(0, 2).join(' · ')} — саме це й рвало шапку`
       : '🔴 і без замка нічого не рухається — стенд міряє не те');
} else {
  ok('контроль: синтезовано версію без замка', false, `🔴 ${ctl}`);
}

ok('без помилок у консолі', errors.length === 0, errors.join(' | ') || 'чисто');

await browser.close();
await stop();
done();
