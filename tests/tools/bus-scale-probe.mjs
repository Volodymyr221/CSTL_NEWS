// tests/tools/bus-scale-probe.mjs — ПРИЛАД: як насправді виглядає шкала відстеження.
//
// Стенд `tests/bus-scale.mjs` навмисно вимикає фото картки, щоб фон під крапкою
// був рівним і «розкид усередині кружечка» міряв ваду, а не фотографію. Цей
// інструмент — навпаки: показує ЖИВУ картку з фото, щоб можна було подивитись
// очима і почитати числа в тому вигляді, у якому це бачить Вова.
//
// Розмітку бере з ЖИВОЇ функції `renderRouteMapV4` (`src/tabs/buses.js`), а не
// переписує руками — інакше інструмент показував би власну копію.
//
// Запуск:  node tests/tools/bus-scale-probe.mjs            (поточний код)
//          SRC_REV=<git-ish> CSS_REV=<git-ish> node …      (як було колись)
import { chromium } from '@playwright/test';
import { launch, serve, blockExternal, pixelsOf, projectFile } from '../_lib.mjs';

const SRC_REV = process.env.SRC_REV || '';
const CSS_REV = process.env.CSS_REV || '';

const джерело = projectFile('src/tabs/buses.js', SRC_REV);
const витягти = імʼя => {
  const a = джерело.indexOf(`export function ${імʼя}(`);
  const b = джерело.indexOf('\n}\n', a);
  return джерело.slice(a, b + 2).replace(/^export /, '');
};
const функції = [витягти('parseRouteEndpoints'), витягти('renderRouteMapV4')].join('\n');

const МАРШРУТ = { name: 'ЛУЦЬК ОЛИКА', stops: [0, 8, 17, 25, 33].map((km, i) => ({ km, name: 'З' + i })) };

const { url, stop } = await serve();
const b = await launch(chromium);
const page = await b.newPage({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 1 });
await blockExternal(page);
await page.route('**/bundle.js', r => r.abort());
await page.goto(url + '/index.html');
await page.addStyleTag({ content: projectFile('style/buses.css', CSS_REV) });
await page.addStyleTag({ content: '.bhv4-dot--current { animation: none !important }' });

await page.evaluate(([фн, м]) => {
  const escapeHtml = s => String(s ?? '');
  const карта = new Function('escapeHtml', 'route', 'timings',
    `${фн}; return renderRouteMapV4(route, timings);`);
  const сцена = [
    карта(escapeHtml, м, { progress: 0,    state: 'waiting' }),
    карта(escapeHtml, м, { progress: 0.42, state: 'enroute' }),
  ].map((h, i) =>
    `<div class="bhv4${i ? ' bhv4--enroute' : ''}" style="margin-bottom:20px">
       <img class="bhv4-bg-img" src="./images/bus-hero2.webp" alt="">
       <div class="bhv4-overlay"></div>
       <div class="bhv4-content"><div class="bhv4-map-outer">${h}</div></div>
     </div>`).join('');
  document.body.innerHTML =
    `<div id="scene" style="position:fixed;inset:0;background:#ECEEF1;padding:16px;z-index:2147483000">${сцена}</div>`;
}, [функції, МАРШРУТ]);
await page.waitForTimeout(700);

const геом = await page.evaluate(() => [...document.querySelectorAll('#scene .bhv4-map')].map(m => {
  const mr = m.getBoundingClientRect();
  const tr = m.querySelector('.bhv4-track').getBoundingClientRect();
  return {
    центрY: Math.round(tr.top - mr.top + tr.height / 2),
    крапки: [...m.querySelectorAll('.bhv4-dot')].map(d => {
      const r = d.getBoundingClientRect();
      return {
        x: Math.round(r.left - mr.left + r.width / 2),
        рід: d.classList.contains('bhv4-dot--current') ? 'рухома'
           : d.classList.contains('bhv4-dot--passed')  ? 'пройдена' : 'майбутня',
      };
    }),
  };
}));

const назва = ['рейс чекає', 'рейс у дорозі'];
for (let i = 0; i < геом.length; i++) {
  const g = геом[i];
  const p = await pixelsOf(page, `#scene .bhv4-map >> nth=${i}`);
  console.log(`\n═══ ${назва[i]} — центр смуги y=${g.центрY}, знімок ${p.w}×${p.h}`);
  for (const d of g.крапки) {
    const я = [];
    for (let dy = -3; dy <= 2; dy++) я.push(p.ярк(p.px(d.x, g.центрY + dy)));
    const розкид = (Math.max(...я) - Math.min(...я)).toFixed(1);
    console.log(`  x=${String(d.x).padStart(3)} [${d.рід.padEnd(8)}] ярк ${я.map(v => String(v).padStart(5)).join(' ')}  розкид ${розкид}`);
  }
  const майб = g.крапки.filter(d => d.рід === 'майбутня');
  if (майб.length > 1) {
    const між = Math.round((майб[0].x + майб[1].x) / 2);
    const я = [-1, 0, 1].map(dy => p.ярк(p.px(між, g.центрY + dy)));
    console.log(`  x=${між} [смуга між крапками] ярк ${я.join(' ')}`);
  }
}

await b.close(); await stop();
