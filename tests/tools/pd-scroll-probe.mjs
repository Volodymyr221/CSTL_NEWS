// tests/tools/pd-scroll-probe.mjs — КОНТРОЛЬНИЙ ДОСЛІД перед фіксом, не сторож.
//
// 🔴 ПИТАННЯ. Рубіж 2 лікування листа коментарів — не давати полю втратити фокус
// при тапі по кнопці (`preventDefault` на `pointerdown`, як уже зроблено для
// «Надіслати», `feed.js:1958`). Але кнопки «Відповісти»/«Редагувати»/«Ще N»
// стоять У СКРОЛЕРІ, на відміну від «Надіслати».
// ➡️ Чи не зламає `preventDefault` прокрутку списку пальцем, якщо жест почався
//    НА КНОПЦІ? Якщо зламає — рубіж 2 у такому вигляді непридатний.
//
// 🔑 Гадати не можна: у проєкті вже 18 випадків, коли «очевидна» поведінка
// виявлялась іншою. Міряємо `scrollTop` до і після жесту, дотики справжні (CDP).
import { chromium } from 'playwright';
import { launch } from '../_lib.mjs';

const html = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  #list{position:fixed;left:0;right:0;top:0;height:400px;overflow-y:auto;background:#fff}
  .row{padding:22px;border-bottom:1px solid #eee}
  button{padding:10px 16px;font:16px system-ui}
</style>
<div id="list"></div>
<script>
  const list = document.getElementById('list');
  list.innerHTML = Array.from({length: 30}, (_, i) =>
    '<div class="row">Коментар ' + i + ' <button class="reply">Відповісти</button></div>').join('');
  window.__armPD = () => {
    // Рівно те, що збираємось поставити: делеговано, ЛИШЕ на кнопках.
    list.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) e.preventDefault();
    });
  };
  window.__top = () => list.scrollTop;
</script>`;

async function run(withPD) {
  const b = await launch(chromium);
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.setContent(html);
  if (withPD) await p.evaluate(() => window.__armPD());
  await p.waitForTimeout(60);

  const cdp = await ctx.newCDPSession(p);
  const box = await p.locator('.reply').first().boundingBox();
  let x = box.x + box.width / 2, y = box.y + box.height / 2;

  // Жест ПОЧИНАЄТЬСЯ НА КНОПЦІ і тягне список угору.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent',
      { type: 'touchMove', touchPoints: [{ x, y: y - i * 18, id: 1 }] });
    await p.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(300);

  const scrolled = await p.evaluate(() => window.__top());
  await b.close();
  return scrolled;
}

console.log('🔬 Чи `preventDefault` на pointerdown КНОПКИ ламає прокрутку списку пальцем');
console.log('   (жест починається на самій кнопці і тягне список угору)\n');

const без = await run(false);
const з   = await run(true);

console.log(`   без preventDefault:  прокрутилось на ${без}px`);
console.log(`   з  preventDefault:   прокрутилось на ${з}px`);
console.log('\n── ВИСНОВОК');
if (без === 0) {
  console.log('   ⚠️ ПРИЛАД НЕ ДОВІВ НІЧОГО: базовий жест не прокрутив список узагалі.');
  console.log('      Спершу треба полагодити сам дослід — інакше «з preventDefault теж 0»');
  console.log('      виглядало б як доказ, не будучи ним.');
} else if (з === 0) {
  console.log('   🔴 ЛАМАЄ: прокрутка з кнопки померла → рубіж 2 у цьому вигляді непридатний');
} else {
  console.log(`   ✅ НЕ ЛАМАЄ: прокрутка збереглась (${з}px проти ${без}px)`);
}
