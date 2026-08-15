// tests/tools/display-none-flash.mjs — КОНТРОЛЬНИЙ ДОСЛІД, не сторож.
//
// 🔴 ПИТАННЯ. Після фікса `paintIfChanged` (PR #921) Вова сказав: **«блим є досі»**.
// Тобто я полікував НЕ ГОЛОВНУ причину, або не єдину.
//
// Що лишилось неперевіреним: сам механізм перемикання вкладок. `switchTab`
// (`src/app.js`) ховає сторінку через **`display: none`** і показує через
// `display: block`. Прихований `display:none` вузол не має коробки взагалі —
// браузер має право звільнити декодовані зображення, а на поверненні декодувати
// їх заново. DOM при цьому НЕ чіпається, тож `paintIfChanged` на це не впливає
// в принципі.
//
// ➡️ МІРЯЄМО ТРИ СПОСОБИ сховати вкладку на однаковому вмісті:
//    display:none · visibility:hidden · зсув за екран (`transform`).
// Якщо перший дає кадри без картинок, а інші ні — корінь знайдено, і лікування
// лежить у способі приховування, а не в перемальовці.
//
// ⚠️ Фото ПО МЕРЕЖІ з затримкою: `data:`-картинки декодуються синхронно і сховали б
// саме те, що шукаємо (це вже коштувало одного хибного висновку — 20-й випадок
// брехливої мірки в проєкті).
import { chromium } from 'playwright';
import { launch } from '../_lib.mjs';

const html = `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  .page{padding:8px}
  .card{padding:10px;border-bottom:1px solid #eee}
  .card img{width:100%;height:120px;object-fit:cover;display:block}
  /* три способи сховати — рівно ті, між якими вибираємо */
  .hide-display    { display: none; }
  .hide-visibility { visibility: hidden; }
  .hide-offscreen  { transform: translateX(-200vw); }
</style>
<div id="page" class="page"></div>
<script>
const N = 12;
const page = document.getElementById('page');
page.innerHTML = Array.from({length: N}, (_, i) =>
  '<div class="card"><img src="http://cstl.test/photo-' + i + '.svg"><div>Допис ' + i + '</div></div>').join('');

window.__drawn = () => [...page.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth > 0).length;
window.__hide = (cls) => { page.className = 'page ' + cls; };
window.__show = () => { page.className = 'page'; };
</script>`;

const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
                                 deviceScaleFactor: 3 });
const p = await ctx.newPage();
await p.route('**/photo-*.svg', async r => {
  await new Promise(res => setTimeout(res, 40));
  r.fulfill({ contentType: 'image/svg+xml',
              body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><rect width="100%" height="100%" fill="#c8c8c8"/></svg>' });
});
await p.setContent(html);
await p.waitForFunction(() => window.__drawn() === 12, null, { timeout: 8000 });

// Сховати → почекати (як людина, що пішла на іншу вкладку) → показати → лічити кадри.
async function cycle(label, cls, awayMs) {
  await p.evaluate(() => window.__show());
  await p.waitForFunction(() => window.__drawn() === 12, null, { timeout: 8000 });
  await p.evaluate(c => window.__hide(c), cls);
  await p.waitForTimeout(awayMs);
  const frames = await p.evaluate(async () => {
    const out = [];
    window.__show();
    for (let i = 0; i < 20; i++) { out.push(window.__drawn()); await new Promise(r => requestAnimationFrame(r)); }
    return out;
  });
  const blank = frames.filter(f => f < 12).length;
  console.log(`   ${label.padEnd(24)} кадрів без фото: ${String(blank).padStart(2)}   ${frames.slice(0, 8).join(',')}…`);
  return blank;
}

console.log('🔬 ЧИ ДАЄ СПАЛАХ САМ СПОСІБ ПРИХОВУВАННЯ ВКЛАДКИ');
console.log('   (DOM не чіпається взагалі — міняється лише CSS)\n');

for (const away of [300, 3000]) {
  console.log(`── людина була на іншій вкладці ${away}мс`);
  await cycle('display: none', 'hide-display', away);
  await cycle('visibility: hidden', 'hide-visibility', away);
  await cycle('зсув за екран', 'hide-offscreen', away);
  console.log('');
}

await b.close();
