// src/core/dev-code.js
// КОД РОЗРОБНИКА: нормалізація + повільний хеш. ОДНЕ місце правди.
//
// НАВІЩО ОКРЕМИЙ ФАЙЛ, а не все в `dev-lock.js`: цей модуль **не імпортує нічого**.
// Саме тому його може підняти живим ES-імпортом і стенд, і інструмент підрахунку
// хешу (`tests/tools/dev-code-hash.mjs`) — тобто хеш рахує РІВНО той самий код,
// який потім його перевіряє. Якби нормалізація існувала у двох копіях (одна в
// застосунку, друга в скрипті), вони б колись розійшлись, і симптом виглядав би як
// «код правильний, а не пускає» — найгірший з можливих. У цьому проєкті дві копії
// вже одного разу розійшлись (списки антиспаму), тому тут — одна.

// Сіль проти готових таблиць хешів. Секретом НЕ є: вона в публічному `bundle.js`,
// її робота — зробити марними наперед пораховані таблиці, а не приховати код.
export const CODE_SALT = 'cstl-dev-lock-2026-07';

// Ціна ОДНОЇ спроби підбору. Для людини це ~0.1-0.3с один раз при вході; для
// перебирача — та сама затримка на кожну з мільйонів спроб.
// ⚠️ Міняєш це число — усі раніше пораховані хеші стають недійсними.
export const CODE_ITERATIONS = 200000;

// Нормалізація: обрізаємо краї, кілька пробілів схлопуємо в один, регістр — нижній.
// Регістр зводимо свідомо: код набирають на телефоні, де автовелика літера псує все.
// Ціна — менша ентропія, тому код мусить бути ДОВШИМ (12+ символів).
export function normalizeDevCode(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function hex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// PBKDF2-SHA256 → 256 біт у hex. Повертає null, якщо `crypto.subtle` недоступний
// (незахищений контекст) — тоді замок лишається зачиненим, а не відкривається.
export async function devCodeHash(raw) {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(normalizeDevCode(raw)),
    'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(CODE_SALT), iterations: CODE_ITERATIONS, hash: 'SHA-256' },
    key, 256);
  return hex(bits);
}
