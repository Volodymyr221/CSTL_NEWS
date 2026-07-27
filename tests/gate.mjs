// Стенд №7: ВОРОТА СВАЙПУ в примітиві (core/modal.js).
// Свайп-закриття вмикається лише коли вміст догорнуто до верху. Питання — У КОГО
// питати `scrollTop`. До фікса це було жорстко `.app-modal-body`; після того, як
// «Подати оголошення» лишили на старій геометрії (скролер = аркуш), таке питання
// завжди давало 0 → свайп закривав би модалку посеред прокрученої форми.
// Тут перевіряємо саме правило вибору — на СПРАВЖНЬОМУ CSS обох геометрій.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { ROOT, launch, projectFile } from './_lib.mjs';
const R = ROOT;
const css = projectFile('style/modal.css') + projectFile('style/community.css');

const body = (cls) => `
<div class="app-modal app-modal--sheet ${cls} open">
  <div class="app-modal-backdrop"></div>
  <div class="app-modal-sheet">
    <div class="app-modal-handle"></div>
    <button class="app-modal-close" type="button">✕</button>
    <div class="app-modal-body">
      <div class="cm-board-modal-head"><h3 class="cm-board-modal-title">Т</h3></div>
      ${'<p style="margin:14px 0">рядок</p>'.repeat(40)}
    </div>
  </div>
</div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
 *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
 html,body{height:100%;overflow:hidden}
 :root{--bg-card:#fff;--ink:#2b2b2b;--gray-light:#eee;--red:#722F37;--border:#ddd}
 ${css}
</style></head><body>
<div id="std">${body('')}</div>
<div id="opt">${body('app-modal--board-compose')}</div>
<script>
// ⬇️ Дзеркало правила з src/core/modal.js — один в один.
window.__pick = (rootId) => {
  const wrap = document.querySelector('#'+rootId+' .app-modal');
  const panel = wrap.querySelector('.app-modal-sheet');
  const bodyEl = wrap.querySelector('.app-modal-body');
  const scrollerEl = () => {
    if (!bodyEl) return panel;
    const oy = getComputedStyle(bodyEl).overflowY;
    return (oy === 'visible' || oy === 'clip') ? panel : bodyEl;
  };
  const picked = scrollerEl();
  // Хто НАСПРАВДІ скролиться: єдиний вузол, що має що прокручувати і не visible.
  const real = [bodyEl, panel].find(e => {
    const oy = getComputedStyle(e).overflowY;
    return oy !== 'visible' && oy !== 'clip' && e.scrollHeight > e.clientHeight + 1;
  }) || panel;
  // Головне: прокрутити реальний скролер і спитати ВИБРАНИЙ — чи він це побачить.
  real.scrollTop = 300;
  return { picked: picked === bodyEl ? 'body' : 'sheet',
           real:   real   === bodyEl ? 'body' : 'sheet',
           seenByGate: picked.scrollTop };
};
</script></body></html>`;

const b=await launch(chromium);
const p=await b.newPage({viewport:{width:390,height:844}});
await p.setContent(html); await p.waitForTimeout(150);
const res=[]; const ok=(n,c,i='')=>{res.push(c);console.log(`${c?'✅':'❌'} ${n}${i?'  — '+i:''}`);};

for (const [id,label] of [['std','стандартна модалка'],['opt','«Подати оголошення» (виняток)']]) {
  const r = await p.evaluate(i => window.__pick(i), id);
  console.log(`\n   ${label}: реально скролиться ${r.real}, ворота питають ${r.picked}, бачать ${r.seenByGate}px`);
  ok(`${label}: ворота питають той вузол, що скролиться`, r.picked === r.real, `${r.picked} = ${r.real}`);
  ok(`${label}: прокрутка ВИДНА воротам (свайп не закриє посеред форми)`, r.seenByGate > 100, `${r.seenByGate}px`);
}
await b.close();
const bad=res.filter(r=>!r).length;
console.log(`\n${bad?'❌':'✅'} ${res.length-bad}/${res.length} перевірок пройдено`);
process.exit(bad?1:0);
