// scripts/geocode-settlements.mjs
// Один раз з'ясовує координати всіх населених пунктів громади і пише
// `data/settlements-geo.json`. Застосунок цей файл читає, якщо він є, і мовчки
// обходиться без нього, якщо немає (див. `src/core/settlements-geo.js`).
//
// НАВІЩО, якщо застосунок і сам уміє геокодувати на льоту:
//   • перший вибір села перестає залежати від того, чи відповідає Nominatim;
//   • координати стають ВІДТВОРЮВАНИМИ — той самий файл у всіх користувачів,
//     а не «що геокодер віддав саме цьому телефону саме сьогодні»;
//   • результат можна ПЕРЕЧИТАТИ очима перед тим, як він поїде людям.
//
// ⚠️ Скрипт НЕ запускається автоматично і нікуди не комітить сам. Це свідомо:
// координати мають подивитись очима, а не приймати наосліп.
//
// Запуск:  node scripts/geocode-settlements.mjs
// Потрібна мережа. У пісочниці розробки вона буває закрита — тоді скрипт чесно
// скаже, що не зміг, і НІЧОГО не запише (краще без файлу, ніж із половиною).

import { writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Список беремо з того самого файлу, що застосунок, — щоб він не міг розійтись.
const src = readFileSync(join(ROOT, 'src/core/settlements.js'), 'utf8');
const block = src.match(/export const SETTLEMENTS = \[([\s\S]*?)\];/);
if (!block) { console.error('❌ Не знайшов SETTLEMENTS у src/core/settlements.js'); process.exit(1); }
const SETTLEMENTS = [...block[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(m => m[1].replace(/\\'/g, "'"));
const NEARBY = ['Луцьк'];
const ALL = [...SETTLEMENTS, ...NEARBY];

console.log(`Геокодую ${ALL.length} пунктів (${SETTLEMENTS.length} громади + ${NEARBY.length} поруч)…\n`);

// Уточнення області обовʼязкове: «Ставок», «Котів», «Дерно» є не лише на Волині.
async function geocode(name) {
  const q = encodeURIComponent(`${name}, Волинська область, Україна`);
  const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
    headers: { 'Accept-Language': 'uk', 'User-Agent': 'CSTL-NEWS/1.0 (olykacastle@gmail.com)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const arr = await res.json();
  const hit = arr[0];
  if (!hit) return null;
  return { lat: +(+hit.lat).toFixed(5), lon: +(+hit.lon).toFixed(5), _name: hit.display_name };
}

const coords = {};
const failed = [];
for (const name of ALL) {
  try {
    const c = await geocode(name);
    if (c) {
      coords[name] = { lat: c.lat, lon: c.lon };
      console.log(`✓ ${name.padEnd(12)} ${c.lat}, ${c.lon}   ${c._name.slice(0, 60)}`);
    } else {
      failed.push(name);
      console.log(`✗ ${name.padEnd(12)} не знайдено`);
    }
  } catch (e) {
    failed.push(name);
    console.log(`✗ ${name.padEnd(12)} ${e.message}`);
  }
  // Політика Nominatim — не більше одного запиту на секунду.
  await new Promise(r => setTimeout(r, 1100));
}

if (failed.length) {
  console.error(`\n❌ Не вийшло для ${failed.length}: ${failed.join(', ')}`);
  console.error('Файл НЕ записано — половинчастий список гірший за його відсутність:');
  console.error('застосунок вважав би пропущені села «вже з\'ясованими» і не спробував би сам.');
  process.exit(1);
}

const out = {
  _note: 'Згенеровано scripts/geocode-settlements.mjs через OpenStreetMap Nominatim. ' +
         'Перед комітом координати варто перечитати очима.',
  _generated: new Date().toISOString().slice(0, 10),
  coords,
};
writeFileSync(join(ROOT, 'data/settlements-geo.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`\n✅ data/settlements-geo.json — ${Object.keys(coords).length} пунктів`);
