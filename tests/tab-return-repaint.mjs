// tests/tab-return-repaint.mjs — ПОВЕРНЕННЯ НА ВКЛАДКУ НЕ БЛИМАЄ.
// Заведено 15.08.2026 на скаргу Вови.
//
// 🔴 ЩО ОХОРОНЯЄМО. Слова Вови: «заходжу на стрічку, виходжу на іншу вкладку,
// заходжу знов — весь контент, вся сторінка ніби блимає, ніби перезавантажується.
// Так само в вкладці Дошка».
// Корінь: обидві зони на кожне повернення робили ПОВНУ заміну `innerHTML`, і вузли
// `<img>` створювались наново — фотографії починали завантаження з нуля.
// Заміряно приладом `tests/tools/tab-return-flash.mjs` (фото по мережі, затримка
// 40мс): **5 кадрів, у яких жодна з 12 фотографій не намальована**.
//
// 🔑 СТЕНД ГАНЯЄ СПРАВЖНІЙ КОД: `paintIfChanged`/`forgetPaint` беруться текстом із
// `src/core/list-patch.js`. Копія тут перевіряла б саму себе.
//
// ⚠️ ЧОМУ ФОТО МЕРЕЖЕВІ, А НЕ `data:`. Перша редакція приладу-розвідника брала
// `data:`-картинки — вони декодуються СИНХРОННО, і замір показав «0 кадрів без
// картинок», тобто «блиму немає» на коді, який блимає. **20-й випадок брехливої
// мірки в проєкті.** Тут фото віддаються перехопленим маршрутом із затримкою.
import { chromium } from 'playwright';
import { launch, reporter, projectFile } from './_lib.mjs';

const { ok, done } = reporter();

// Контроль (доведення падінням) — версія list-patch.js ДО фікса:
//   BUNDLE_REV=origin/main node tests/tab-return-repaint.mjs
const REV = process.env.BUNDLE_REV || '';
const SRC = projectFile('src/core/list-patch.js', REV);

function grab(name) {
  const i = SRC.indexOf(`export function ${name}(`);
  if (i < 0) return null;
  let d = 0, started = false;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') { d++; started = true; }
    else if (SRC[j] === '}') { d--; if (started && d === 0) return SRC.slice(i, j + 1).replace('export ', ''); }
  }
  return null;
}
// Стара поведінка: малюємо ЗАВЖДИ. Саме її й міряє контрольний прогін.
const LEGACY = `function paintIfChanged(el, html) { el.innerHTML = html; return true; }
function forgetPaint() {}`;
const painted = SRC.includes('const _painted = new WeakMap()') ? 'const _painted = new WeakMap();' : '';
const fns = grab('paintIfChanged');
const FIXED = !!fns;
const code = FIXED ? `${painted}\n${fns}\n${grab('forgetPaint') || 'function forgetPaint(){}'}` : LEGACY;
console.log(`\n── код: ${FIXED ? 'З ФІКСОМ' : '🕰 СТАРИЙ (контроль)'}${REV ? `  [${REV}]` : ''}`);

const html = `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  .card{padding:10px;border-bottom:1px solid #eee}
  .card img{width:100%;height:120px;object-fit:cover;display:block}
</style>
<div id="list"></div>
<script>
${code}
const N = 12;
let data = Array.from({length: N}, (_, i) => ({ id: i, text: 'Допис ' + i }));
// ⚠️ Абсолютний URL: сторінка на about:blank, відносний шлях не став би запитом.
const cardHtml = p => '<div class="card" data-post="' + p.id + '">'
  + '<img src="http://cstl.test/photo-' + p.id + '.svg">'
  + '<div class="t">' + p.text + '</div></div>';
const list = document.getElementById('list');
const build = () => data.map(cardHtml).join('');

window.__render = () => paintIfChanged(list, build());
window.__render();

window.__drawn = () => [...list.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth > 0).length;
window.__firstNode = () => list.querySelector('.card');
window.__setText = (i, s) => { data[i] = { ...data[i], text: s }; };
window.__forget = () => forgetPaint(list);
// Точкова зміна повз render — як patchPostCard у застосунку.
window.__patchOne = (i, s) => {
  list.querySelector('[data-post="' + i + '"] .t').textContent = s;
};
</script>`;

const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
await p.route('**/photo-*.svg', async r => {
  await new Promise(res => setTimeout(res, 40));
  r.fulfill({ contentType: 'image/svg+xml',
              body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="120"><rect width="100%" height="100%" fill="#ccc"/></svg>' });
});
await p.setContent(html);
await p.waitForTimeout(300);

// Скільки кадрів після виклику render фотографії неповні. Це і є «блим».
async function flashFrames() {
  await p.waitForFunction(() => window.__drawn() === 12, null, { timeout: 6000 });
  const nodeBefore = await p.evaluateHandle(() => window.__firstNode());
  const frames = await p.evaluate(async () => {
    const out = [];
    window.__render();
    for (let i = 0; i < 20; i++) { out.push(window.__drawn()); await new Promise(r => requestAnimationFrame(r)); }
    return out;
  });
  const nodeAfter = await p.evaluateHandle(() => window.__firstNode());
  const same = await p.evaluate(([a, b]) => a === b, [nodeBefore, nodeAfter]);
  return { blank: frames.filter(f => f < 12).length, same, frames };
}

// 1. 🔴 ГОЛОВНЕ: дані ТІ САМІ — екран не має здригнутись жодним кадром.
const again = await flashFrames();
console.log(`   кадри при незмінних даних: ${again.frames.join(', ')}`);
ok('🔴 повернення при незмінних даних не дає жодного кадру без фото',
   again.blank === 0, `${again.blank} кадрів`);
ok('вузли карток ті самі — DOM не перестворено', again.same,
   again.same ? '' : 'перестворено');

// 2. Дані ЗМІНИЛИСЬ — перемальовка мусить статись (інакше «фікс» ховав би новини).
await p.evaluate(() => window.__setText(0, 'Оновлений допис'));
await p.evaluate(() => window.__render());
await p.waitForTimeout(120);
const shown = await p.evaluate(() => document.querySelector('[data-post="0"] .t').textContent);
ok('зміна даних доїжджає до екрана', shown === 'Оновлений допис', shown);

// 3. 🛑 Точкова зміна повз render + скидання підпису: наступний render мусить
//    перемалювати, навіть якщо рядок розмітки збігається з памʼяттю.
//    Без цього був би ТИХИЙ баг — екран лишався б зі старим вмістом.
await p.evaluate(() => { window.__patchOne(1, 'Змінено точково'); window.__forget(); });
await p.evaluate(() => window.__render());
await p.waitForTimeout(120);
const back = await p.evaluate(() => document.querySelector('[data-post="1"] .t').textContent);
ok('🛑 після точкової зміни + forgetPaint екран перемальовується',
   back === 'Допис 1', `у DOM: "${back}"`);

// 4. Контроль самого приладу: якщо малювати БЕЗУМОВНО, блим мусить зʼявитись.
//    Інакше перевірка 1 нічого не доводить — вона могла б бути зеленою на будь-чому.
await p.evaluate(() => { window.__forget(); });
const forced = await flashFrames();
console.log(`   кадри при безумовній перемальовці: ${forced.frames.join(', ')}`);
ok('КОНТРОЛЬ: безумовна перемальовка справді дає блим',
   forced.blank > 0, `${forced.blank} кадрів без фото`);

await b.close();
done();
