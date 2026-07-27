// Стенд №6: модалка «Подати оголошення» (Дошка). Вона має ВЛАСНУ липку шапку поверх
// примітиву — саме тут стандартизація дала регрес (Вова: «плаває всередині
// і вертикально і горизонтально»).
//
// ⚠️ КРИТЕРІЙ ПЕРЕПИСАНО. Було: «скролиться ТІЛО, а не аркуш» + «scrollWidth == clientWidth
// у тілі». Обидва хибні. Перше — це опис ОДНІЄЇ реалізації, а не поведінки, яку бачить Вова;
// ця модалка навмисно лишена на старій геометрії (скролер = аркуш). Друге — `scrollWidth`
// на елементі з `overflow: visible` рахує виступ дітей УПРАВО, хоч ніякого «плавання» нема:
// вміст просто малюється за межами боксу, посунути його пальцем не можна.
// СТАЛО: міряємо саме те, на що скаржився Вова — чи можна ЗСУНУТИ вміст убік, тобто
// чи є в модалці хоч один ГОРИЗОНТАЛЬНО ПРОКРУЧУВАНИЙ вузол.
//
// Прогін по ревізіях: CSS_REV=<git-ish> node compose.mjs  (порожньо = робоче дерево).
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { ROOT, launch, projectFile } from './_lib.mjs';

const R = ROOT;
const REV = process.env.CSS_REV || '';
const src = (f) => REV
  ? execFileSync('git', ['-C', R, 'show', `${REV}:${f}`], { encoding: 'utf8', maxBuffer: 1 << 26 })
  : projectFile(f);

const modalCss = src('style/modal.css');
const commCss  = src('style/community.css');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
 *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
 html,body{height:100%;overflow:hidden}
 :root{--bg-card:#fff;--ink:#2b2b2b;--gray-light:#eee;--red:#722F37;--border:#ddd}
 ${modalCss}
 ${commCss}
</style></head><body>
<div class="app-modal app-modal--sheet app-modal--board-compose open">
  <div class="app-modal-backdrop"></div>
  <div class="app-modal-sheet">
    <div class="app-modal-handle"></div>
    <button class="app-modal-close" type="button">✕</button>
    <div class="app-modal-body">
      <div class="cm-board-modal-head">
        <h3 class="cm-board-modal-title">Нове оголошення</h3>
        <p class="cm-board-modal-sub">Заповніть поля нижче.</p>
      </div>
      <form>${'<p style="margin:14px 0">рядок форми</p>'.repeat(40)}</form>
    </div>
  </div>
</div>
<script>
// Єдиний скролер модалки — той вузол, який реально має що прокручувати вертикально.
window.__scroller = () => {
  const sh=document.querySelector('.app-modal-sheet'), bd=document.querySelector('.app-modal-body');
  return (bd.scrollHeight > bd.clientHeight+1 && getComputedStyle(bd).overflowY !== 'visible') ? bd : sh;
};
window.__g = () => {
  const sh=document.querySelector('.app-modal-sheet');
  const hd=document.querySelector('.app-modal-handle'), hh=document.querySelector('.cm-board-modal-head');
  const cl=document.querySelector('.app-modal-close');
  const r=e=>{const b=e.getBoundingClientRect();return {top:Math.round(b.top),right:Math.round(b.right),w:Math.round(b.width),h:Math.round(b.height)};};
  return { handle:r(hd), head:r(hh), close:r(cl), sheet:r(sh),
           scroller: window.__scroller().className,
           isScrolled: sh.classList.contains('is-scrolled') };
};
window.__scroll = () => {
  const s = window.__scroller(); s.scrollTop = 400; s.dispatchEvent(new Event('scroll'));
  // дзеркало живого JS (community-modal.js): слухаємо обидва вузли, клас — на аркуші
  const sh=document.querySelector('.app-modal-sheet'), bd=document.querySelector('.app-modal-body');
  sh.classList.toggle('is-scrolled', sh.scrollTop>2 || bd.scrollTop>2);
  return s.scrollTop;
};
// «Плавання вбік» = вузол, який МОЖНА прокрутити горизонтально пальцем.
window.__driftable = () => {
  const out=[];
  document.querySelectorAll('.app-modal--board-compose, .app-modal--board-compose *').forEach(e=>{
    const ox = getComputedStyle(e).overflowX;
    if (ox !== 'visible' && ox !== 'clip' && e.scrollWidth > e.clientWidth + 1)
      out.push({ cls: e.className || e.tagName, px: e.scrollWidth - e.clientWidth, ox });
  });
  return out;
};
</script></body></html>`;

const b = await launch(chromium);
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.setContent(html); await p.waitForTimeout(150);
const res=[]; const ok=(n,c,i='')=>{res.push(c);console.log(`${c?'✅':'❌'} ${n}${i?'  — '+i:''}`);};

const a = await p.evaluate(() => window.__g());
const moved = await p.evaluate(() => window.__scroll());
await p.waitForTimeout(80);
const z = await p.evaluate(() => window.__g());
const drift = await p.evaluate(() => window.__driftable());

console.log(`\n   ревізія: ${REV || 'робоче дерево'} · скролер: .${a.scroller.trim().split(/\s+/).pop()} (проїхав ${moved}px)`);
console.log('   до скролу:    рисочка', a.handle.top, '· шапка', a.head.top, '· ✕', a.close.top);
console.log('   після скролу: рисочка', z.handle.top, '· шапка', z.head.top, '· ✕', z.close.top);

// ── ВЕРТИКАЛЬ: шапка стоїть, вміст їде ──
ok('вміст реально прокрутився', moved > 100, `${moved}px`);
ok('рисочка нерухома', z.handle.top === a.handle.top, `${a.handle.top} → ${z.handle.top}`);
// Заголовок має ПРИЛИПНУТИ під баром рисочки і лишитись видимим. Рівність до пікселя тут
// НЕ критерій: у базі (яку Вова прийняв) `top: 22px` навмисно на 2px заходить під бар
// рисочки — «2px перекриття, без гапу», інакше між ними світилась би прозора смуга.
const handleBottom = a.handle.top + Math.round(a.handle.h);
ok('заголовок липне під баром рисочки і лишається видимим',
   z.head.top > 0 && Math.abs(z.head.top - handleBottom) <= 3,
   `${a.head.top} → ${z.head.top}, низ рисочки ${handleBottom}`);
ok('✕ нерухома і у правому куті', z.close.top === a.close.top && z.close.right > 340,
   `top ${a.close.top}→${z.close.top}, right ${z.close.right}`);
ok('✕ НЕ займає власний рядок', a.close.w < 60, `ширина ${a.close.w}px`);
ok('лінія-роздільник вмикається при скролі', z.isScrolled, `is-scrolled=${z.isScrolled}`);

// ── ГОРИЗОНТАЛЬ: нічого не можна зсунути вбік ──
console.log('   вузли, які можна зсунути вбік:', drift.length ? JSON.stringify(drift) : 'нема');
ok('НІЩО в модалці не плаває горизонтально', drift.length === 0,
   drift.map(d => `${d.cls}: ${d.px}px (overflow-x:${d.ox})`).join('; ') || '0 вузлів');

// Повноширинна шапка має рівно гасити падінг аркуша — не менше і не більше.
const geo = await p.evaluate(() => {
  const sh=document.querySelector('.app-modal-sheet'), hh=document.querySelector('.cm-board-modal-head');
  const s=sh.getBoundingClientRect(), h=hh.getBoundingClientRect();
  return { dl: Math.round(h.left - s.left), dr: Math.round(s.right - h.right) };
});
console.log('   шапка проти краю аркуша: зліва', geo.dl, '· справа', geo.dr);
ok('повноширинна шапка точно по краях аркуша', geo.dl === 0 && geo.dr === 0, `${geo.dl} / ${geo.dr}`);

await b.close();
const bad = res.filter(r => !r).length;
console.log(`\n${bad ? '❌' : '✅'} ${res.length - bad}/${res.length} перевірок пройдено`);
process.exit(bad ? 1 : 0);
