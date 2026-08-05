// src/core/settlements-geo.js
// КООРДИНАТИ НАСЕЛЕНИХ ПУНКТІВ для погоди.
//
// Замовлення Вови (05.08): «щоб при натиску можна було вибрати список сіл, міст
// Олицької громади, щоб вибрати і подивитись погоду… І плюс Луцьк».
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ГОЛОВНЕ: КООРДИНАТ СІЛ У ПРОЄКТІ НЕ БУЛО ЖОДНИХ.
// `settlements.js` знає 17 назв, зупинки автобусів мають лише кілометраж.
// Вписати числа «з голови» тут не можна: хибні координати означають хибну
// погоду реальним людям — це не косметична помилка, а брехня в даних.
//
// Тому координати беруться в такому порядку, і кожен наступний крок потрібен
// лише тоді, коли попередній нічого не дав:
//
//   1. SEED  — те, що вже є в проєкті й перевірене продом (Олика).
//   2. ФАЙЛ  — `data/settlements-geo.json`, якщо він згенерований
//              (`scripts/geocode-settlements.mjs`). Файл НЕ обовʼязковий:
//              немає — просто йдемо далі, нічого не ламається.
//   3. КЕШ   — те, що вже з'ясували на цьому телефоні (localStorage).
//   4. NOMINATIM — прямий геокод «назва, Волинська область, Україна».
//              Результат одразу лягає в кеш, тож звертання разове на село.
//
// ⚠️ ЧОМУ ЗАЛЕЖНІСТЬ ВІД МЕРЕЖІ ТУТ НЕ Є НОВОЮ ПРОБЛЕМОЮ: погоду й так неможливо
// показати офлайн — вона приходить з Open-Meteo. Тобто геокод не додає нового
// класу залежності, він живе в тому ж запиті, що й сама погода.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔬 ЧЕСНО ПРО ТЕ, ЧОГО ЦЕЙ СЕЛЕКТОР НЕ ДАСТЬ (сказано Вові до роботи)
// Прогнозні моделі мають сітку близько 7-11 км, а вся Олицька громада — це
// приблизно 15-20 км упоперек. Тобто більшість сіл потраплять в одну-дві
// клітинки моделі й покажуть ОДНАКОВІ числа. Луцьк (~30 км) відрізняється
// помітніше. Це не робить підпис нечесним: «Олика» лишається правдою і тоді,
// коли в Дерні стільки ж градусів. Але очікувати різних температур по селах
// не варто.

import { SETTLEMENTS } from './settlements.js';
import { OLYKA_COORDS } from './utils.js';

// Міста поруч — не входять у громаду, тому окремою групою у списку.
// Луцьк доданий на пряме прохання Вови («І плюс Луцьк»).
export const NEARBY_CITIES = ['Луцьк'];

// Перевірене продом. Свідомо ОДИН запис: решту чесніше з'ясувати геокодером,
// ніж вписати по пам'яті.
const SEED = { 'Олика': { ...OLYKA_COORDS } };

const CACHE_KEY = 'wx_geo_v1';
const GEO_FILE  = './data/settlements-geo.json';

// Файл читаємо один раз за сесію. `null` = ще не пробували, `{}` = пробували і не вийшло.
let _filePromise = null;

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); }
  catch { return {}; }
}

function writeCache(name, c) {
  try {
    const all = readCache();
    all[name] = c;
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch { /* приватний режим або переповнене сховище — не критично */ }
}

function loadFile() {
  if (_filePromise) return _filePromise;
  _filePromise = fetch(GEO_FILE)
    .then(r => (r.ok ? r.json() : {}))
    .then(d => (d && typeof d === 'object' ? (d.coords || d) : {}))
    .catch(() => ({}));   // файлу немає — це штатний стан, не помилка
  return _filePromise;
}

// Пряме геокодування: назва → координати. `limit=1` бо нас цікавить один пункт.
// ⚠️ Уточнення «Волинська область, Україна» обовʼязкове: сіл із назвами на
// кшталт «Ставок» чи «Котів» в Україні кілька, і без області геокодер міг би
// віддати чуже село за сотні кілометрів — тобто чужу погоду під нашим підписом.
async function geocode(name) {
  const q = encodeURIComponent(`${name}, Волинська область, Україна`);
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
    { headers: { 'Accept-Language': 'uk' } }
  );
  const arr = await res.json();
  const hit = Array.isArray(arr) ? arr[0] : null;
  if (!hit) return null;
  const lat = parseFloat(hit.lat), lon = parseFloat(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

// Координати населеного пункту або `null`, якщо з'ясувати не вдалося.
// 🔴 Саме `null`, а не «підставимо Олику»: мовчазна підміна показала б людині
// погоду іншого місця під назвою її села. Краще чесно сказати, що не вийшло.
export async function coordsOf(name) {
  if (SEED[name]) return SEED[name];

  const cached = readCache()[name];
  if (cached && Number.isFinite(cached.lat)) return cached;

  const file = await loadFile();
  if (file[name] && Number.isFinite(file[name].lat)) {
    writeCache(name, file[name]);
    return file[name];
  }

  try {
    const c = await Promise.race([
      geocode(name),
      // Той самий запобіжник, що для назви міста в погоді: чужий сервіс не має
      // права підвісити інтерфейс назавжди.
      new Promise(r => setTimeout(() => r(null), 6000)),
    ]);
    if (c) { writeCache(name, c); return c; }
  } catch { /* нижче — null */ }
  return null;
}

// Групи для нижньої шторки. Порядок і склад — те, що просив Вова:
// спершу громада, окремо «міста поруч» з Луцьком.
export function locationGroups() {
  return [
    { title: 'Олицька громада', items: SETTLEMENTS },
    { title: 'Міста поруч',     items: NEARBY_CITIES },
  ];
}

// Чи є назва «нашою» (є у списках) — щоб не намагатись геокодувати сміття
// зі старого localStorage після перейменувань.
export function isKnownPlace(name) {
  return SETTLEMENTS.includes(name) || NEARBY_CITIES.includes(name);
}
