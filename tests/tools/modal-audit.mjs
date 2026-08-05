// tests/tools/modal-audit.mjs — ІНВЕНТАРИЗАЦІЯ МОДАЛОК: колір поверхні і шрифт.
//
// Замовлення Вови (05.08): «бежевий колір і шрифт у кожній модалці по-різному.
// Ми вже відійшли від того кольору, а він ще зберігається. Пройдися по всіх
// вкладках, усіх модалках, стандартизуй увесь колір та шрифт».
//
// Не стенд — інструмент виміру. Нічого не «падає», лише показує список.
//
// 🔬 ЩО САМЕ МІРЯЄМО І ЧОМУ ТАК
// «Теплота» = R − B обчисленого кольору. Це той самий критерій, яким уже працює
// сторож Дошки `tests/board-cream.mjs`: нейтральний сірий/білий має R−B ≤ 3,
// а найслабший кремовий проєкту (`#FAF8EF`) дає **+11**. Тобто теплоту видно
// числом, а не оком — і її не обійде новий hex із іншою назвою.
//
// ⚠️ Розбираємо CSS ТЕКСТОМ, а не відкриваємо кожну модалку браузером, і це
// свідомо: більшість модалок потребує даних Supabase, якого в пісочниці немає,
// тож «жива» перевірка охопила б третину списку і створила б хибне враження
// повноти. Тут краще повний список правил, ніж половина живих екранів.
//
// Запуск: node tests/tools/modal-audit.mjs

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { ROOT } from '../_lib.mjs';

const STYLE = join(ROOT, 'style');
const files = readdirSync(STYLE).filter(f => f.endsWith('.css'));

// ── Токени з :root, щоб розкрити var(...) до справжнього значення ─────────────
const all = files.map(f => ({ f, css: readFileSync(join(STYLE, f), 'utf8') }));
const tokens = {};
for (const { css } of all) {
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
    const v = m[2].trim();
    if (!(m[1] in tokens)) tokens[m[1]] = v;
  }
}
function resolve(v, depth = 0) {
  if (depth > 6 || !v) return v;
  const m = v.match(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/);
  if (!m) return v.trim();
  const next = tokens[m[1]] ?? m[2] ?? '';
  return resolve(v.replace(m[0], next), depth + 1);
}

// ── Теплота кольору ──────────────────────────────────────────────────────────
function firstHex(v) {
  const m = String(v).match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), hex: '#' + h.toUpperCase() };
}
const warmth = c => (c ? c.r - c.b : null);

// ── Правила, що стосуються модалок/аркушів ───────────────────────────────────
// Список навмисно широкий: у проєкті модалки звуться і `app-modal`, і `-sheet`,
// і `-modal`, і власними іменами екранів. Вузький фільтр показав би менше
// розбіжностей, ніж їх є, — тобто збрехав би в приємний бік.
const MODALISH = /(app-modal|-sheet\b|sheet-|modal|-mod\b|popup|dialog|overlay|drawer)/i;

const surfaces = [];   // {file, sel, prop, raw, val, hex, warm}
const fonts = [];      // {file, sel, val}

for (const { f, css } of all) {
  // Дуже простий розбір: селектор { тіло }. Медіа-блоки не розкриваємо — нам
  // потрібні самі оголошення, а не їхні умови.
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim().replace(/\s+/g, ' ');
    if (sel.startsWith('@') || !MODALISH.test(sel)) continue;
    const body = m[2];
    for (const d of body.split(';')) {
      const i = d.indexOf(':');
      if (i < 0) continue;
      const prop = d.slice(0, i).trim();
      const raw = d.slice(i + 1).trim();
      if (!raw) continue;
      if (prop === 'background' || prop === 'background-color') {
        const val = resolve(raw);
        const hex = firstHex(val);
        surfaces.push({ f, sel, prop, raw, val, hex, warm: warmth(hex) });
      }
      if (prop === 'font-family') fonts.push({ f, sel, val: raw });
    }
  }
}

// ── Друк ─────────────────────────────────────────────────────────────────────
console.log('\n╔══ АУДИТ МОДАЛОК — поверхні і шрифти ══════════════════════════════\n');

const withHex = surfaces.filter(s => s.hex);
const warm = withHex.filter(s => s.warm > 3).sort((a, b) => b.warm - a.warm);
const neutral = withHex.filter(s => s.warm <= 3);

console.log(`▸ ПОВЕРХОНЬ ЗНАЙДЕНО: ${surfaces.length} (з них із визначеним кольором ${withHex.length})`);
console.log(`  теплих (R−B > 3): ${warm.length}   ·   нейтральних: ${neutral.length}\n`);

console.log('▸ 🔴 ТЕПЛІ ПОВЕРХНІ — саме той «бежевий», від якого відійшли');
console.log('  теплота | колір    | файл                | селектор');
console.log('  ' + '─'.repeat(94));
for (const s of warm) {
  console.log(`  +${String(s.warm).padStart(6)} | ${s.hex.hex.padEnd(8)} | ${s.f.padEnd(19)} | ${s.sel.slice(0, 52)}`);
}

// Скільки РІЗНИХ теплих значень — це і є «в кожній модалці по-різному».
const distinct = [...new Set(warm.map(s => s.hex.hex))];
console.log(`\n  ➡️ різних теплих значень: ${distinct.length} — ${distinct.join(' · ')}`);

console.log('\n▸ ШРИФТИ В МОДАЛКАХ');
const byFont = {};
fonts.forEach(x => { (byFont[x.val] ||= []).push(`${x.f}: ${x.sel.slice(0, 44)}`); });
for (const [val, where] of Object.entries(byFont)) {
  console.log(`  ${val}`);
  where.forEach(w => console.log(`      ${w}`));
}

console.log('\n▸ ЗМІННІ, ЩО НЕСУТЬ ТЕПЛОТУ (корінь, а не наслідок)');
for (const [k, v] of Object.entries(tokens)) {
  const hex = firstHex(resolve(v));
  if (!hex) continue;
  const w = warmth(hex);
  if (w > 3) console.log(`  ${k.padEnd(16)} ${hex.hex}  теплота +${w}`);
}
console.log('');
