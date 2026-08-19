// Стенд: СВАЙП НАЗАД «ЗВІДКИ ЗАВГОДНО» на повноекранних шарах.
//
// 🔴 ЗАРАДИ ЧОГО. 19.08 Вова: «коли я закриваю сторінки свайпом з лівої частини
// екрану, мені треба палець ставити аж на самий край, важко дотягнутись». Досі
// цей жест обслуговувала iOS, а ширину її зони задає Apple. Тому додано ВЛАСНИЙ
// жест, який починається ПІСЛЯ системної смуги.
//
// 🛑 ЧОМУ ЦЕ НЕБЕЗПЕЧНЕ МІСЦЕ, І ЧОМУ СТЕНД ТУТ ОБОВʼЯЗКОВИЙ. Власний свайп у
// цьому проєкті вже двічі ламався (24.07, скріни IMG_3557/IMG_3559; 02.08,
// IMG_3816) — щоразу тим, що накладався на системний або на чужий жест. Тобто
// це не «нова фіча», а повернення до місця, де вже двічі обпеклись. Тому
// перевіряється не «закриває», а насамперед **де він мовчить**:
//   • у системній смузі (перші 28px) — там хазяїн iOS;
//   • при вертикальному русі — це прокрутка;
//   • при русі вліво — це не «назад»;
//   • там, де горизонталь уже щось означає (`data-swipe-own`);
//   • у бічному скролері, якому ще є куди їхати.
//
// ⚠️ ЧОГО ЦЕЙ СТЕНД НЕ ДОВОДИТЬ: Chromium не відтворює ні системний жест iOS, ні
// його анімацію. «Чи не сваряться два жести на живому iPhone» перевіряє тільки
// палець Вови — і це сказано йому прямо.
import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';

const { ok, done } = reporter();

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  serviceWorkers: 'block',
});
const p = await ctx.newPage();

// Піднімаємо ЖИВИЙ модуль `core/layers.js` на порожній сторінці — без застосунку.
// Так стенд міряє саме жест, а не збіг обставин конкретного екрана, і не залежить
// від даних, входу чи мережі.
await p.goto(url + '/', { waitUntil: 'domcontentloaded' });

await p.evaluate(async (base) => {
  const m = await import(base + '/src/core/layers.js');
  window.__layers = m;

  const екран = document.createElement('div');
  екран.id = 'сцена';
  екран.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:9999';
  екран.innerHTML = `
    <div id="звичайне" style="height:400px">звичайна ділянка</div>
    <div id="свій" data-swipe-own style="height:120px;background:#eee">свій жест</div>
    <div id="скролер" style="overflow-x:auto;white-space:nowrap;height:80px">
      <div style="width:2000px">широкий вміст</div>
    </div>`;
  document.body.appendChild(екран);

  window.__closed = false;
  window.__layer = m.openLayer(() => { window.__closed = true; екран.remove(); }, { el: екран });
}, url);

// Свайп справжніми подіями дотику: touchstart → кілька touchmove → touchend.
// Кроків кілька навмисно — обробник ухвалює рішення про напрям на першому
// помітному русі, і одним стрибком цей шлях не пройшовся б.
async function свайп(p, { x, y, dx, dy = 0, ціль = '#сцена' }) {
  await p.evaluate(async ([sel, x, y, dx, dy]) => {
    const el = document.querySelector(sel);
    const точка = (cx, cy) => new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy });
    const кинути = (type, cx, cy) => {
      const t = точка(cx, cy);
      el.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true,
        touches: type === 'touchend' ? [] : [t],
        changedTouches: [t], targetTouches: type === 'touchend' ? [] : [t],
      }));
    };
    кинути('touchstart', x, y);
    for (let i = 1; i <= 6; i++) {
      кинути('touchmove', x + (dx * i) / 6, y + (dy * i) / 6);
      await new Promise(r => setTimeout(r, 16));
    }
    кинути('touchend', x + dx, y + dy);
  }, [ціль, x, y, dx, dy]);
  await p.waitForTimeout(450);   // доїзд анімації + закриття
}

const закрито = () => p.evaluate(() => window.__closed);
const відновити = () => p.evaluate(async () => {
  document.querySelector('#сцена')?.remove();
  const m = window.__layers;
  const екран = document.createElement('div');
  екран.id = 'сцена';
  екран.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:9999';
  екран.innerHTML = `
    <div id="звичайне" style="height:400px">звичайна ділянка</div>
    <div id="свій" data-swipe-own style="height:120px;background:#eee">свій жест</div>
    <div id="скролер" style="overflow-x:auto;white-space:nowrap;height:80px">
      <div style="width:2000px">широкий вміст</div>
    </div>`;
  document.body.appendChild(екран);
  window.__closed = false;
  window.__layer = m.openLayer(() => { window.__closed = true; екран.remove(); }, { el: екран });
});

// ── 1. ГОЛОВНЕ: жест працює З СЕРЕДИНИ екрана ────────────────────────────────
await свайп(p, { x: 200, y: 200, dx: 160 });
ok('🔴 свайп управо з СЕРЕДИНИ екрана закриває (те, чого просив Вова)', await закрито());

// 🔴 ІСТОРІЯ НЕ РОЗʼЇХАЛАСЬ. Закриття мусить іти через `closeLayer` → історія
// знімає свій запис. Інакше наступний «назад» зʼїв би порожній запис вхолосту —
// саме через це 24.07 з-під сторінки виїжджала Дошка.
// ⚠️ Перевірка стоїть САМЕ ТУТ, поки стек чистий: сценарії нижче навмисно
// лишають шари відкритими (вони й мають не закриватись), тож у кінці файлу це
// міряло б облік самого стенда, а не поведінку продукту.
ok('🔴 після закриття свайпом відкритих шарів не лишилось',
   (await p.evaluate(() => window.__layers.hasOpenLayer())) === false);

// ── 2. Де він мусить мовчати ─────────────────────────────────────────────────
await відновити();
await свайп(p, { x: 10, y: 200, dx: 160 });
ok('🔴 у системній смузі (перші 28px) НЕ втручаємось — там хазяїн iOS',
   (await закрито()) === false);

await відновити();
await свайп(p, { x: 200, y: 200, dx: 0, dy: 200 });
ok('🔴 вертикальний рух не закриває (це прокрутка)', (await закрито()) === false);

await відновити();
await свайп(p, { x: 200, y: 200, dx: 120, dy: 140 });
ok('🔴 діагональний рух лишається прокруткою (горизонталь не переважає)',
   (await закрито()) === false);

await відновити();
await свайп(p, { x: 200, y: 200, dx: -160 });
ok('свайп ВЛІВО не закриває (назад — це тільки вправо)', (await закрито()) === false);

await відновити();
await свайп(p, { x: 200, y: 200, dx: 40 });
ok('короткий рух (40px) не закриває — намір має бути виразним',
   (await закрито()) === false);

// ── 3. Чужі жести ────────────────────────────────────────────────────────────
await відновити();
await свайп(p, { x: 200, y: 450, dx: 160, ціль: '#свій' });
ok('🔴 там, де горизонталь УЖЕ щось означає (`data-swipe-own`), жест не наш',
   (await закрито()) === false);

// Бічний скролер, який ще МОЖЕ поїхати вправо (scrollLeft > 0) — жест його.
await відновити();
await p.evaluate(() => { document.querySelector('#скролер').scrollLeft = 300; });
await свайп(p, { x: 200, y: 545, dx: 160, ціль: '#скролер' });
ok('🔴 у бічному скролері з `scrollLeft > 0` жест належить йому, не нам',
   (await закрито()) === false);

// А коли скролер уже в самому початку — гортати вправо нікуди, жест наш.
await відновити();
await p.evaluate(() => { document.querySelector('#скролер').scrollLeft = 0; });
await свайп(p, { x: 200, y: 545, dx: 160, ціль: '#скролер' });
ok('коли скролер на початку — гортати вправо нікуди, тож закриваємо',
   await закрито());

await b.close();
await stop();
done();
