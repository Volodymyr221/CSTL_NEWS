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
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Олика — єдина точка, яку проєкт знає напевно (у `core/utils.js` з 04.08,
// живить погоду). Від неї міряємо «наше / не наше».
const ОЛИКА = { lat: 50.7333, lon: 25.8167 };

// 🔴 21.08 — УТОЧНЕННЯ ОБЛАСТІ ВИЯВИЛОСЬ НЕДОСТАТНІМ, і це вада цього скрипта.
// У коментарі вище раніше стояло «уточнення області обовʼязкове: „Ставок“,
// „Котів“, „Дерно“ є не лише на Волині». Правда виявилась гіршою: вони є не
// лише на Волині І ЩЕ РАЗ У САМІЙ ВОЛИНСЬКІЙ ОБЛАСТІ. Живий прогін віддав
// «Ставок, Турійська громада, Ковельський район» (102 км) і «Одеради, Луцька
// міська громада» (51 км) — обидва тезки, обидва в тій самій області.
//
// 🔑 Тому не «сподіваємось, що перша відповідь правильна», а ОБИРАЄМО СВОЮ з
// кількох. Найсильніший доказ «це наше село» — коли геокодер сам назвав нашу
// громаду в адресі.
export const СВОЯ_ГРОМАДА = /Олицьк/i;
export const МЕЖА_СЕЛА_КМ = 25;    // села громади лежать купно навколо Олики
export const МЕЖА_МІСТА_КМ = 60;   // «місто поруч» за визначенням далі, але не будь-де

export function км(a, b) {
  const R = 6371, рад = x => (x * Math.PI) / 180;
  const dφ = рад(b.lat - a.lat), dλ = рад(b.lon - a.lon);
  const h = Math.sin(dφ / 2) ** 2 +
            Math.cos(рад(a.lat)) * Math.cos(рад(b.lat)) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Вибір із кількох відповідей Nominatim. Винесено окремо і БЕЗ мережі — саме
// цей крок ламався, тож саме його треба вміти перевірити стендом.
//
// ⚠️ Збіг за громадою перевіряємо ЛИШЕ серед тих, хто вже в межах відстані:
// рядок «Олицьк» може трапитись і в чужій адресі (вулиця Олицька в іншому
// місті), і тоді назва громади доводила б не те, що ми думаємо.
export function обратиСвого(відповіді, { громада, межа }) {
  const усі = (відповіді || [])
    .filter(c => Number.isFinite(+c.lat) && Number.isFinite(+c.lon))
    .map(c => ({
      lat: +(+c.lat).toFixed(5),
      lon: +(+c.lon).toFixed(5),
      підпис: c.display_name || '',
      км: Math.round(км({ lat: +c.lat, lon: +c.lon }, ОЛИКА) * 10) / 10,
    }));

  const близькі = усі.filter(c => c.км <= межа);
  const свої = громада ? близькі.filter(c => громада.test(c.підпис)) : [];
  const пул = свої.length ? свої : близькі;
  if (!пул.length) return { обрано: null, відкинуті: усі };

  пул.sort((a, b) => a.км - b.км);
  const обрано = пул[0];
  return { обрано, відкинуті: усі.filter(c => c !== обрано) };
}

async function запит(name) {
  const q = encodeURIComponent(`${name}, Волинська область, Україна`);
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=10&addressdetails=1`,
    { headers: { 'Accept-Language': 'uk', 'User-Agent': 'CSTL-NEWS/1.0 (olykacastle@gmail.com)' } },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main() {
  // Список беремо з того самого файлу, що застосунок, — щоб він не міг розійтись.
  const src = readFileSync(join(ROOT, 'src/core/settlements.js'), 'utf8');
  const block = src.match(/export const SETTLEMENTS = \[([\s\S]*?)\];/);
  if (!block) { console.error('❌ Не знайшов SETTLEMENTS у src/core/settlements.js'); process.exit(1); }
  const SETTLEMENTS = [...block[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(m => m[1].replace(/\\'/g, "'"));
  const NEARBY = ['Луцьк'];
  const ALL = [...SETTLEMENTS, ...NEARBY];

  console.log(`Геокодую ${ALL.length} пунктів (${SETTLEMENTS.length} громади + ${NEARBY.length} поруч)…\n`);

  const coords = {};
  const failed = [];
  for (const name of ALL) {
    const своє = SETTLEMENTS.includes(name);
    const правило = { громада: своє ? СВОЯ_ГРОМАДА : null, межа: своє ? МЕЖА_СЕЛА_КМ : МЕЖА_МІСТА_КМ };
    try {
      const { обрано, відкинуті } = обратиСвого(await запит(name), правило);
      if (обрано) {
        coords[name] = { lat: обрано.lat, lon: обрано.lon };
        console.log(`✓ ${name.padEnd(12)} ${обрано.lat}, ${обрано.lon}  (${обрано.км} км)  ${обрано.підпис.slice(0, 55)}`);
      } else {
        failed.push(name);
        console.log(`✗ ${name.padEnd(12)} жодна відповідь не підходить (межа ${правило.межа} км):`);
        // Друкуємо саме те, що відкинули: без цього «не знайдено» нічого не
        // пояснює, а ми вже двічі дізнавались правду лише з живого прогону.
        for (const c of відкинуті.slice(0, 5)) console.log(`     ⨯ ${c.км} км — ${c.підпис.slice(0, 70)}`);
        if (!відкинуті.length) console.log('     ⨯ геокодер не повернув нічого');
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
}

// Запускаємо лише коли скрипт викликали напряму: стенд імпортує з нього
// `обратиСвого`, і мережевий похід під час перевірки був би і повільним, і
// залежним від чужого сервера.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
