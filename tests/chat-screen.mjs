// Стенд: ЕКРАН ПРИВАТНОГО ЧАТУ ПІД КЛАВІАТУРОЮ (справжній setupKeyboardResize +
// справжній style/messages.css у Chromium).
//
// 🔴 ПРИВІД — скарга Вови зі знімком (09.08): «відкриваю приватне повідомлення —
// чат підстрибує догори, клавіатури немає, а знизу просвічується минула сторінка».
//
// 🔑 ЩО МІРЯЄМО І ЧОМУ САМЕ ЦЕ.
// Корінь був не в «модалці поверх сторінки» (чат і до того був повноекранним шаром
// з власним стеком та історією), а в тому, що код ЗАДАВАВ ЕКРАНУ `height`. `.pm-screen`
// стоїть `top:0; bottom:0`, тобто сам собою накриває весь екран; задати `height` —
// єдиний спосіб зробити його коротшим. Тож будь-яка хиба у визначенні «клавіатура
// відкрита» неминуче відкривала сторінку під чатом.
// ➡️ Тому головна перевірка тут ОДНА і вона геометрична: **низ екрана чату завжди
//    збігається з низом вікна**, і у спокої, і з клавіатурою, і в «застряглому»
//    стані. Якщо це так — сторінка знизу не покажеться вже ніяк.
//
// ⚠️ visualViewport підмінюємо керованим об'єктом — той самий прийом, що в
//    `tests/keyboard.mjs`: iOS-клавіатуру Chromium не відтворює, але арифметику
//    модуля перевірити можна точно.
//
// ⚠️ ЧОГО СТЕНД НЕ ДОВОДИТЬ: як поводиться СПРАВЖНЯ клавіатура iOS. Що програмний
//    `focus()` не відкриває її без дії пальця — це властивість Safari, і перевірити
//    її можна лише на пристрої. Стенд стереже наслідок: навіть якщо стан визначено
//    хибно, екран лишається на весь viewport.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { ROOT, launch, projectFile, reporter } from './_lib.mjs';

const { ok, done } = reporter();

const css = readFileSync(`${ROOT}/style/messages.css`, 'utf8');
const CHAT_CORE = readFileSync(`${ROOT}/src/core/chat-core.js`, 'utf8');
// Витягуємо setupKeyboardResize; її єдина залежність — core/keyboard.js (нижче).
const fnSrc = /export function setupKeyboardResize[\s\S]*?\n}/.exec(CHAT_CORE)?.[0]
  ?.replace(/^export /, '') || '';
// 09.10: функція тепер стоїть на `attachKeyboardPad` з core/keyboard.js — підвантажуємо
// модуль цілком (імпортів у нього немає), прибравши `export`.
const KB_SRC = readFileSync(`${ROOT}/src/core/keyboard.js`, 'utf8').replace(/^export /gm, '');

const H = 844, W = 390, KB = 336;

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
:root { --board-bg: #EFEDE7; }
${css}
.pm-screen { transition: none !important; }
</style></head><body>
<div style="height:3000px"></div>
<div class="pm-screen visible" id="scr">
  <div class="pm-head">Чат</div>
  <div class="pm-stream" id="pm-stream" style="flex:1; overflow-y:auto;">
    <div style="height:2000px"></div>
  </div>
  <form class="pm-form"><input class="pm-input" id="inp"></form>
</div>
<script>
  // Керований visualViewport: висоту й зсув задаємо з тесту.
  const listeners = { resize: [], scroll: [] };
  window.__vv = { height: ${H}, offsetTop: 0, offsetLeft: 0, width: ${W},
    addEventListener: (t, f) => listeners[t]?.push(f),
    removeEventListener: (t, f) => { const a = listeners[t] || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); } };
  Object.defineProperty(window, 'visualViewport', { value: window.__vv, configurable: true });
  window.__fire = () => listeners.resize.forEach(f => f());
  ${KB_SRC}
  ${fnSrc}
  window.__cleanup = setupKeyboardResize(document.getElementById('scr'));
</script>
</body></html>`;

const browser = await launch(chromium);
const p = await (await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true })).newPage();
await p.setContent(PAGE);

ok('сцена: setupKeyboardResize вирізано з модуля', fnSrc.length > 200, `${fnSrc.length} символів`);
ok('сцена: чат стоїть на attachKeyboardPad (детектор коментарів)', /attachKeyboardPad\(/.test(fnSrc), 'не знайдено');

const зняти = () => p.evaluate(() => {
  const s = document.getElementById('scr');
  const r = s.getBoundingClientRect();
  const f = document.querySelector('.pm-form').getBoundingClientRect();
  const h = document.querySelector('.pm-head').getBoundingClientRect();
  return {
    верхШапки: Math.round(h.top),
    верх: Math.round(r.top), низ: Math.round(r.bottom),
    падінг: Math.round(parseFloat(getComputedStyle(s).paddingBottom) || 0),
    інлайнВисота: s.style.height || '(нема)',
    низКомпозера: Math.round(f.bottom),
  };
});

// ── 1. Спокій: клавіатури немає ─────────────────────────────────────────────
const спокій = await зняти();
ok('🔴 у спокої екран накриває вікно повністю',
   спокій.верх === 0 && спокій.низ === H, JSON.stringify(спокій));
ok('у спокої відступу під клавіатуру немає', спокій.падінг === 0, `${спокій.падінг}px`);

// ── 2. Клавіатура відкрита (фокус + видима область менша) ───────────────────
await p.evaluate((kb) => {
  document.getElementById('inp').focus();
  window.__vv.height = 844 - kb;
  window.__fire();
}, KB);
await p.waitForTimeout(120);
const зКлавою = await зняти();
ok('🔴 З КЛАВІАТУРОЮ екран ВСЕ ОДНО накриває вікно повністю (низ не піднявся)',
   зКлавою.верх === 0 && зКлавою.низ === H, JSON.stringify(зКлавою));
ok('🔴 клавіатура компенсована ВІДСТУПОМ, а не висотою',
   зКлавою.падінг === KB && зКлавою.інлайнВисота === '(нема)',
   `падінг ${зКлавою.падінг}px · inline height ${зКлавою.інлайнВисота}`);
ok('🔴 композер стоїть НАД клавіатурою',
   зКлавою.низКомпозера <= H - KB + 1, `низ композера ${зКлавою.низКомпозера}, клавіатура з ${H - KB}`);

// ── 3. «Застряглий» стан: область мала, але поле НЕ у фокусі ────────────────
// Саме цей стан і давав скріншот Вови: фокус був програмний, клавіатури не було.
await p.evaluate(() => { document.getElementById('inp').blur(); window.__fire(); });
await p.waitForTimeout(120);
const застряг = await зняти();
ok('🔴 без фокуса екран накриває вікно, навіть якщо vv.height лишився малим',
   застряг.верх === 0 && застряг.низ === H, JSON.stringify(застряг));

// ── 4. КОНТРОЛЬ: стара механіка (height) справді відкривала сторінку знизу ──
// Відтворюємо рівно те, що робив попередній код, і міряємо дірку.
const дірка = await p.evaluate((kb) => {
  const s = document.getElementById('scr');
  s.style.height = (844 - kb) + 'px';
  s.style.top = '0px';
  const r = s.getBoundingClientRect();
  const щілина = Math.round(844 - r.bottom);
  s.style.height = ''; s.style.top = '';
  return щілина;
}, KB);
ok('контроль: стара механіка лишала знизу дірку на висоту клавіатури',
   дірка === KB, `${дірка}px відкритої сторінки під чатом`);

// ── 4б. 🔴 «СПОСІБ Б» — ВСТАНОВЛЕНИЙ ДОДАТОК (знімок Вови 09.10) ─────────────
// iOS не стискає видиму область, а ЗСУВАЄ її вниз по розмітці на висоту клавіатури
// (`offsetTop`), `vv.height` не міняється. Стара формула давала 0 — і шапка чату
// їхала за верхній край. Видимо людині: розмітка від offsetTop до низу вікна.
await p.evaluate((kb) => {
  document.getElementById('inp').focus();
  window.__vv.height = 844; window.__vv.offsetTop = kb;
  window.__fire();
}, KB);
await p.waitForTimeout(120);
const б = await зняти();
ok('🔴 спосіб Б: шапка стоїть на верху ВИДИМОГО (не за краєм)', б.верхШапки === KB, `верх шапки ${б.верхШапки}, видиме з ${KB}`);
ok('🔴 спосіб Б: поле вводу — на низу видимої смуги, над клавіатурою', б.низКомпозера === H, `низ композера ${б.низКомпозера}`);
ok('спосіб Б: екран і далі на все вікно (урок 09.08)', б.верх === 0 && б.низ === H && б.інлайнВисота === '(нема)', JSON.stringify(б));
await p.evaluate(() => { document.getElementById('inp').blur(); window.__vv.offsetTop = 0; window.__fire(); });
await p.waitForTimeout(120);
const після = await зняти();
ok('клавіатура сховалась → шапка на місці, відступів нема', після.верхШапки === 0 && після.падінг === 0, JSON.stringify(після));

// ── 5. Автофокуса при відкритті чату більше немає ───────────────────────────
// 🔑 Це ТРИГЕР усієї історії: iOS відкриває клавіатуру лише у відповідь на дію
// пальця, а програмний focus() робить поле focused БЕЗ клавіатури — і механіка
// вирішувала, що клавіатура є.
{
  const BOARD_CHAT = projectFile('src/tabs/board-chat.js');
  // ⚠️ Функція зветься `openChat`, а НЕ `openChatModal` (той — у Обговореннях,
  //    інший файл). Перша редакція цієї перевірки шукала неправильну назву,
  //    отримувала порожній рядок — і сусідня перевірка «автофокуса немає»
  //    проходила ВХОЛОСТУ на порожньому тексті. Тому тут стоїть окрема перевірка
  //    сцени: без неї весь блок був би самообманом.
  const відкриття = /export async function openChat\([\s\S]*?\n}/.exec(BOARD_CHAT)?.[0] || '';
  ok('сцена: тіло openChat знайдено', відкриття.length > 2000, `${відкриття.length} символів`);
  // ⚠️ Шукаємо САМЕ автофокус — `input.focus()` у таймері. Інші `input.focus()`
  //    у цій функції законні й потрібні: вони стоять у відповідь на дію пальця
  //    (відповісти на повідомлення, редагувати, прикріпити фото) — там клавіатура
  //    і має відкритись. Перша редакція повідомлення цього не розрізняла і писала
  //    «знайдено автофокус» на зеленій перевірці.
  const автофокус = /setTimeout\([^)]*input\.focus\(\)/.test(відкриття);
  ok('🔴 чат НЕ фокусує поле сам при відкритті',
     !автофокус,
     автофокус ? '🔴 input.focus() у таймері — це автофокус'
               : 'автофокуса немає (решта focus() — від дії пальця)');
}

// ── 6. Компʼютер: екранної клавіатури нема — механіка мовчить ───────────────
// Чат на компʼютері відкритий у колонці; вікно, зменшене з курсором у полі, не має
// читатись як «клавіатура» (інакше шапка й поле стрибнули б від зміни розміру вікна).
{
  const d = await browser.newPage({ viewport: { width: 1280, height: H } });
  await d.setContent(PAGE);
  const пк = await d.evaluate((kb) => {
    document.getElementById('inp').focus();
    window.__vv.height = 844 - kb; window.__fire();
    const s = document.getElementById('scr');
    return { pb: s.style.paddingBottom || '', pt: s.style.paddingTop || '' };
  }, KB);
  ok('🖥 компʼютер: менше вікно з курсором у полі — без відступів', !пк.pb && !пк.pt, JSON.stringify(пк));
}

await browser.close();
done();
