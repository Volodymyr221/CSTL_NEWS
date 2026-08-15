// tests/tools/click-target-probe.mjs — КОНТРОЛЬНИЙ ДОСЛІД, не сторож.
//
// 🔴 ПИТАННЯ. Скарга Вови 15.08: у листі коментарів «Стрічки» після кількох
// натисків «Відповісти» поспіль лист САМОВІЛЬНО згортається.
// Закриття висить на `click` по контейнеру і довіряє `e.target`
// (`src/tabs/feed.js:1760`):
//     sheet.addEventListener('click', e => { if (e.target === sheet || e.target === vpEl) close(); });
// Тобто будь-що, через що палець «опиняється» на задньому шарі, закриває лист.
// Досліджуємо ДВА шляхи, якими це може статись, і міряємо кожен окремо.
//
// ⚠️ МІРЯЄМО ПАЛЬЦЕМ, А НЕ МИШЕЮ. Перша редакція цього приладу ганяла
// `mouse.down()/up()` і показала «click не генерується» — тобто МАЛО НЕ ЗАКРИЛА
// розслідування хибним висновком. У Вови сенсорний екран, а touch і mouse
// проходять різними шляхами генерації `click`. Тут — справжні дотики через CDP
// (`Input.dispatchTouchEvent`), між якими можна вклинити зміну розкладки.
//
// 🔑 ЧОМУ ОКРЕМИМ ДОСЛІДОМ, А НЕ ОДРАЗУ СТОРОЖЕМ: це поведінка САМОГО РУШІЯ.
// У проєкті вже 17 випадків, коли перевірка міряла не те, що здавалось.
// Спершу міряємо рушій, потім застосунок.
import { chromium } from 'playwright';
import { launch } from '../_lib.mjs';

const html = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  #back{position:fixed;inset:0;background:rgba(0,0,0,.4)}
  #vp{position:fixed;inset:0}
  /* Аркуш прибитий до низу — рівно як .fd-com-sheet */
  #sheet{position:absolute;left:0;right:0;bottom:0;background:#fff;height:var(--h,400px)}
  #list{height:100%;overflow:auto}
  .row{padding:18px}
  button{padding:12px 18px;font:16px system-ui}
</style>
<div id="back"><div id="vp"><div id="sheet">
  <div id="list"><div class="row"><button id="reply">Відповісти</button></div></div>
</div></div></div>
<script>
  window.__log = [];
  const back = document.getElementById('back'), vp = document.getElementById('vp');
  const sheet = document.getElementById('sheet'), list = document.getElementById('list');
  // ТОЧНА копія умови закриття з feed.js:1760.
  back.addEventListener('click', e => {
    window.__log.push({ where: 'контейнер', target: e.target.id || e.target.className || e.target.tagName,
                        wouldClose: e.target === back || e.target === vp });
  });
  list.addEventListener('click', e => {
    window.__log.push({ where: 'список', target: e.target.id || e.target.className || e.target.tagName,
                        hitReply: !!e.target.closest('#reply') });
  });
  // (А) realtime: renderCommentSheet() робить listEl.innerHTML = … (feed.js:1444)
  window.__wipe = () => { list.innerHTML = '<div class="row"><button id="reply">Відповісти</button></div>'; };
  // (Б) клавіатура згорнулась: знімається повна висота, аркуш стискається донизу
  //     (feed.js setComSheetFull / --full знімається на blur).
  window.__shrink = () => { sheet.style.setProperty('--h', '200px'); };
  window.__geom = () => {
    const r = document.getElementById('reply').getBoundingClientRect();
    return { top: Math.round(r.top), h: Math.round(document.getElementById('sheet').getBoundingClientRect().height) };
  };
</script>`;

async function scenario(label, mutate, { fullHeight = 400 } = {}) {
  const b = await launch(chromium);
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.setContent(html);
  await p.evaluate(h => document.getElementById('sheet').style.setProperty('--h', h + 'px'), fullHeight);
  await p.waitForTimeout(60);

  const cdp = await ctx.newCDPSession(p);
  const box = await p.locator('#reply').boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const before = await p.evaluate(() => window.__geom());

  // Палець ліг на кнопку.
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  // …і саме в цю мить розкладка міняється.
  if (mutate) await p.evaluate(m => window['__' + m](), mutate);
  await p.waitForTimeout(16);
  const after = await p.evaluate(() => window.__geom());
  // Палець піднявся — з ТІЄЇ САМОЇ точки екрана.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(80);

  const log = await p.evaluate(() => window.__log);
  const under = await p.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el ? (el.id || el.className || el.tagName) : 'нічого';
  }, { x, y });
  await b.close();

  console.log(`\n── ${label}`);
  console.log(`   кнопка «Відповісти»: top ${before.top} → ${after.top}   висота аркуша ${before.h} → ${after.h}`);
  console.log(`   під пальцем у момент відпускання: ${under}`);
  if (!log.length) console.log('   click НЕ згенеровано');
  log.forEach(l => console.log(`   click у «${l.where}»: target=${l.target}` +
    (l.wouldClose !== undefined ? `   ЗАКРИЛО Б ЛИСТ: ${l.wouldClose ? '🔴 ТАК' : 'ні'}` : '') +
    (l.hitReply !== undefined ? `   влучив у «Відповісти»: ${l.hitReply ? '✅ так' : '🔴 НІ'}` : '')));
  return { closed: log.some(l => l.wouldClose), hit: log.some(l => l.hitReply), under, before, after };
}

console.log('🔬 ЧОМУ ЛИСТ КОМЕНТАРІВ ЗГОРТАЄТЬСЯ САМ');
console.log('   Умова закриття (feed.js:1760): e.target === sheet || e.target === vpEl');
console.log('   Дотики справжні (CDP Input.dispatchTouchEvent), не миша.');

const base = await scenario('КОНТРОЛЬ: нічого не міняється (так має бути завжди)', null);
const wipe = await scenario('(А) realtime перемалював список під пальцем (innerHTML)', 'wipe');
const shrink = await scenario('(Б) аркуш стиснувся під пальцем (клавіатура згорнулась)', 'shrink');

console.log('\n── ВИСНОВОК');
const verdict = (n, r) => console.log(`   ${n.padEnd(46)} ${r.closed ? '🔴 ЛИСТ ЗАКРИВСЯ Б' : (r.hit ? '✅ спрацювала кнопка' : '⚠️ тап пропав даремно')}`);
verdict('контроль (нічого не міняли)', base);
verdict('(А) перемальовка списку', wipe);
verdict('(Б) стиснення аркуша', shrink);
