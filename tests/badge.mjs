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
// 🔴 05.09 — НАЗВА НАВМИСНО ДОВГА, І ЦЕ НЕ ПРИКРАСА СЦЕНИ.
// 🗣️ Вова саме на такій назві й показав ваду: «КЦ «Центр культури, спорту та
// туризму Олицької міської ради»» розсипалась на чотири рядки у вузькій колонці,
// бо позначка «Закріплено», дзвіночок і «⋯» стояли з нею В ОДНОМУ рядку.
// ⚠️ На короткій назві («ТУРИСТИЧНА ОЛИКА», як було до 05.09) вада НЕ
// відтворюється взагалі: місця вистачає, і стенд світився б зеленим.
const ДОВГА_НАЗВА = 'КЦ «Центр культури, спорту та туризму Олицької міської ради»';
const дзвінок = '<button class="fd-remind-btn" data-remind="1"><svg viewBox="0 0 24 24"><path d="M12 2v2"/></svg></button>';
// 📐 Розмітка дзеркалить `postCardHtml` із `src/tabs/feed.js` — два яруси:
// назва на всю ширину, під нею службовий рядок. Нижче стоїть перевірка, яка
// звіряє це дзеркало з кодом: копія, що тихо розійшлась із оригіналом, — це
// саме те, через що цей стенд і не побачив вади (він мав стару розмітку).
const card = (photo) => `
  <article class="fd-card">
    <header class="fd-card-head${photo ? ' fd-card-head--onphoto' : ''}">
      <span class="fd-ava-wrap" style="background:#ddd;border-radius:50%"></span>
      <span class="fd-page-name">${ДОВГА_НАЗВА}</span>
      <button class="fd-card-menu">···</button>
      <span class="fd-head-meta">
        <span class="fd-time">23 липня</span>
        ${badge}
        ${дзвінок}
      </span>
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
   const name = document.querySelector('#' + root + ' .fd-page-name').getBoundingClientRect();
   const ava  = document.querySelector('#' + root + ' .fd-ava-wrap').getBoundingClientRect();
   const bell = document.querySelector('#' + root + ' .fd-remind-btn').getBoundingClientRect();
   // 📐 Рядки — Range-ом по тексту: .fd-page-name це флекс-елемент, і його
   // власний getClientRects() віддає ОДИН прямокутник коробки незалежно від
   // того, на скільки рядків розсипався текст усередині.
   // (зворотні лапки тут заборонені: увесь блок лежить у шаблонному рядку)
   const nameEl = document.querySelector('#' + root + ' .fd-page-name');
   const rng = document.createRange();
   rng.selectNodeContents(nameEl);
   const rows = [...rng.getClientRects()].filter(x => x.width > 1 && x.height > 1).length;
   return { color: cs.color, bg: cs.backgroundColor, border: cs.borderTopColor,
            headBg: window.__effBg(document.querySelector('#' + root + ' .fd-card-head')),
            w: Math.round(r.width), h: Math.round(r.height),
            zazor: Math.round(menu.left - r.right),
            doKrayu: Math.round(head.right - menu.right),
            // Скільки місця назві лишилось від того, що є між аватаркою і «⋯».
            nameW: Math.round(name.width),
            dostupno: Math.round(menu.left - ava.right - 10),
            rowsNazvy: rows,
            // Службові позначки мусять стояти НИЖЧЕ назви, а не поруч.
            znachkyNyzhche: r.top >= name.bottom - 1 && bell.top >= name.bottom - 1,
            // «⋯» лишається навпроти ПЕРШОГО рядка назви (слово Вови: «повинні
            // залишатися там де є»).
            menuNaPershomu: menu.top < name.top + 26,
            // 🔴 05.09 — позначки праворуч, час ліворуч (слово Вови: «позначку
            // закріплено і позначку дзвіночка треба з правої частини розташувати»).
            // Міряємо ДВІ речі: правий край дзвіночка стоїть під правим краєм «⋯»,
            // а час лишається біля лівого краю ярусу.
            pravyiKrai: Math.round(menu.right - bell.right),
            chasZlivaVid: Math.round(
              document.querySelector('#' + root + ' .fd-time').getBoundingClientRect().left
              - name.left) };
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

// ── 🔴 05.09: НАЗВА СПІЛЬНОТИ НА ВСЮ ШИРИНУ ─────────────────────────────────
// 🗣️ Вова: «сама назва спільноти в пості має бути максимально горизонтально
// розтягнута… під ним вже закріплено, там дзвіночок нагадування якщо він є».
// 📐 Міряємо НАСЛІДОК: скільки ширини дісталось назві з того, що є між
// аватаркою і «⋯». Правило в CSS («flex: 1») можна написати і мати вузьку
// колонку — якщо поруч у рядку стоїть щось, що забирає місце.
ok('🔴 назва займає майже всю ширину між аватаркою і «⋯»',
   bez.nameW >= bez.dostupno * 0.92,
   `${bez.nameW}px із доступних ${bez.dostupno}px`);
// 🛑 Зустрічна межа: службові позначки мусять бути НИЖЧЕ назви. Без неї
// перевірка вище проходила б і в розкладці, де назва широка, а «Закріплено»
// налізло на неї збоку і тисне текст.
ok('🛑 «Закріплено» і дзвіночок стоять ПІД назвою, а не поруч із нею',
   bez.znachkyNyzhche && foto.znachkyNyzhche);
ok('«⋯» лишився навпроти першого рядка назви', bez.menuNaPershomu && foto.menuNaPershomu);
// 🔴 05.09: службовий ярус вирівняний по правому краю картки.
// 🛑 Пара перевірок, і саме ПАРА: без другої «праворуч» проходило б і тоді,
// якби праворуч поїхав УВЕСЬ ярус разом із датою.
ok('🔴 «Закріплено» і дзвіночок стоять ПРАВОРУЧ, під «⋯»',
   Math.abs(bez.pravyiKrai) <= 6 && Math.abs(foto.pravyiKrai) <= 6,
   `розбіжність із правим краєм «⋯»: ${bez.pravyiKrai}px`);
ok('🛑 …а час лишився біля ЛІВОГО краю, під назвою',
   bez.chasZlivaVid <= 2 && foto.chasZlivaVid <= 2,
   `час зміщений від назви на ${bez.chasZlivaVid}px`);
// 📐 Довга офіційна назва мусить перестати розсипатись: у 390px їй тепер
// вистачає двох рядків замість чотирьох у вузькій колонці.
ok('🔴 довга назва більше не розсипається на чотири рядки',
   bez.rowsNazvy <= 2, `${bez.rowsNazvy} рядки`);

// ── 🛑 ДЗЕРКАЛО ЗВІРЕНЕ З КОДОМ ─────────────────────────────────────────────
// ⚠️ Саме через розхід копії з оригіналом цей стенд і не побачив вади: він
// тримав РОЗМІТКУ, якої в застосунку вже не було. Тепер розхід ловиться.
const feedSrc = projectFile('src/tabs/feed.js');
const шапка = (feedSrc.match(/<header class="fd-card-head[\s\S]*?<\/header>/) || [''])[0];
ok('🛑 сцена дзеркалить справжню шапку: службовий рядок існує в коді',
   /<span class="fd-head-meta">/.test(шапка));
// 🛑 І що обгортки-колонки більше немає: у сітці назва, «⋯» і службовий ряд —
// ПРЯМІ діти шапки. Копія з обгорткою мала б іншу геометрію, і стенд знову
// міряв би не те, що на екрані.
ok('🛑 …і назва з «⋯» лежать прямо в шапці (сітка, а не колонка-обгортка)',
   !/fd-head-txt/.test(шапка));
ok('🛑 …і «Закріплено» з дзвіночком лежать САМЕ в ньому',
   /fd-head-meta[\s\S]*?fd-pin-badge[\s\S]*?eventRemindHtml[\s\S]*?<\/span>/.test(шапка));

await b.close();
const bad = res.filter(r => !r).length;
console.log(`\n${bad ? '❌' : '✅'} ${res.length - bad}/${res.length} перевірок пройдено`);
process.exit(bad ? 1 : 0);
