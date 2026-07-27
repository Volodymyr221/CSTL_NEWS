// Стенд №4: композер «Новий пост». Скарга Вови: при великому тексті шапка йде за екран
// і не повертається скролом. Міряємо СТАРУ і НОВУ будову на однаковому вмісті.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { launch, projectFile } from './_lib.mjs';
const css = projectFile('style/feed.css');
const LONG = 'Туристична Олика — місце, яке варто відкрити для себе. '.repeat(40);

const page = (mode) => `<!doctype html><html><head><meta charset="utf-8"><style>
 *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
 html,body{height:100%;overflow:hidden}
 :root{--fd-surface:#fff;--fd-ink:#111;--fd-chip:#eee;--fd-accent:#722F37;--fd-muted:#888;--fd-line:#ddd}
 ${css}
 ${mode === 'old' ? `
   /* СТАРА будова: лист сам собі скролер, шапка всередині нього */
   .fd-composer{display:block;overflow-y:auto}
   .fd-comp-head,.fd-comp-body,.fd-comp-bar{display:block;flex:none;overflow:visible;min-height:auto}
 ` : ''}
</style></head><body>
 <div class="fd-sheet-back fd-sheet-back--kbsafe open"><div class="fd-sheet-vp">
  <div class="fd-sheet fd-composer">
   <div class="fd-comp-head">
     <div class="fd-sheet-handle"></div>
     <div class="fd-sheet-title">Новий пост · ТУРИСТИЧНА ОЛИКА</div>
     <div class="fd-comp-type"><button class="fd-comp-type-btn is-on">Допис</button><button class="fd-comp-type-btn">Подія</button></div>
   </div>
   <div class="fd-comp-body">
     <textarea class="fd-comp-text"></textarea>
     <div class="fd-comp-as"><div class="fd-comp-as-label">Публікувати як</div></div>
   </div>
   <div class="fd-comp-bar"><button class="fd-comp-send">Опублікувати</button></div>
  </div>
 </div></div>
<script>
window.__fill = (t) => {                        // імітуємо autoGrowTextarea
  const ta = document.querySelector('.fd-comp-text');
  ta.value = t; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px';
};
window.__scrollAll = () => {                    // «скролю донизу» — усюди, де можна
  document.querySelectorAll('.fd-composer, .fd-comp-body').forEach(el => el.scrollTop = 99999);
};
window.__geom = () => {
  const g = (s) => { const e=document.querySelector(s); if(!e) return null;
    const r=e.getBoundingClientRect(); return {top:Math.round(r.top), bottom:Math.round(r.bottom)}; };
  return { head: g('.fd-comp-head'), title: g('.fd-sheet-title'), type: g('.fd-comp-type'),
           bar: g('.fd-comp-bar'), sheet: g('.fd-composer') };
};
</script></body></html>`;

const b = await launch(chromium);
const res = []; const ok=(n,c,i='')=>{res.push(c);console.log(`${c?'✅':'❌'} ${n}${i?'  — '+i:''}`);};

for (const mode of ['old','new']) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.setContent(page(mode)); await p.waitForTimeout(100);
  const before = await p.evaluate((t)=>{ window.__fill(t); return window.__geom(); }, LONG);
  const after  = await p.evaluate(()=>{ window.__scrollAll(); return window.__geom(); });
  console.log(`\n── ${mode === 'old' ? 'СТАРА будова (як було)' : 'НОВА будова (три яруси)'}`);
  console.log(`   шапка після вставки тексту: top=${before.head.top}`);
  console.log(`   шапка ПІСЛЯ скролу донизу:  top=${after.head.top}   (заголовок top=${after.title.top}, перемикач top=${after.type.top})`);
  console.log(`   нижня панель: top=${after.bar.top}, bottom=${after.bar.bottom}`);
  if (mode === 'old') {
    ok('стенд відтворює баг (шапка йде за екран після скролу)', after.title.top < 0 || after.type.top < 0,
       `заголовок top=${after.title.top}`);
  } else {
    ok('шапка НЕ виходить за верх листа після скролу', after.head.top >= before.sheet.top - 1,
       `head=${after.head.top}, лист=${before.sheet.top}`);
    ok('заголовок «Новий пост» лишається видимим', after.title.top > 0, `top=${after.title.top}`);
    ok('перемикач Допис|Подія лишається видимим', after.type.top > 0, `top=${after.type.top}`);
    ok('нижня панель «Опублікувати» видима на екрані', after.bar.bottom <= 844 && after.bar.top > 0,
       `top=${after.bar.top} bottom=${after.bar.bottom}`);
    ok('шапка НЕ рухається від скролу взагалі', after.head.top === before.head.top,
       `було ${before.head.top} → стало ${after.head.top}`);
  }
  await p.close();
}
await b.close();
const bad = res.filter(r=>!r).length;
console.log(`\n${bad?'❌':'✅'} ${res.length-bad}/${res.length} перевірок пройдено`);
process.exit(bad?1:0);
