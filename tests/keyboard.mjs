// Стенд: СПРАВЖНІЙ core/keyboard.js + СПРАВЖНІЙ style/feed.css у Chromium.
// Мета — міряти геометрію листа коментарів числами, а не на око.
// visualViewport підмінюємо керованим об'єктом: iOS-клавіатуру Chromium не відтворює,
// але математику модуля (від чого відлічується верх) перевірити можна точно.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { ROOT, launch } from './_lib.mjs';

const css = readFileSync(`${ROOT}/style/feed.css`, 'utf8');
const kbSrc = readFileSync(`${ROOT}/src/core/keyboard.js`, 'utf8')
  .replace(/^export /gm, '');   // робимо модуль інлайновим для сторінки

const SCREEN_H = 844, SCREEN_W = 390, KB = 336;

const page_html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }  /* = style/base.css:2 */
  html,body{margin:0;padding:0;height:100%}
  body{overflow:hidden}
  .app-main{height:100%;overflow-y:auto}
  :root{--fd-surface:#fff;--fd-ink:#111}
  ${css}
</style></head><body>
  <div class="app-main"><div style="height:3000px"></div></div>
  <div class="fd-sheet-back fd-sheet-back--kbsafe open">
    <div class="fd-sheet-vp">
      <div class="fd-sheet fd-com-sheet">
        <div class="fd-com-grip"><div class="fd-sheet-handle"></div><div class="fd-sheet-title">1 коментар</div></div>
        <div class="fd-com-list" style="flex:1;overflow-y:auto"><div style="height:1200px"></div></div>
        <div class="fd-com-bar"><input class="fd-com-input" /></div>
      </div>
      <div class="fd-sheet-kbpad"></div>
    </div>
  </div>
<script type="module">
${kbSrc}
window.__kb = { attachKeyboardSheet, revealInScroller };

// Керований visualViewport
const vvState = { height: ${SCREEN_H}, width: ${SCREEN_W}, offsetTop: 0, offsetLeft: 0, pageTop: 0 };
const listeners = { resize: [], scroll: [] };
Object.defineProperty(window, 'visualViewport', { configurable: true, value: {
  get height(){ return vvState.height; }, get width(){ return vvState.width; },
  get offsetTop(){ return vvState.offsetTop; }, get offsetLeft(){ return vvState.offsetLeft; },
  get pageTop(){ return vvState.pageTop; },
  addEventListener:(t,f)=>listeners[t]?.push(f),
  removeEventListener:(t,f)=>{ const a=listeners[t]||[]; const i=a.indexOf(f); if(i>=0)a.splice(i,1); },
}});
window.__setVV = (patch) => {
  Object.assign(vvState, patch);
  listeners.resize.forEach(f=>f()); listeners.scroll.forEach(f=>f());
};
window.__geom = () => {
  const s = document.querySelector('.fd-com-sheet').getBoundingClientRect();
  const vp = document.querySelector('.fd-sheet-vp').getBoundingClientRect();
  return { sheetTop: Math.round(s.top), sheetBottom: Math.round(s.bottom), sheetH: Math.round(s.height),
           vpTop: Math.round(vp.top), vpH: Math.round(vp.height),
           anim: document.querySelector('.fd-com-sheet').classList.contains('fd-com-sheet--anim'),
           full: document.querySelector('.fd-com-sheet').classList.contains('fd-com-sheet--full') };
};
</script></body></html>`;

const b = await launch(chromium);
const p = await b.newPage({ viewport: { width: SCREEN_W, height: SCREEN_H } });
await p.setContent(page_html);
await p.waitForTimeout(120);

const results = [];
const ok = (name, cond, info='') => { results.push({ name, cond, info }); console.log(`${cond?'✅':'❌'} ${name}${info?'  — '+info:''}`); };

// ── Сценарій: підключаємо модуль так само, як feed.js ──────────────────────────
const gap = await p.evaluate(() => {
  const sheet = document.querySelector('.fd-com-sheet');
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;left:0;top:0;width:0;visibility:hidden;pointer-events:none;height:var(--fd-kb-top-gap, 12px)';
  sheet.appendChild(probe); const h = probe.offsetHeight; probe.remove();
  return Math.max(0, Math.round(h) || 12);
});
console.log(`\nВідступ згори з CSS (--fd-kb-top-gap): ${gap}px\n`);
ok('відступ читається з CSS і не 0', gap >= 10 && gap <= 80, `${gap}px`);

const before = await p.evaluate((g) => {
  const vp = document.querySelector('.fd-sheet-vp');
  const sheet = document.querySelector('.fd-com-sheet');
  const input = document.querySelector('.fd-com-input');
  window.__detach = window.__kb.attachKeyboardSheet(vp, sheet, {
    input, minHeight: 180, kbClass: 'fd-com-sheet--kb', overlayClass: 'fd-sheet-vp--kb',
    expandTop: g,
    onOpen: () => { sheet.classList.add('fd-com-sheet--full'); },
  });
  return window.__geom();
}, gap);
console.log('СПОКІЙ  ', before);
const top0 = before.sheetTop;
ok('у спокої лист НЕ на весь екран (є верхній простір)', top0 > 60, `top=${top0}`);

// ── Клавіатура відкривається (спосіб А: стиск видимої області) ─────────────────
const opened = await p.evaluate(async (KB) => {
  const sheet = document.querySelector('.fd-com-sheet');
  const input = document.querySelector('.fd-com-input');
  // так само як feed.js: плавність ДО зміни висоти
  sheet.classList.add('fd-com-sheet--anim');
  input.dispatchEvent(new Event('focus'));
  window.__setVV({ height: 844 - KB });
  const immediate = window.__geom();
  await new Promise(r => setTimeout(r, 400));   // дочекатись переходу
  return { immediate, settled: window.__geom() };
}, KB);
console.log('ВІДКРИТО (одразу) ', opened.immediate);
console.log('ВІДКРИТО (усталось)', opened.settled);

ok('плавність УВІМКНЕНА в момент зміни висоти', opened.immediate.anim, 'клас --anim присутній');
ok('верх НЕ впирається у край екрана', opened.settled.sheetTop >= gap - 2 && opened.settled.sheetTop <= gap + 2,
   `top=${opened.settled.sheetTop}, очікували ≈${gap}`);
ok('низ листа сидить рівно на клавіатурі', Math.abs(opened.settled.sheetBottom - (844 - KB)) <= 2,
   `bottom=${opened.settled.sheetBottom}, клавіатура з ${844-KB}`);
ok('перехід реально анімується (одразу ≠ усталеного)', opened.immediate.sheetH !== opened.settled.sheetH,
   `h: ${opened.immediate.sheetH} → ${opened.settled.sheetH}`);

// ── Друк: сиплемо події, геометрія не має «дихати» ─────────────────────────────
const typing = await p.evaluate(async (KB) => {
  const seen = [];
  for (let i = 0; i < 12; i++) { window.__setVV({ height: 844 - KB }); seen.push(window.__geom().sheetTop); await new Promise(r=>setTimeout(r,16)); }
  return seen;
}, KB);
const jitter = Math.max(...typing) - Math.min(...typing);
ok('під час друку верх не смикається', jitter <= 1, `розкид ${jitter}px за 12 подій`);

// ── Клавіатура закривається → повернення у ПОЧАТКОВЕ положення ────────────────
const closed = await p.evaluate(async () => {
  const sheet = document.querySelector('.fd-com-sheet');
  const input = document.querySelector('.fd-com-input');
  sheet.classList.add('fd-com-sheet--anim');
  sheet.classList.remove('fd-com-sheet--full');    // як робить blur у feed.js
  sheet.style.height = '';
  input.dispatchEvent(new Event('blur'));
  window.__setVV({ height: 844 });
  await new Promise(r => setTimeout(r, 400));
  return window.__geom();
});
console.log('ЗАКРИТО ', closed);
ok('лист ПОВЕРНУВСЯ у початкове положення', Math.abs(closed.sheetTop - top0) <= 2,
   `top=${closed.sheetTop}, було ${top0}`);
ok('шапка НЕ лишилась прилиплою зверху', closed.sheetTop > gap + 20, `top=${closed.sheetTop}`);
ok('клас --full знято', !closed.full);

await b.close();
const bad = results.filter(r => !r.cond);
console.log(`\n${bad.length ? '❌' : '✅'} ${results.length - bad.length}/${results.length} перевірок пройдено`);
process.exit(bad.length ? 1 : 0);
