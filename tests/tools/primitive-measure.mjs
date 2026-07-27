// ⛔ УВАГА: цей стенд перевіряє КРОК 1 (стандартизацію примітиву), який 27.07
// ВІДКОЧЕНО — він ламав модалку «Подати оголошення» (Вова: «поверни назад до
// робочої версії»). Тому 4 з 7 перевірок зараз падають ЗАКОНОМІРНО:
// «скролиться тіло», «рисочка не зрушила», «заголовок не зрушив», «аркуш видно
// всю дорогу» — це і є ті властивості, яких після відкату нема.
// Стенд лишаємо як ГОТОВУ мірку на випадок, якщо стандартизацію робитимемо вдруге.
// Стенд №5: СПІЛЬНИЙ примітив core/modal.js + style/modal.css.
// Перевіряє два дефекти, які лагодили: шапка тікає при довгому вмісті + згасання замість з'їзду.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { ROOT, launch, projectFile } from '../_lib.mjs';
const R = ROOT;
const css = projectFile('style/modal.css');
const js  = projectFile('src/core/modal.js')
  .replace(/^import .*$/gm,'').replace(/^export /gm,'');
const utils = "function escapeHtml(s){return String(s).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));}";
const motion = projectFile('src/core/sheet-motion.js').replace(/^export /gm,'');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
 *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
 html,body{height:100%;overflow:hidden}
 :root{--bg-card:#fff;--ink:#2b2b2b;--gray-light:#eee}
 ${css}
</style></head><body><script type="module">
${utils}
${motion}
${js}
window.__open = (long) => {
  window.__m = openModal({ title:'Тестова модалка', bodyHtml: long ? '<p>'+('рядок тексту '.repeat(8)+'<br>').repeat(60)+'</p>' : '<p>коротко</p>' });
};
window.__geom = () => {
  const p=document.querySelector('.app-modal-sheet'); if(!p) return null;
  const h=document.querySelector('.app-modal-handle'), t=document.querySelector('.app-modal-title');
  const b=document.querySelector('.app-modal-body');
  const r=p.getBoundingClientRect();
  let o=1,el=p; while(el&&el!==document.documentElement){o*=parseFloat(getComputedStyle(el).opacity);el=el.parentElement;}
  return { top:Math.round(r.top), h:Math.round(r.height), vis:+o.toFixed(3),
           handleTop: h?Math.round(h.getBoundingClientRect().top):null,
           titleTop:  t?Math.round(t.getBoundingClientRect().top):null,
           bodyScrollable: b ? b.scrollHeight > b.clientHeight+1 : false,
           panelScrollable: p.scrollHeight > p.clientHeight+1 };
};
window.__scroll = () => { document.querySelector('.app-modal-body').scrollTop = 99999;
                          document.querySelector('.app-modal-sheet').scrollTop = 99999; };
window.__close = () => window.__m.close();
</script></body></html>`;

const b = await launch(chromium);
const res=[]; const ok=(n,c,i='')=>{res.push(c);console.log(`${c?'✅':'❌'} ${n}${i?'  — '+i:''}`);};
const p = await b.newPage({ viewport:{width:390,height:844} });
await p.setContent(html); await p.waitForTimeout(150);

// ── 1. Довгий вміст: шапка не тікає ───────────────────────────────────────────
await p.evaluate(()=>window.__open(true)); await p.waitForTimeout(400);
const before = await p.evaluate(()=>window.__geom());
await p.evaluate(()=>window.__scroll()); await p.waitForTimeout(120);
const after = await p.evaluate(()=>window.__geom());
console.log('\n── Довгий вміст');
console.log('   до скролу:   шапка', before.handleTop, '· заголовок', before.titleTop);
console.log('   після скролу: шапка', after.handleTop, '· заголовок', after.titleTop);
ok('скролиться ТІЛО, а не аркуш', before.bodyScrollable && !before.panelScrollable,
   `тіло:${before.bodyScrollable} аркуш:${before.panelScrollable}`);
ok('рисочка не зрушила від скролу', after.handleTop === before.handleTop, `${before.handleTop} → ${after.handleTop}`);
ok('заголовок не зрушив і лишився на екрані', after.titleTop === before.titleTop && after.titleTop > 0,
   `${before.titleTop} → ${after.titleTop}`);

// ── 2. Закриття: аркуш ЇДЕ вниз і лишається видимим ───────────────────────────
const frames = await p.evaluate(async ()=>{
  const out=[window.__geom()]; window.__close();
  for(let i=0;i<14;i++){ await new Promise(r=>requestAnimationFrame(r)); const g=window.__geom(); if(g) out.push(g); }
  return out;
});
const tops=frames.map(f=>f.top), vis=frames.map(f=>f.vis), hs=frames.map(f=>f.h);
console.log('\n── Закриття');
console.log('   позиція верху:', tops.join(', '));
console.log('   видимість:    ', vis.join(', '));
ok('аркуш реально ЇДЕ донизу', tops[tops.length-1] > tops[0] + 100, `${tops[0]} → ${tops[tops.length-1]}`);
ok('аркуш ВИДНО всю дорогу (не гасне)', Math.min(...vis) > 0.95, `мінімум ${Math.min(...vis)}`);
ok('висота під час з\'їзду не змінюється', Math.max(...hs)-Math.min(...hs) === 0, `розкид ${Math.max(...hs)-Math.min(...hs)}px`);

// ── 3. Коротка модалка не стала на весь екран ─────────────────────────────────
await p.waitForTimeout(300);
await p.evaluate(()=>window.__open(false)); await p.waitForTimeout(400);
const short = await p.evaluate(()=>window.__geom());
ok('коротка модалка лишилась низькою', short.h < 300, `висота ${short.h}px`);

await b.close();
const bad=res.filter(r=>!r).length;
console.log(`\n${bad?'❌':'✅'} ${res.length-bad}/${res.length} перевірок пройдено`);
process.exit(bad?1:0);
