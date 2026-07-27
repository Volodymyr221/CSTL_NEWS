// Стенд №14: ПОЗНАЧКА «ЗАКРІПЛЕНО» ВИГЛЯДАЄ ОДНАКОВО.
// Вова, скрін IMG_3681: «чому одна іконка закріплене бордова, а інша сіра».
//
// ПРИЧИНА була в мені: клас `.fd-card-head--onphoto` я прочитав як «шапка лежить
// ПОВЕРХ фото» і додав їй «контрастний» темний варіант позначки. Насправді клас
// означає «у картки Є фото НИЖЧЕ» — шапка лишається на білому тлі картки. Тобто
// сіра плашка малювалась на білому і читалась як інший, неактивний стан.
//
// Стенд міряє КОЛІР НАЖИВО в обох випадках і вимагає, щоб вони збіглись.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { ROOT, launch, projectFile } from './_lib.mjs';
const R = ROOT;

const css = projectFile('style/feed.css');
const badge = '<span class="fd-pin-badge"><svg viewBox="0 0 24 24"><path d="M15 4.5l-4 4"/></svg>Закріплено</span>';
const card = (photo) => `
  <article class="fd-card">
    <header class="fd-card-head${photo ? ' fd-card-head--onphoto' : ''}">
      <span class="fd-head-txt"><span class="fd-page-name">ТУРИСТИЧНА ОЛИКА</span>
        <span class="fd-time">23 липня</span></span>
      ${badge}
      <button class="fd-card-menu">···</button>
    </header>
    ${photo ? '<div style="height:120px;background:#888"></div>' : ''}
    <div class="fd-card-body${photo ? ' fd-card-body--onphoto' : ''}"><div class="fd-text">текст</div></div>
  </article>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
 *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
 :root{--fd-surface:#fff;--fd-ink:#2b2b2b;--fd-muted:#888;--fd-accent:#722F37;
       --fd-bg:#f4f1ec;--fd-card-r:14px}
 body{background:var(--fd-bg)}
 ${css}
</style></head><body>
 <div id="bez">${card(false)}</div>
 <div id="zfoto">${card(true)}</div>
<script>
 // Тло, яке РЕАЛЬНО бачить око: власне тло елемента часто прозоре, і колір дає
 // предок (тут — біла картка). Перша версія міряла власне тло і показала «різне»
 // там, де візуально однакове. Міряти треба те, що видно, а не те, що записано.
 window.__effBg = (el) => {
   let e = el;
   while (e) {
     const bg = getComputedStyle(e).backgroundColor;
     // ⚠️ БЕЗ регулярки. Цей код лежить усередині шаблонного рядка, і зворотні слеші
     // там з'їдаються: вираз ставав регуляркою з ГРУПОЮ і не збігався НІКОЛИ, через
     // що прозоре тло вважалось кольором. Просте порівняння рядків такої пастки не має.
     // (І зворотних лапок у коментарі теж не пишемо — вони обривають шаблонний рядок.)
     if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
     e = e.parentElement;
   }
   return 'rgb(255, 255, 255)';
 };
 window.__badge = (root) => {
   const e = document.querySelector('#' + root + ' .fd-pin-badge');
   const cs = getComputedStyle(e);
   const r = e.getBoundingClientRect();
   const menu = document.querySelector('#' + root + ' .fd-card-menu').getBoundingClientRect();
   const head = document.querySelector('#' + root + ' .fd-card-head').getBoundingClientRect();
   return { color: cs.color, bg: cs.backgroundColor, border: cs.borderTopColor,
            headBg: window.__effBg(document.querySelector('#' + root + ' .fd-card-head')),
            w: Math.round(r.width), h: Math.round(r.height),
            zazor: Math.round(menu.left - r.right),
            doKrayu: Math.round(head.right - menu.right) };
 };
</script></body></html>`;

const b = await launch(chromium);
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.setContent(html); await p.waitForTimeout(120);

const bez   = await p.evaluate(() => window.__badge('bez'));
const foto  = await p.evaluate(() => window.__badge('zfoto'));

const res = []; const ok = (n, c, i = '') => { res.push(c); console.log(`${c ? '✅' : '❌'} ${n}${i ? '  — ' + i : ''}`); };

console.log('\n   без фото:  текст', bez.color, '· тло', bez.bg);
console.log('   з фото:    текст', foto.color, '· тло', foto.bg);
console.log('   тло шапки: без фото', bez.headBg, '· з фото', foto.headBg);

ok('колір тексту позначки однаковий', bez.color === foto.color, `${bez.color} проти ${foto.color}`);
ok('тло позначки однакове', bez.bg === foto.bg, `${bez.bg} проти ${foto.bg}`);
ok('рамка позначки однакова', bez.border === foto.border, `${bez.border} проти ${foto.border}`);
ok('розмір позначки однаковий', bez.w === foto.w && bez.h === foto.h,
   `${bez.w}×${bez.h} проти ${foto.w}×${foto.h}`);

// Чому взагалі виникла плутанина: тло шапки в обох випадках ОДНЕ І ТЕ САМЕ.
// Якби воно різнилось, окремий варіант позначки був би виправданий.
ok('тло шапки однакове — окремий варіант позначки не потрібен', bez.headBg === foto.headBg,
   `${bez.headBg} проти ${foto.headBg}`);

// Позначка має бути акцентною (бордовою), а не сірою.
ok('позначка бордова, а не сіра', bez.color === 'rgb(114, 47, 55)', bez.color);

// Розкладка: «⋯» не відʼїжджає від краю через позначку.
console.log('   «⋯» від правого краю шапки:', bez.doKrayu, '(без фото) ·', foto.doKrayu, '(з фото)');
ok('«⋯» лишається біля правого краю', bez.doKrayu <= 16 && foto.doKrayu <= 16,
   `${bez.doKrayu} / ${foto.doKrayu}`);
ok('позначка не налазить на «⋯»', bez.zazor >= 0 && foto.zazor >= 0, `зазор ${bez.zazor} / ${foto.zazor}`);

await b.close();
const bad = res.filter(r => !r).length;
console.log(`\n${bad ? '❌' : '✅'} ${res.length - bad}/${res.length} перевірок пройдено`);
process.exit(bad ? 1 : 0);
