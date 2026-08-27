#!/usr/bin/env node
// Перевірка синтаксису ОДНОГО файлу — заміна `node --check` (27.08).
//
// 🔴 ЧОМУ ЦЕ ЗʼЯВИЛОСЬ. `node --check` на файлах із `import`/`export` не робить
// НІЧОГО і виходить з кодом 0. Тобто на всьому `src/` він мовчки казав «помилок
// немає» — включно з файлом, у якому рядок коментаря починався з `#` замість `//`.
// Заміряно 27.08 на двох рядках:
//     printf 'const a = 1;\n# не коментар\n' > /tmp/h.js && node --check /tmp/h.js  → код 1 ✅
//     printf 'export const a = 1;\n# не коментар\n' > /tmp/m.js && node --check /tmp/m.js → код 0 ❌
// Різниця одна — `export`. А весь наш `src/` саме такий.
//
// 🔑 Тут розбір робить esbuild — той самий, що збирає `bundle.js`, тобто перевірка
// і збірка бачать код однаково. Другої думки про синтаксис у проєкті не виникає.
//
// Запуск:  node scripts/check-syntax.mjs <файл.js> [ще файли…]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const файли = process.argv.slice(2);
if (!файли.length) {
  console.error('Вжиток: node scripts/check-syntax.mjs <файл.js> …');
  process.exit(2);
}

let погано = 0;
for (const f of файли) {
  try {
    // `format: 'esm'` — бо наш код це модулі; саме на них `node --check` і сліпнув.
    esbuild.transformSync(readFileSync(f, 'utf8'), { loader: 'js', format: 'esm', sourcefile: f });
    console.log(`✓ синтаксис OK: ${f}`);
  } catch (e) {
    погано++;
    const m = (e.errors && e.errors[0]) || {};
    const де = m.location ? ` (рядок ${m.location.line})` : '';
    console.error(`✗ ПОМИЛКА синтаксису: ${f}${де} — ${m.text || e.message}`);
  }
}
process.exit(погано ? 1 : 0);
