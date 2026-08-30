// src/core/qr.js
// ГЕНЕРАТОР QR-КОДУ (QR code — квадратний штрихкод, який читає камера телефону).
//
// НАВІЩО (Вова 29.08): на компʼютері застосунок не працює, тож людині показуємо
// екран «поки що тільки телефон» і код, який відкриє САМЕ ТУ сторінку на телефоні.
//
// 🔴 ЧОМУ ГЕНЕРУЄМО В БРАУЗЕРІ, А НЕ КЛАДЕМО ГОТОВУ КАРТИНКУ.
// Готовий малюнок умів би вести лише на головну. А посилання в нас мають адресу
// (`#/post/news/123`), і людина, яка прийшла з месенджера по конкретну статтю,
// після сканування мусить потрапити НА ЦЮ СТАТТЮ, а не шукати її заново. Тобто
// адреса змінна — отже код малюється на місці. Вибір зроблений свідомо: статичний
// файл коштував би 0 рядків, але втрачав би саме ту людину, заради якої екран і є.
//
// 🛑 ЧОМУ НЕ БІБЛІОТЕКА З МЕРЕЖІ. Застосунок — PWA (Progressive Web App —
// сайт, що ставиться на телефон як додаток) і мусить працювати офлайн; сторонній
// скрипт із чужого домену це ламає, а заразом додає третю сторону, яка бачить
// наших відвідувачів. Тому кодувальник свій, у бандлі.
//
// ⚠️ ЧЕСНО ПРО ОБСЯГ: тут реалізовано рівно те, що нам потрібно, і ні краплі
// більше — **байтовий режим** (будь-який текст у UTF-8), рівень корекції **M**
// (~15% пошкоджень) і **версії 1-10** (до 213 байтів). Довша адреса за 213 байтів
// у нас не буває; якщо колись трапиться, `qrMatrix` кине помилку, а не намалює
// зіпсований код — краще чесно нічого, ніж код, який не сканується.
//
// 📐 ЯК ЦЕ ПЕРЕВІРЕНО: `tests/qr.mjs` порівнює нашу матрицю з еталонною
// (незалежна реалізація) точка-в-точку і додатково ЧИТАЄ код назад — знімає
// маску, дістає біти в тому самому порядку і звіряє рядок. Тобто перевіряється
// не «щось намалювалось», а «камера прочитає саме те, що ми закодували».

// ── АРИФМЕТИКА ГАЛУА GF(256) ─────────────────────────────────────────────────
// Корекція помилок Ріда-Соломона рахується не у звичайних числах, а в полі з 256
// елементів: додавання — це XOR, множення — через таблиці логарифмів. Многочлен
// поля 0x11D — той, що записаний у стандарті QR.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function buildTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  // Друга половина — копія першої, щоб множення не рахувало залишок від 255.
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

// Многочлен-генератор для `n` байтів корекції: (x-α⁰)(x-α¹)…(x-αⁿ⁻¹).
function rsGenerator(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

// Байти корекції для одного блоку даних — залишок від ділення на генератор.
function rsEncode(data, ecLen) {
  const gen = rsGenerator(ecLen);
  const res = new Array(ecLen).fill(0);
  for (const byte of data) {
    const factor = byte ^ res[0];
    res.shift();
    res.push(0);
    if (factor !== 0) {
      for (let i = 0; i < ecLen; i++) res[i] ^= gfMul(gen[i + 1], factor);
    }
  }
  return res;
}

// ── ТАБЛИЦІ ВЕРСІЙ (рівень корекції M) ───────────────────────────────────────
// `total` — усього байтів у коді; `ec` — байтів корекції НА БЛОК; `blocks` —
// [скільки блоків, байтів даних у кожному]; `align` — координати вирівнювальних
// квадратиків. Числа взяті зі стандарту ISO/IEC 18004, таблиці 9 і E.1.
// 🔑 Сторож звіряє їх арифметикою: блоки×(дані+корекція) мусить дорівнювати `total`.
const VERSIONS = {
  1:  { total: 26,  ec: 10, blocks: [[1, 16]],          align: [] },
  2:  { total: 44,  ec: 16, blocks: [[1, 28]],          align: [6, 18] },
  3:  { total: 70,  ec: 26, blocks: [[1, 44]],          align: [6, 22] },
  4:  { total: 100, ec: 18, blocks: [[2, 32]],          align: [6, 26] },
  5:  { total: 134, ec: 24, blocks: [[2, 43]],          align: [6, 30] },
  6:  { total: 172, ec: 16, blocks: [[4, 27]],          align: [6, 34] },
  7:  { total: 196, ec: 18, blocks: [[4, 31]],          align: [6, 22, 38] },
  8:  { total: 242, ec: 22, blocks: [[2, 38], [2, 39]], align: [6, 24, 42] },
  9:  { total: 292, ec: 22, blocks: [[3, 36], [2, 37]], align: [6, 26, 46] },
  10: { total: 346, ec: 26, blocks: [[4, 43], [1, 44]], align: [6, 28, 50] },
};

// Зайві біти в кінці, які стандарт вимагає дописати нулями (таблиця 1 стандарту).
// Для версій 2-6 їх сім, для решти наших — нуль.
function remainderBits(version) {
  return version >= 2 && version <= 6 ? 7 : 0;
}

// Інформація про версію — 18 бітів, які малюються лише з версії 7. Значення з
// таблиці D.1 стандарту; рахувати їх на місці не варто, у стандарті вони готові.
const VERSION_INFO = { 7: 0x07c94, 8: 0x085bc, 9: 0x09a99, 10: 0x0a4d3 };

// Скільки байтів даних вміщає версія (сума по блоках).
function dataCapacity(version) {
  const v = VERSIONS[version];
  return v.blocks.reduce((sum, [count, len]) => sum + count * len, 0);
}

// ── БІТОВИЙ ПОТІК ────────────────────────────────────────────────────────────
class BitBuffer {
  constructor() { this.bits = []; }
  put(value, length) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >> i) & 1);
  }
  get length() { return this.bits.length; }
  toBytes() {
    const out = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | (this.bits[i + j] || 0);
      out.push(byte);
    }
    return out;
  }
}

// ── ЗБІРКА БАЙТІВ КОДУ ───────────────────────────────────────────────────────
function encodeData(bytes, version) {
  const buf = new BitBuffer();
  buf.put(0b0100, 4);                                  // режим «байти»
  buf.put(bytes.length, version >= 10 ? 16 : 8);       // довжина: з версії 10 — 16 бітів
  for (const b of bytes) buf.put(b, 8);

  const capacityBits = dataCapacity(version) * 8;
  // Термінатор — до чотирьох нулів, але не більше, ніж лишилось місця.
  buf.put(0, Math.min(4, capacityBits - buf.length));
  while (buf.length % 8 !== 0) buf.put(0, 1);
  // Добивка стандартними байтами, поки блок не заповнений.
  const pad = [0xec, 0x11];
  for (let i = 0; buf.length < capacityBits; i++) buf.put(pad[i % 2], 8);

  return buf.toBytes();
}

// Перемішування (interleaving): байти блоків ідуть не підряд, а по колонках —
// спершу перші байти всіх блоків, потім другі й так далі. Це рознесення робить
// корекцію стійкою до однієї великої подряпини замість багатьох дрібних.
function interleave(dataBytes, version) {
  const v = VERSIONS[version];
  const blocks = [];
  let offset = 0;
  for (const [count, len] of v.blocks) {
    for (let i = 0; i < count; i++) {
      blocks.push(dataBytes.slice(offset, offset + len));
      offset += len;
    }
  }
  const ecBlocks = blocks.map(b => rsEncode(b, v.ec));

  const out = [];
  const maxData = Math.max(...blocks.map(b => b.length));
  for (let i = 0; i < maxData; i++) {
    for (const b of blocks) if (i < b.length) out.push(b[i]);
  }
  for (let i = 0; i < v.ec; i++) {
    for (const b of ecBlocks) out.push(b[i]);
  }
  return out;
}

// ── КАРКАС КОДУ (службові квадратики) ────────────────────────────────────────
// `mod` — самі точки (0/1), `fixed` — позначка «сюди дані не кладемо».
function buildFrame(version) {
  const size = 17 + version * 4;
  const mod = Array.from({ length: size }, () => new Uint8Array(size));
  const fixed = Array.from({ length: size }, () => new Uint8Array(size));

  const set = (r, c, val) => { mod[r][c] = val; fixed[r][c] = 1; };

  // Три великі квадрати в кутах — по них камера знаходить код і його поворот.
  const finder = (top, left) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = top + r, cc = left + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6))
                    || (c >= 0 && c <= 6 && (r === 0 || r === 6));
        const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        set(rr, cc, inRing || inCore ? 1 : 0);   // «-1» і «7» — світла рамка навколо
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  // Пунктирні лінії між кутами — по них камера міряє крок сітки.
  for (let i = 8; i < size - 8; i++) {
    set(6, i, i % 2 === 0 ? 1 : 0);
    set(i, 6, i % 2 === 0 ? 1 : 0);
  }

  // Дрібні квадратики вирівнювання — тримають сітку на вигнутому папері/екрані.
  const coords = VERSIONS[version].align;
  for (const r of coords) {
    for (const c of coords) {
      // Пропускаємо ті, що накрили б кутові квадрати.
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const ring = Math.max(Math.abs(dr), Math.abs(dc));
          set(r + dr, c + dc, ring === 1 ? 0 : 1);
        }
      }
    }
  }

  // Місця під службові біти (рівень корекції + маска) — заповнимо пізніше.
  for (let i = 0; i < 9; i++) {
    if (i !== 6) { fixed[8][i] = 1; fixed[i][8] = 1; }
  }
  for (let i = 0; i < 8; i++) {
    fixed[8][size - 1 - i] = 1;
    fixed[size - 1 - i][8] = 1;
  }
  set(size - 8, 8, 1);   // завжди темна точка — так каже стандарт

  // Інформація про версію (з 7-ї) — два блоки 6×3 біля лівого нижнього і
  // правого верхнього кутів.
  if (version >= 7) {
    const info = VERSION_INFO[version];
    for (let i = 0; i < 18; i++) {
      const bit = (info >> i) & 1;
      const r = Math.floor(i / 3), c = i % 3;
      set(size - 11 + c, r, bit);
      set(r, size - 11 + c, bit);
    }
  }

  return { size, mod, fixed };
}

// ── СЛУЖБОВІ БІТИ ФОРМАТУ ────────────────────────────────────────────────────
// 15 бітів: 2 біти рівня корекції + 3 біти маски + код БЧХ, зверху маска 0x5412.
// Рівень M — це `0b00`.
function formatBits(mask) {
  const data = (0b00 << 3) | mask;
  let rem = data << 10;
  for (let i = 4; i >= 0; i--) {
    if ((rem >> (i + 10)) & 1) rem ^= 0b10100110111 << i;
  }
  return ((data << 10) | rem) ^ 0b101010000010010;
}

function placeFormat(mod, size, mask) {
  const bits = formatBits(mask);
  const at = i => (bits >> i) & 1;
  // Копія 1 — навколо лівого верхнього квадрата: спершу колонка вниз, потім
  // рядок уліво. 🛑 Порядок «рядок/колонка» тут переплутати найлегше, і саме на
  // цьому перша версія цього файлу й спіймалась: код виглядав правильним, а
  // розходився з еталоном рівно на девʼять точок формату.
  for (let i = 0; i <= 5; i++) mod[i][8] = at(i);
  mod[7][8] = at(6);
  mod[8][8] = at(7);
  mod[8][7] = at(8);
  for (let i = 9; i <= 14; i++) mod[8][14 - i] = at(i);
  // Копія 2 — щоб код читався навіть із пошкодженим кутом.
  for (let i = 0; i <= 7; i++) mod[8][size - 1 - i] = at(i);
  for (let i = 8; i <= 14; i++) mod[size - 15 + i][8] = at(i);
}

// ── РОЗКЛАДАННЯ ДАНИХ ────────────────────────────────────────────────────────
// Біти йдуть змійкою по двоколонках справа наліво, знизу вгору і назад.
// Шоста колонка пропускається — там пунктирна лінія.
function placeData(mod, fixed, size, bytes) {
  let bitIndex = 0;
  const nextBit = () => {
    const byte = bytes[bitIndex >> 3];
    const bit = byte === undefined ? 0 : (byte >> (7 - (bitIndex & 7))) & 1;
    bitIndex++;
    return bit;
  };

  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (const col of [right, right - 1]) {
        if (fixed[row][col]) continue;
        mod[row][col] = nextBit();
      }
    }
    upward = !upward;
  }
}

// ── МАСКИ ────────────────────────────────────────────────────────────────────
// Маска інвертує частину точок за формулою, щоб у коді не виникло великих
// однотонних плям і хибних «кутових квадратів». Стандарт дає вісім формул;
// беремо ту, що дала найменший штраф.
const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(mod, fixed, size, mask) {
  const fn = MASKS[mask];
  const out = mod.map(row => Uint8Array.from(row));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!fixed[r][c] && fn(r, c)) out[r][c] ^= 1;
    }
  }
  return out;
}

// Чотири правила штрафу зі стандарту (розділ 8.8.2).
function penalty(mod, size) {
  let score = 0;

  // 1. Довгі однотонні смуги.
  for (let i = 0; i < size; i++) {
    for (const horizontal of [true, false]) {
      let run = 1;
      for (let j = 1; j < size; j++) {
        const cur = horizontal ? mod[i][j] : mod[j][i];
        const prev = horizontal ? mod[i][j - 1] : mod[j - 1][i];
        if (cur === prev) {
          run++;
        } else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      if (run >= 5) score += run - 2;
    }
  }

  // 2. Однотонні квадрати 2×2.
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = mod[r][c];
      if (v === mod[r][c + 1] && v === mod[r + 1][c] && v === mod[r + 1][c + 1]) score += 3;
    }
  }

  // 3. Візерунок, схожий на кутовий квадрат (1:1:3:1:1 зі світлою зоною).
  const A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const matches = (get, start) => {
    let a = true, b = true;
    for (let k = 0; k < 11; k++) {
      const v = get(start + k);
      if (v !== A[k]) a = false;
      if (v !== B[k]) b = false;
    }
    return a || b;
  };
  for (let i = 0; i < size; i++) {
    for (let j = 0; j + 11 <= size; j++) {
      if (matches(k => mod[i][k], j)) score += 40;
      if (matches(k => mod[k][i], j)) score += 40;
    }
  }

  // 4. Перекіс балансу темного і світлого.
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += mod[r][c];
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

// ── ГОЛОВНА ФУНКЦІЯ ──────────────────────────────────────────────────────────
/**
 * Матриця QR-коду для тексту. Повертає `{ size, modules }`, де `modules[r][c]`
 * дорівнює 1 для темної точки.
 * 🛑 Кидає помилку, якщо текст не влазить у версію 10 — краще нічого, ніж код,
 * який не сканується.
 */
export function qrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text)));

  let version = 0;
  for (let v = 1; v <= 10; v++) {
    // 4 біти режиму + 8/16 бітів довжини + самі байти.
    const headerBytes = v >= 10 ? 3 : 2;
    if (bytes.length + headerBytes <= dataCapacity(v)) { version = v; break; }
  }
  if (!version) throw new Error('QR: текст задовгий (більше 213 байтів)');

  const codewords = interleave(encodeData(bytes, version), version);
  const { size, mod, fixed } = buildFrame(version);
  placeData(mod, fixed, size, codewords);

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = applyMask(mod, fixed, size, mask);
    placeFormat(candidate, size, mask);
    const score = penalty(candidate, size);
    if (!best || score < best.score) best = { score, modules: candidate, mask };
  }

  return { size, modules: best.modules, version, mask: best.mask };
}

/**
 * Готовий SVG-рядок (векторна картинка) з QR-кодом.
 * `quiet` — світле поле навколо коду; без нього камера не бачить меж, і
 * стандарт вимагає рівно чотири точки.
 */
export function qrSvg(text, { quiet = 4, dark = '#111111', light = '#ffffff', label = '' } = {}) {
  const { size, modules } = qrMatrix(text);
  const full = size + quiet * 2;

  // Малюємо не кожну точку окремо, а суцільні відрізки в рядку: у коді на 45
  // точок це різниця між ~900 і ~250 фігурами, тобто вчетверо легша картинка.
  let path = '';
  for (let r = 0; r < size; r++) {
    let run = 0;
    for (let c = 0; c <= size; c++) {
      const onDark = c < size && modules[r][c] === 1;
      if (onDark) { run++; continue; }
      if (run) {
        path += `M${c - run + quiet} ${r + quiet}h${run}v1h-${run}z`;
        run = 0;
      }
    }
  }

  const title = label ? `<title>${label}</title>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" `
       + `shape-rendering="crispEdges" role="img" aria-hidden="${label ? 'false' : 'true'}">`
       + title
       + `<rect width="${full}" height="${full}" fill="${light}"/>`
       + `<path d="${path}" fill="${dark}"/>`
       + `</svg>`;
}
