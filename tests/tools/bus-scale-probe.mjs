// tests/tools/bus-scale-probe.mjs — ПРИЛАД: чи накладаються крапки зупинок на шкалу.
//
// Скарга Вови (18.08): «кружечок накладений на цю шкалу, він прозорий трохи і
// видно що він накладений». Тут це міряється пікселями, а не оком: беремо
// вертикальний стовпчик крізь ЦЕНТР крапки і той самий стовпчик МІЖ крапками.
// Якщо крапка не накладена — її яскравість у смузі шкали і поза смугою однакова.
//
// Запуск: node tests/tools/bus-scale-probe.mjs [git-ish]
import { chromium } from '@playwright/test';
import { launch, serve, pixelsOf, projectFile } from '../_lib.mjs';

const REV = process.argv[2] || process.env.CSS_REV || '';

const stops = [0, 8, 17, 25, 33];          // км
const total = stops[stops.length - 1];

function card(progress, enroute) {
  const pct = (progress * 100).toFixed(1);
  const FIX = !!process.env.FIX;
  const майбутні = [], пройдені = [];
  stops.forEach(km => {
    const p = ((km / total) * 100).toFixed(1);
    const passed = km / total <= progress + 0.01;
    (passed ? пройдені : майбутні).push(
      `<span class="bhv4-dot${passed ? ' bhv4-dot--passed' : ''}" style="left:${p}%"></span>`);
  });
  const dots = FIX
    ? `<span class="bhv4-rail"><span class="bhv4-rail-line"></span>${майбутні.join('')}</span>${пройдені.join('')}`
    : майбутні.join('') + пройдені.join('');
  const cur = enroute ? `<span class="bhv4-dot bhv4-dot--current" style="left:${pct}%"></span>` : '';
  return `
  <div class="bhv4${enroute ? ' bhv4--enroute' : ''}">
    <img class="bhv4-bg-img" src="./images/bus-hero2.webp" alt="">
    <div class="bhv4-overlay"></div>
    <div class="bhv4-content">
      <div class="bhv4-body"><div class="bhv4-left">
        <div class="bhv4-route-name">ЛУЦЬК → ОЛИКА</div>
      </div></div>
      <div class="bhv4-map-outer">
        <div class="bhv4-map">
          <div class="bhv4-labels"><span class="bhv4-label bhv4-label--a">ЛУЦЬК</span><span class="bhv4-label bhv4-label--b">ОЛИКА</span></div>
          <div class="bhv4-track">
            <div class="bhv4-fill" style="width:${pct}%"></div>
            ${dots}${cur}
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

const css = REV
  ? ['style/base.css', 'style/buses.css'].map(f => projectFile(f, REV)).join('\n')
  : '';

const { url, stop } = await serve();
const browser = await launch(chromium);
const page = await browser.newPage({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 1 });
await page.goto(url + '/index.html');
await page.addStyleTag({ url: url + '/style.css' }).catch(() => {});
if (css) await page.addStyleTag({ content: css });
if (process.env.FIX) await page.addStyleTag({ content: `
  .bhv4-track { background: transparent; }
  .bhv4-rail { position: absolute; inset: 0; opacity: 0.48; border-radius: 2px; }
  .bhv4-rail-line { position: absolute; inset: 0; background: rgba(255,255,255,0.4167); border-radius: 2px; }
  .bhv4-dot { background: #FFFFFF; }
` });
await page.evaluate(html => {
  document.body.innerHTML = `<div id="probe" style="position:fixed;inset:0;background:#ECEEF1;padding:16px;z-index:2147483000">${html}</div>`;
}, card(0, false) + card(0.42, true));
await page.waitForTimeout(600);

const карти = await page.locator('#probe .bhv4-map').all();
const геом = await page.evaluate(() => [...document.querySelectorAll('#probe .bhv4-map')].map(m => {
  const mr = m.getBoundingClientRect();
  const tr = m.querySelector('.bhv4-track').getBoundingClientRect();
  return {
    trackTop: tr.top - mr.top, trackH: tr.height,
    dots: [...m.querySelectorAll('.bhv4-dot')].map(d => {
      const r = d.getBoundingClientRect();
      return { x: Math.round(r.left - mr.left + r.width / 2), cls: d.className.replace('bhv4-dot', '').trim() };
    }),
  };
}));

for (let i = 0; i < карти.length; i++) {
  const g = геом[i];
  const p = await pixelsOf(page, `#probe .bhv4-map >> nth=${i}`);
  const y0 = Math.round(g.trackTop), y1 = Math.round(g.trackTop + g.trackH);
  console.log(`\n═══ картка ${i} (${i ? 'enroute, progress 42%' : 'waiting, progress 0'}) — смуга шкали y=${y0}..${y1 - 1}, висота знімка ${p.h}`);
  const стовпчик = x => {
    const рядки = [];
    for (let y = y0 - 6; y < y1 + 6; y++) {
      if (y < 0 || y >= p.h) continue;
      рядки.push(`${String(y).padStart(3)}${y >= y0 && y < y1 ? '▮' : ' '} ${p.hex(p.px(x, y))} ярк=${String(p.ярк(p.px(x, y))).padStart(5)}`);
    }
    return рядки;
  };
  for (const d of g.dots) {
    console.log(`— крапка x=${d.x} [${d.cls || 'звичайна'}]`);
    console.log(стовпчик(d.x).map(s => '   ' + s).join('\n'));
  }
  // між крапками
  const між = Math.round((g.dots[1].x + g.dots[2].x) / 2);
  console.log(`— МІЖ крапками x=${між}`);
  console.log(стовпчик(між).map(s => '   ' + s).join('\n'));
}

await browser.close(); await stop();
