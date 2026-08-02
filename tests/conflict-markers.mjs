// tests/conflict-markers.mjs — сторож слідів мерджу в робочих файлах.
//
// НАВІЩО. Це трапилось у проєкті вже ДВІЧІ:
//   10.07 — маркери конфлікту потрапили в `sw.js` і зламали Service Worker;
//   02.08 — `<<<<<<< HEAD` заїхав у `style/community.css` і ПРОЙШОВ У ПРОД.
// Другий випадок показовий саме тим, що нічого не «падало»: CSS не має синтаксичних
// помилок у сенсі «файл не читається» — парсер просто мовчки викидає правило, яке
// стоїть одразу за маркером. У нас так зникло `.cm-ad-hero`, і фото в модалці
// оголошення малювалось на повну натуральну висоту (932px замість 38dvh ≈ 321px).
// Ні збірка, ні `node --check`, ні решта стендів цього НЕ ловили — тому окремий сторож.
//
// Міряємо ФАЙЛИ, які реально їдуть на прод: код, стилі, розмітку, дані.
// Документацію (`*.md`) теж перевіряємо — маркер там означає загублений шматок тексту.

import { readdirSync, readFileSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, relative, extname } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Теки, куди не заглядаємо: чуже (node_modules), згенероване (shots), історія git.
const SKIP_DIRS = new Set(['node_modules', '.git', 'shots', '.github/workflows/_cache']);
const EXTS = new Set(['.js', '.mjs', '.css', '.html', '.json', '.md', '.sql', '.py', '.yml', '.yaml', '.ts']);

// ⚠️ Шукаємо маркери ТІЛЬКИ на початку рядка і рівно у канонічному вигляді.
// Інакше сторож ловив би сам себе (у цьому файлі маркери згадані в тексті) і будь-який
// рядок `=======` у рамці коментаря. `>` у git-маркері рівно сім штук.
const RE = /^(<{7} |={7}$|>{7} )/;

const hits = [];
let scanned = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(ROOT, full);
    if (SKIP_DIRS.has(name) || SKIP_DIRS.has(rel)) continue;
    const st = statSync(full);
    if (st.isDirectory()) { walk(full); continue; }
    if (!EXTS.has(extname(name))) continue;
    if (full === fileURLToPath(import.meta.url)) continue;   // сам сторож
    scanned++;
    const lines = readFileSync(full, 'utf8').split('\n');
    lines.forEach((l, i) => { if (RE.test(l)) hits.push(`${rel}:${i + 1}  ${l.slice(0, 40)}`); });
  }
}
walk(ROOT);

// ── Контроль: сторож мусить ловити те, заради чого заведений ──────────────────
// Без цього «0 знахідок» не доводить нічого — так само виглядав би зламаний пошук.
const CONTROL = ['<' + '<<<<<< HEAD', 'body { color: red }', '=' + '======', '>' + '>>>>>> origin/main'];
const controlHits = CONTROL.filter(l => RE.test(l)).length;

let ok = 0, total = 0;
const check = (name, cond) => { total++; if (cond) { ok++; console.log(`  ✅ ${name}`); }
                                else console.log(`  ❌ ${name}`); };

console.log(`\n🔍 Сліди мерджу — переглянуто файлів: ${scanned}\n`);
check('контроль: три маркери з чотирьох рядків розпізнано', controlHits === 3);
check('у робочих файлах маркерів немає', hits.length === 0);
if (hits.length) hits.forEach(h => console.log('     ▸ ' + h));

console.log(`\n${ok === total ? '✅' : '❌'} ${ok}/${total} перевірок пройдено\n`);
process.exit(ok === total ? 0 : 1);
