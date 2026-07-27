// tests/run.mjs — прогнати ВСІ стенди однією командою: `npm test`
//
// Кожен стенд — самостійний файл, який завершується кодом 0 (усе добре) або 1.
// Тут ми лише запускаємо їх по черзі й підбиваємо підсумок.
//
// Запуск одного стенда: `node tests/toast.mjs`
// Запуск підмножини:    `npm test -- toast pin`

import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const filter = process.argv.slice(2);

const stands = readdirSync(HERE)
  .filter(f => f.endsWith('.mjs') && f !== 'run.mjs' && !f.startsWith('_'))
  .filter(f => !filter.length || filter.some(q => f.includes(q)))
  .sort();

if (!stands.length) {
  console.log('Не знайшов стендів за фільтром:', filter.join(' '));
  process.exit(1);
}

console.log(`\n🧪 Стенди CSTL — запускаю ${stands.length}\n`);

const bad = [];
let total = 0, passed = 0;

for (const f of stands) {
  const r = spawnSync(process.execPath, [join(HERE, f)], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  // Останній рядок кожного стенда має вигляд «✅ 14/14 перевірок пройдено».
  const m = out.match(/([\d]+)\/([\d]+) перевірок пройдено/);
  const label = f.replace('.mjs', '');
  if (m) {
    passed += +m[1]; total += +m[2];
    console.log(`${r.status === 0 ? '✅' : '❌'} ${label.padEnd(18)} ${m[1]}/${m[2]}`);
  } else {
    console.log(`💥 ${label.padEnd(18)} впав, не дійшовши до підсумку`);
  }
  if (r.status !== 0) bad.push({ f, out });
}

// Подробиці — лише про те, що впало. Інакше в консолі каша з сотень рядків.
for (const b of bad) {
  console.log(`\n──────── ${b.f} ────────`);
  console.log(b.out.split('\n').filter(l => l.startsWith('❌') || l.includes('Error')).join('\n').slice(0, 2000));
}

console.log(`\n${bad.length ? '❌' : '✅'} стендів: ${stands.length - bad.length}/${stands.length} · перевірок: ${passed}/${total}`);
process.exit(bad.length ? 1 : 0);
