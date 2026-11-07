// tests/comment-sheet-close.mjs — ЛИСТ КОМЕНТАРІВ НЕ ЗАКРИВАЄТЬСЯ ВІД ТАПУ ПО КНОПЦІ.
// Заведено 15.08.2026 на скаргу Вови.
//
// 🔴 ЩО САМЕ ОХОРОНЯЄМО. Слова Вови: «пишу коментар, натискаю "Відповісти"… натискаю
// "Відповісти" знову, і чомусь згортається модалка коментарів».
// Корінь (заміряно `tests/tools/click-target-probe.mjs`, дотики справжні через CDP):
//   1) `blur` поля повертає лист із повної висоти у висоту спокою — ≈150px при 844;
//   2) кнопки списку — звичайні `<button>`, тож дотик до них САМ забирає фокус,
//      тобто запускає (1) у мить, коли палець уже на кнопці;
//   3) кнопка їде вниз з-під пальця, під ним опиняється `.fd-sheet-vp`, і стара
//      умова закриття читала це як «тап повз лист».
// Заміряно на моделі: кнопка top 462 → 662, під пальцем `vp`, лист закрився б.
//
// 🔑 СТЕНД ГАНЯЄ СПРАВЖНІЙ КОД: обидві функції беруться з `src/tabs/feed.js`
// текстом і виконуються. Копія тут перевіряла б саму себе, а не те, що поїде на прод.
//
// ⚠️ ЧОМУ ДОТИКИ, А НЕ МИША: перша редакція приладу-розвідника ганяла мишу і
// показала «click не генерується» — тобто МАЛО НЕ ЗАКРИЛА розслідування хибним
// висновком. У Вови сенсорний екран; touch і mouse дають `click` різними шляхами.
// **18-й випадок брехливої мірки в проєкті.**
import { chromium } from 'playwright';
import { launch, reporter, projectFile } from './_lib.mjs';

const { ok, done } = reporter();

// Контроль (доведення падінням) — версія feed.js ДО фікса:
//   BUNDLE_REV=origin/main node tests/comment-sheet-close.mjs
const REV = process.env.BUNDLE_REV || '';
const SRC = projectFile('src/tabs/feed.js', REV);
// 🆕 07.11 — `keepFocusOnButtons` тепер лише кличе `keepKeyboardOnTapIn` з
// `core/keyboard.js`, тож механіку тапу вклеюємо звідти ж (тієї самої ревізії).
const KB = projectFile('src/core/keyboard.js', REV);

// ── Витягуємо дві функції з живого файлу ──────────────────────────────────────
// Якщо їх немає (стара версія) — підставляємо ТУ САМУ логіку, що була до фікса.
// Так контрольний прогін міряє справжню стару поведінку, а не «функції не знайшлись».
function grab(name, SRC_ = SRC) {
  const i = SRC_.indexOf(`function ${name}(`);
  if (i < 0) return null;
  let d = 0, started = false;
  for (let j = i; j < SRC_.length; j++) {
    if (SRC_[j] === '{') { d++; started = true; }
    else if (SRC_[j] === '}') { d--; if (started && d === 0) return SRC_.slice(i, j + 1); }
  }
  return null;
}
const LEGACY_CLOSE = `function attachBackdropClose(back, vpEl, close) {
  back.addEventListener('click', e => { if (e.target === back || e.target === vpEl) close(); });
}`;
const backdropFn = grab('attachBackdropClose') || LEGACY_CLOSE;
const focusFn    = grab('keepFocusOnButtons')  || 'function keepFocusOnButtons() {}';
const FIXED = !!grab('attachBackdropClose') && !!grab('keepFocusOnButtons');
// Константи й функції тапу з keyboard.js. Стара `keepFocusOnButtons` їх не кличе,
// тож на старій ревізії вони просто лежать без діла.
const kbConst = (n) => (KB.match(new RegExp(`const ${n} = [^;]+;`)) || [''])[0];
const kbFns = [kbConst('TAP_SLOP'), kbConst('SCROLL_QUIET_MS'),
  grab('wireTap', KB), grab('keepKeyboardOnTapIn', KB)].filter(Boolean).join('\n');
const SCROLL_GUARD = !!kbConst('SCROLL_QUIET_MS');
console.log(`\n── код: ${FIXED ? 'З ФІКСОМ' : '🕰 СТАРИЙ (контроль)'}${REV ? `  [${REV}]` : ''}`);

const html = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  #back{position:fixed;inset:0;background:rgba(0,0,0,.4)}
  #vp{position:fixed;inset:0}
  /* Аркуш прибитий до низу — рівно як .fd-com-sheet */
  #sheet{position:absolute;left:0;right:0;bottom:0;background:#fff;height:var(--h,700px);
         display:flex;flex-direction:column}
  #list{flex:1;overflow-y:auto}
  .row{padding:18px;border-bottom:1px solid #eee}
  button{padding:10px 16px;font:16px system-ui}
  #bar{padding:10px;display:flex;gap:8px}
  #input{flex:1;font:16px system-ui;padding:8px}
</style>
<div id="back"><div id="vp"><div id="sheet">
  <div id="list"></div>
  <div id="bar"><input id="input" placeholder="Додати коментар…"><button id="send">↑</button></div>
</div></div></div>
<script>
${backdropFn}
${kbFns}
${focusFn}
window.__state = { closed: false, replied: 0, pdOnButton: null, pdOnInput: null };
const back = document.getElementById('back'), vp = document.getElementById('vp');
const sheet = document.getElementById('sheet'), list = document.getElementById('list');
list.innerHTML = Array.from({length: 12}, (_, i) =>
  '<div class="row">Коментар ' + i + ' <button class="reply">Відповісти</button></div>').join('');
list.addEventListener('click', e => { if (e.target.closest('.reply')) {
  window.__state.replied++;
  if (!e.isTrusted) window.__progClicks = (window.__progClicks || 0) + 1;   // натиск із коду (wireTap)
} });

attachBackdropClose(back, vp, () => { window.__state.closed = true; });
keepFocusOnButtons(sheet);

// Спостерігачі: чи скасовано перенесення фокуса.
sheet.addEventListener('pointerdown', e => {
  if (e.target.closest('button')) window.__state.pdOnButton = e.defaultPrevented;
  if (e.target.id === 'input')    window.__state.pdOnInput  = e.defaultPrevented;
});

// Те, що робить blur поля: лист повертається з повної висоти у висоту спокою.
// 🍎 МОДЕЛЬ iOS (07.11). Chromium сам тримає фокус, якщо на \`pointerdown\` стоїть
// \`preventDefault\`, — тому старі ліки тут зеленіли, а на айфоні Вови ні. iOS
// переносить фокус на мишачих подіях ПІСЛЯ \`touchend\`, і зупиняє це лише
// \`preventDefault\` на самому \`touchend\`. Модель рівно така: дотик до кнопки
// закінчився, і ніхто його не перехопив → поле втрачає фокус (клавіатура ховається).
window.addEventListener('touchend', e => {
  if (e.defaultPrevented || !e.target.closest || !e.target.closest('button')) return;
  const a = document.activeElement;
  if (a && a.id === 'input') { a.blur(); window.__state.kbHidden = true; }
});
window.__shrink = () => sheet.style.setProperty('--h', '520px');
window.__reset = () => {
  sheet.style.setProperty('--h', '700px');
  window.__state = { closed: false, replied: 0, pdOnButton: null, pdOnInput: null };
};
window.__geom = () => {
  const r = document.querySelector('.reply').getBoundingClientRect();
  return { top: Math.round(r.top) };
};
</script>`;

const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
await p.setContent(html);
const cdp = await ctx.newCDPSession(p);
await p.waitForTimeout(60);

// ⚠️ ПАСТКА, В ЯКУ ЦЕЙ СТЕНД УЖЕ ВПАВ: `.fd-sheet-vp` має `inset: 0`, тобто його
// «центр» за `boundingBox()` лежить УСЕРЕДИНІ аркуша, а не над ним. Перший прогін
// через це показав «справжній тап повз лист не закриває» і звинуватив справний код.
// Тому точка «повз лист» задається ЯВНО — вище верхнього краю аркуша.
const AWAY = { x: 195, y: 60 };

// Один дотик: натиск у точці `from`, необов'язкова зміна розкладки, відпускання
// у ТІЙ САМІЙ точці екрана (палець не рухався — рухався інтерфейс).
// `from` — або селектор (беремо центр елемента), або готова точка {x, y}.
async function tap(from, mutate) {
  await p.evaluate(() => window.__reset());
  let x, y;
  if (typeof from === 'string') {
    const box = await p.locator(from).first().boundingBox();
    x = box.x + box.width / 2; y = box.y + box.height / 2;
  } else { x = from.x; y = from.y; }
  const before = await p.evaluate(() => window.__geom());
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  if (mutate) { await p.evaluate(() => window.__shrink()); await p.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(60);
  const after = await p.evaluate(() => window.__geom());
  const st = await p.evaluate(() => window.__state);
  return { ...st, moved: after.top - before.top };
}

// 1. КОНТРОЛЬ ПРИЛАДУ: звичайний тап по кнопці. Якщо тут щось не так — усе решта
//    нічого не доводить (перевірка мусить спершу довести, що вона взагалі працює).
const plain = await tap('.reply', false);
ok('КОНТРОЛЬ: звичайний тап по кнопці спрацьовує', plain.replied === 1, `спрацювань: ${plain.replied}`);
ok('КОНТРОЛЬ: звичайний тап по кнопці не закриває лист', plain.closed === false);

// 2. 🔴 ГОЛОВНЕ: розкладка зсунулась під пальцем — лист МУСИТЬ ВИЖИТИ.
const shifted = await tap('.reply', true);
console.log(`   кнопка поїхала на ${shifted.moved}px під пальцем`);
ok('🔴 лист НЕ закривається, коли аркуш стиснувся під пальцем',
   shifted.closed === false, shifted.closed ? 'ЗАКРИВСЯ — це і є баг Вови' : 'вижив');
ok('зсув справді відбувся (інакше перевірка вище нічого не доводить)',
   shifted.moved > 40, `${shifted.moved}px`);

// 3. Основну функцію не зламали: справжній тап повз лист ЗАКРИВАЄ.
const away = await tap(AWAY, false);   // точка НАД аркушем, див. коментар до AWAY
ok('справжній тап повз лист закриває його', away.closed === true);

// 4. Половинчасті жести не закривають: почався на кнопці — закінчився повз, і навпаки.
//    Саме це й відрізняє намір «закрити» від зсуву інтерфейсу під пальцем.
await p.evaluate(() => window.__reset());
{
  const bBox = await p.locator('.reply').first().boundingBox();

  // почався на кнопці → відпустили над порожнечею
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart',
    touchPoints: [{ x: bBox.x + bBox.width / 2, y: bBox.y + bBox.height / 2, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(40);
  await p.evaluate(() => { window.__state.closed = false; });

  // почався над порожнечею → відпустили на кнопці
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart',
    touchPoints: [{ x: AWAY.x, y: AWAY.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(40);
}

// 5. РУБІЖ 2: кнопки не забирають фокус, поле — забирає.
const onBtn = await tap('.reply', false);
ok('РУБІЖ 2: тап по кнопці не переносить фокус (розкладка не рушить)',
   onBtn.pdOnButton === true, `defaultPrevented=${onBtn.pdOnButton}`);
await p.evaluate(() => window.__reset());
{
  const iBox = await p.locator('#input').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart',
    touchPoints: [{ x: iBox.x + iBox.width / 2, y: iBox.y + iBox.height / 2, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(60);
  const st = await p.evaluate(() => window.__state);
  // 🛑 На полі вводу preventDefault ставити НЕ можна — воно мусить отримувати фокус.
  ok('🛑 поле вводу фокус ОТРИМУЄ (на ньому preventDefault заборонений)',
     st.pdOnInput === false, `defaultPrevented=${st.pdOnInput}`);
}

// ── 🔴 07.11: «ВІДПОВІСТИ» ПРИ ВІДКРИТІЙ КЛАВІАТУРІ — З ПЕРШОГО ТАПУ ─────────
// 🗣️ Вова 31.10: «натискаю "Відповісти" — клавіатура ховається… тільки коли
// клавіатура заховалася і я знову натискаю — відкривається». На моделі iOS
// (вище) старий код ховає клавіатуру; новий — ні, і тап спрацьовує одразу.
await p.evaluate(() => { window.__reset(); window.__progClicks = 0; });
{
  await p.evaluate(() => document.getElementById('input').focus());
  const rBox = await p.locator('.reply').nth(2).boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart',
    touchPoints: [{ x: rBox.x + rBox.width / 2, y: rBox.y + rBox.height / 2, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(80);
  const st = await p.evaluate(() => ({ ...window.__state,
    focused: !!document.activeElement && document.activeElement.id === 'input' }));
  ok('🔴 iOS: тап «Відповісти» при відкритій клавіатурі НЕ ховає її',
     st.focused && !st.kbHidden, `фокус у полі: ${st.focused}, сховалась: ${!!st.kbHidden}`);
  ok('🔴 iOS: «Відповісти» спрацьовує з ПЕРШОГО тапу, рівно один раз',
     st.replied === 1, `спрацювань: ${st.replied}`);
}

// ── 🛑 ДОТИК, ЩО СПИНЯЄ ПРОКРУТКУ, — НЕ ТАП ────────────────────────────────────
// Кнопки тепер «натискаються» з коду на `touchend`; без захисту палець, що
// зупиняє інерцію гортання, натиснув би «Відповісти», яку людина й не цілила.
if (SCROLL_GUARD) {
  const rBox = await p.locator('.reply').nth(4).boundingBox();
  const тапнути = async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart',
      touchPoints: [{ x: rBox.x + rBox.width / 2, y: rBox.y + rBox.height / 2, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(60);
  };
  await p.evaluate(() => { window.__reset(); window.__progClicks = 0;
    document.getElementById('list').scrollTop = 1; });
  await p.waitForTimeout(20);                       // подія `scroll` дійшла — «щойно гортали»
  await тапнути();
  const щойно = await p.evaluate(() => window.__progClicks);
  ok('🛑 дотик одразу після прокрутки не натискає кнопку з коду', щойно === 0, `натисків: ${щойно}`);
  await p.waitForTimeout(250);                      // тиша довша за SCROLL_QUIET_MS
  await p.evaluate(() => { window.__reset(); window.__progClicks = 0; });
  await тапнути();
  const тиша = await p.evaluate(() => window.__progClicks);
  ok('🔴 контроль: після тиші той самий тап спрацьовує', тиша === 1, `натисків: ${тиша}`);
}

await b.close();
done();
