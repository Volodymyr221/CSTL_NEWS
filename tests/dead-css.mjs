// Стенд №40: МЕРТВИЙ CSS ДОШКИ — сторож, щоб він не накопичився знову.
//
// 🔴 НАВІЩО (аудит 05.08). У `style/community.css` лежало **104 правила на 680
// рядків**, чиї класи не згадувались у жодному JS чи HTML: залишки старого чату
// (`bd-chat-*`), бульбашок повідомлень (`bd-msg-*`), «привітань» (`bd-greet-*`),
// корка (`cm-board-corkboard`), вкладок (`bd-tab*`), перемикача типів (`bm-type-*`).
//
// ⚠️ Шкода не у вазі файлу, а в тому, що мертвий CSS **бреше наступній сесії**:
// `.bd-tabs` виглядає як чинна частина Дошки, і хтось витрачає час, зʼясовуючи,
// чому воно не малюється. Гірше того — на цьому вже підвівся СТОРОЖ: сцена
// `board-cream.mjs` містила `bm-type-tabs`, якого в застосунку немає, тобто
// перевіряла неіснуючий екран і виглядала повнішою, ніж була.
//
// 🔑 ЧОМУ ПОРІГ, А НЕ НУЛЬ. Нуль тут був би хибною точністю: класи можуть
// збиратись у рядок (`cm-board-cat--${color}`), і такий випадок скан не бачить.
// Тому динамічні кольори категорій читаються з `board-categories.js` і
// виключаються, а на решту лишається невеликий запас. Стенд не каже «жодного
// мертвого класу» — він каже «нової купи не наросло».
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { ROOT, reporter } from './_lib.mjs';

const { ok, done } = reporter('dead-css');

// Скільки мертвих класів терпимо. 0 було б крихко (див. шапку), 10 — це рівно
// той запас, за яким уже видно системне накопичення, а не одиничний недогляд.
const LIMIT = 10;
const PAT = /\.((?:bd|cm-board|board|bm|cm-ad)[\w-]*)/g;

// 🔴 КОМЕНТАРІ ВИРІЗАЄМО ПЕРЕД СКАНОМ. Без цього стенд рахував мертвими класи,
// які згадані ЛИШЕ в поясненні («🗑 `.board-vignette--bottom` ВИДАЛЕНО…») —
// тобто сам себе спіймав на записці про те, що клас уже прибрано. Це рівно та
// хвороба, від якої стенд і охороняє: перевіряти форму запису замість наслідку.
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ');

const css = stripComments(readFileSync(join(ROOT, 'style/community.css'), 'utf8'));

// Уся розмітка і код, де клас може вживатись.
function collect(dir, acc = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) collect(p, acc);
    else if (/\.(js|html)$/.test(f)) acc.push(p);
  }
  return acc;
}
let src = '';
for (const f of collect(join(ROOT, 'src'))) src += readFileSync(f, 'utf8');
for (const f of ['index.html', 'admin.html']) src += readFileSync(join(ROOT, f), 'utf8');

// Динамічні класи — кольори категорій збираються рядком, скан їх не побачить.
const cats = readFileSync(join(ROOT, 'src/core/board-categories.js'), 'utf8');
const dynamic = new Set([...cats.matchAll(/color: *'([a-z]+)'/g)].map(m => 'cm-board-cat--' + m[1]));

const declared = new Set([...css.matchAll(PAT)].map(m => m[1]));
const dead = [...declared].filter(c => !src.includes(c) && !dynamic.has(c)).sort();

ok(`🔴 мертвих класів Дошки не більше ${LIMIT}`, dead.length <= LIMIT,
   `${dead.length} з ${declared.size}${dead.length ? ': ' + dead.slice(0, 12).join(', ') : ''}`);

// Окремо — класи, що вже поверталися. Саме ці групи прибрали 05.08, і саме вони
// найімовірніше приповзуть назад разом зі старим шматком CSS.
const GONE = ['bd-tabs', 'bd-msg-bubble', 'bd-greet-body', 'cm-board-corkboard', 'bm-type-tabs'];
for (const g of GONE) {
  ok(`викинуте не повернулось: ${g}`, !declared.has(g) || src.includes(g));
}

// 🔴 СЦЕНИ СТЕНДІВ — ТЕЖ КОД. `board-cream.mjs` будує власну розмітку, і саме
// вона розійшлась із застосунком. Якщо сцена згадує клас, якого немає ні в
// застосунку, ні в CSS, — сторож охороняє порожнечу.
const scene = stripComments(readFileSync(join(ROOT, 'tests/board-cream.mjs'), 'utf8'))
  .replace(/<!--[\s\S]*?-->/g, ' ');   // сцена — HTML, у ній свої коментарі
const sceneOnly = [...new Set([...scene.matchAll(PAT)].map(m => m[1]))]
  .filter(c => !src.includes(c) && !declared.has(c) && !dynamic.has(c));
ok('сцена board-cream не описує неіснуючих екранів', sceneOnly.length === 0, sceneOnly.join(', '));

// ── КОНТРОЛЬ: перевірка вміє падати ────────────────────────────────────────
const fakeCss = '.bd-nonexistent-zzz { color: red }';
const fakeDead = [...new Set([...fakeCss.matchAll(PAT)].map(m => m[1]))]
  .filter(c => !src.includes(c));
ok('контроль: скан справді знаходить мертвий клас', fakeDead.length === 1, fakeDead.join(','));

done();
