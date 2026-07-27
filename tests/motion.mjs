// Стенд №10: ЛОГІКА ВІДКРИТТЯ/ЗАКРИТТЯ МОДАЛОК — «як у Стрічці, плавна і чітка».
// Вимога Вови 27.07.
//
// Міряємо не «є transition у CSS», а сам РУХ: покадрово знімаємо, де аркуш і чи його
// видно. Три речі, які й складають «плавно і чітко»:
//   1. ЧІТКО   — аркуш реально проходить шлях згори донизу (а не зникає на місці);
//   2. ПЛАВНО  — рухається кожен кадр, без застрягань і без стрибка в кінці;
//   3. ВИДНО   — не гасне по дорозі (Вова про лист коментарів: «не видно що вона
//                згортається до низу» — той самий дефект тут).
// Прогін і на еталоні («Стрічка», .fd-sheet), і на примітиві — числа мають зійтись.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { ROOT, launch, projectFile } from './_lib.mjs';
const R = ROOT;

const page = (css, markup, openJs, closeJs) => `<!doctype html><html><head><meta charset="utf-8"><style>
 *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
 html,body{height:100%;overflow:hidden}
 :root{--bg-card:#fff;--ink:#2b2b2b;--gray-light:#eee;--red:#722F37;--border:#ddd;
       --fd-surface:#fff;--fd-ink:#2b2b2b;--fd-bg:#faf8f5}
 ${css}
</style></head><body>${markup}
<script>
 window.__open  = () => { ${openJs} };
 window.__close = () => { ${closeJs} };
 // Кадр: де низ аркуша і чи його видно (сумарна прозорість усіх предків).
 window.__frame = () => {
   const p = document.querySelector('.__panel');
   if (!p) return null;
   const r = p.getBoundingClientRect();
   let o = 1, e = p;
   while (e && e !== document.documentElement) { o *= parseFloat(getComputedStyle(e).opacity); e = e.parentElement; }
   return { top: Math.round(r.top), vis: +o.toFixed(3) };
 };
</script></body></html>`;

const modalCss = projectFile('style/modal.css') + projectFile('style/community.css');
const feedCss  = projectFile('style/feed.css');

// ── Еталон: лист «Стрічки» ──
const feedCase = page(feedCss,
  `<div class="fd-sheet-back"><div class="fd-sheet __panel">
     ${'<p style="margin:14px 0">рядок</p>'.repeat(25)}</div></div>`,
  `document.querySelector('.fd-sheet-back').classList.add('open');`,
  // Дослівно те, що робить attachSheetSwipe у момент доїзду: аркуш їде, клас НЕ знімаємо.
  `const p=document.querySelector('.fd-sheet');
   p.style.height=p.offsetHeight+'px';
   p.style.transition='transform 240ms cubic-bezier(0.32,0.72,0,1)';
   p.style.transform='translateY(100%)';`);

// ── Примітив: справжня розмітка openModal ──
const primCase = page(modalCss,
  `<div class="app-modal app-modal--sheet"><div class="app-modal-backdrop"></div>
     <div class="app-modal-sheet __panel"><div class="app-modal-handle"></div>
       <div class="app-modal-body">${'<p style="margin:14px 0">рядок</p>'.repeat(25)}</div></div></div>`,
  `document.querySelector('.app-modal').classList.add('open');`,
  // Дослівно slideOut() з src/core/modal.js.
  `const w=document.querySelector('.app-modal'), p=w.querySelector('.app-modal-sheet'),
         b=w.querySelector('.app-modal-backdrop');
   p.style.height=p.offsetHeight+'px';
   p.style.transition='transform 240ms cubic-bezier(0.32,0.72,0,1)';
   p.style.transform='translateY(100%)';
   b.style.transition='opacity 240ms linear'; b.style.opacity='0';`);

// ── «Подати оголошення»: та сама анімація на ЇЇ власному CSS (вона мене вже двічі підвела) ──
const boardCase = page(modalCss,
  `<div class="app-modal app-modal--sheet app-modal--board-compose"><div class="app-modal-backdrop"></div>
     <div class="app-modal-sheet __panel"><div class="app-modal-handle"></div>
       <button class="app-modal-close"></button>
       <div class="app-modal-body"><div class="cm-board-modal-head"><h3 class="cm-board-modal-title">Т</h3></div>
       ${'<p style="margin:14px 0">рядок</p>'.repeat(25)}</div></div></div>`,
  `document.querySelector('.app-modal').classList.add('open');`,
  `const w=document.querySelector('.app-modal'), p=w.querySelector('.app-modal-sheet'),
         b=w.querySelector('.app-modal-backdrop');
   p.style.height=p.offsetHeight+'px';
   p.style.transition='transform 240ms cubic-bezier(0.32,0.72,0,1)';
   p.style.transform='translateY(100%)';
   b.style.transition='opacity 240ms linear'; b.style.opacity='0';`);

const b = await launch(chromium);
const res = []; const ok = (n, c, i = '') => { res.push(c); console.log(`${c ? '✅' : '❌'} ${n}${i ? '  — ' + i : ''}`); };

async function run(label, html) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.setContent(html);

  // ВІДКРИТТЯ
  await p.evaluate(() => window.__open());
  const openFrames = [];
  for (let i = 0; i < 14; i++) { openFrames.push(await p.evaluate(() => window.__frame())); await p.waitForTimeout(25); }
  await p.waitForTimeout(200);
  const settled = await p.evaluate(() => window.__frame());

  // ЗАКРИТТЯ
  await p.evaluate(() => window.__close());
  const frames = [];
  for (let i = 0; i < 16; i++) { frames.push(await p.evaluate(() => window.__frame())); await p.waitForTimeout(22); }

  const tops = frames.map(f => f.top);
  const minVis = Math.min(...frames.map(f => f.vis));
  const travelled = Math.max(...tops) - Math.min(...tops);
  const steps = tops.slice(1).map((t, i) => t - tops[i]).filter(s => s > 0);
  // ⚠️ Застрягання рахуємо ЛИШЕ під час руху. Знімаємо 16 кадрів по 22мс = 352мс, а
  // анімація триває 240мс — решта кадрів це вже СПОКІЙ у кінцевій точці, і рахувати їх
  // за «застрягання» неправильно. Перший прогін це й показав: критерій завалив ЕТАЛОН
  // («Стрічку»), який Вова прийняв як добрий. Отже хибна була мірка, а не рух.
  const endTop = Math.max(...tops);
  const moving = tops.slice(0, tops.findIndex(t => t === endTop) + 1);
  const stalls = moving.slice(1).filter((t, i) => t === moving[i]).length;
  const openTravel = Math.max(...openFrames.map(f => f.top)) - Math.min(...openFrames.map(f => f.top));

  console.log(`\n── ${label} ──`);
  console.log(`   відкриття: пройшло ${openTravel}px, стало на ${settled.top}`);
  console.log(`   закриття:  ${tops.join(' → ')}`);
  console.log(`   видимість: мінімум ${minVis}`);

  ok(`${label}: відкривається рухом угору`, openTravel > 100, `${openTravel}px`);
  ok(`${label}: ЧІТКО — аркуш проходить шлях донизу`, travelled > 200, `${travelled}px`);
  ok(`${label}: ПЛАВНО — без застрягань посеред руху`, stalls <= 1, `застрягань ${stalls}`);
  ok(`${label}: ВИДНО всю дорогу (не гасне)`, minVis >= 0.99, `мінімум ${minVis}`);
  await p.close();
  return { travelled, minVis, steps };
}

const feed  = await run('«Стрічка» (еталон)', feedCase);
const prim  = await run('примітив модалок', primCase);
const board = await run('«Подати оголошення»', boardCase);

console.log('\n── звірка з еталоном ──');
ok('примітив проходить не менший шлях, ніж «Стрічка»', prim.travelled >= feed.travelled - 8,
   `${prim.travelled}px проти ${feed.travelled}px`);
ok('«Подати оголошення» поводиться так само', Math.abs(board.travelled - prim.travelled) <= 8,
   `${board.travelled}px проти ${prim.travelled}px`);

await b.close();
const bad = res.filter(r => !r).length;
console.log(`\n${bad ? '❌' : '✅'} ${res.length - bad}/${res.length} перевірок пройдено`);
process.exit(bad ? 1 : 0);
