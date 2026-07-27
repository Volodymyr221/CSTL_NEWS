// Стенд №3: чи ВИДНО аркуш, поки він з'їжджає донизу.
// Скарга Вови: «пропадає, не видно що вона згортається до низу».
// Міряємо фактичну видиму непрозорість аркуша на кожному кадрі закриття.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { launch, projectFile } from './_lib.mjs';
const css = projectFile('style/feed.css');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%;overflow:hidden}
  :root{--fd-surface:#fff;--fd-ink:#111}
  ${css}
</style></head><body>
  <div class="fd-sheet-back fd-sheet-back--kbsafe open">
    <div class="fd-sheet-vp">
      <div class="fd-sheet fd-com-sheet" style="height:496px">
        <div class="fd-com-grip"><div class="fd-sheet-title">1 коментар</div></div>
      </div>
    </div>
  </div>
<script>
// Видима непрозорість аркуша = добуток opacity усіх предків (як це бачить око).
window.__vis = () => {
  let el = document.querySelector('.fd-com-sheet'), o = 1;
  while (el && el !== document.documentElement) { o *= parseFloat(getComputedStyle(el).opacity); el = el.parentElement; }
  const r = document.querySelector('.fd-com-sheet').getBoundingClientRect();
  return { vis: +o.toFixed(3), top: Math.round(r.top) };
};
window.__dismiss = (removeOpen) => {
  const back = document.querySelector('.fd-sheet-back');
  const s = document.querySelector('.fd-com-sheet');
  s.style.height = s.offsetHeight + 'px';
  s.style.transition = 'transform 260ms cubic-bezier(0.32,0.72,0,1)';
  s.style.transform = 'translateY(100%)';
  if (removeOpen) back.classList.remove('open');   // ← СТАРА поведінка
};
</script></body></html>`;

const b = await launch(chromium);
const res = [];
const ok = (n,c,i='') => { res.push(c); console.log(`${c?'✅':'❌'} ${n}${i?'  — '+i:''}`); };

async function run(removeOpen) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.setContent(html); await p.waitForTimeout(80);
  const f = await p.evaluate(async (ro) => {
    const out = []; window.__dismiss(ro);
    for (let i=0;i<14;i++){ await new Promise(r=>requestAnimationFrame(r)); out.push(window.__vis()); }
    return out;
  }, removeOpen);
  await p.close(); return f;
}

for (const [label, ro] of [['СТАРА: remove("open")', true], ['НОВА: контейнер лишається видимим', false]]) {
  const f = await run(ro);
  const vis = f.map(x=>x.vis), tops = f.map(x=>x.top);
  const half = tops.findIndex(t => t >= tops[0] + (844 - tops[0]) / 2);   // кадр, де пройдено пів шляху
  console.log(`\n── ${label}`);
  console.log(`   видимість: ${vis.join(', ')}`);
  console.log(`   видимість на середині шляху: ${half >= 0 ? vis[half] : '—'}`);
  if (ro) ok('стенд відтворює скаргу (аркуш гасне під час з\'їзду)', Math.min(...vis) < 0.5,
             `мінімум ${Math.min(...vis)}`);
  else {
    ok('аркуш ВИДНО всю дорогу вниз', Math.min(...vis) > 0.95, `мінімум ${Math.min(...vis)}`);
    ok('на середині шляху аркуш повністю видимий', half >= 0 && vis[half] > 0.95, `${vis[half]}`);
  }
}
await b.close();
const bad = res.filter(r=>!r).length;
console.log(`\n${bad?'❌':'✅'} ${res.length-bad}/${res.length} перевірок пройдено`);
process.exit(bad?1:0);
