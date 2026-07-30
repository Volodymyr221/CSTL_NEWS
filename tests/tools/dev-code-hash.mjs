// Інструмент (запускається руками): порахувати хеш КОДУ РОЗРОБНИКА для заслінки.
//
//   node tests/tools/dev-code-hash.mjs 'мій-довгий-код'
//
// Друкує рядок, який треба вставити у `ALLOWED_CODE_PBKDF2` (`src/core/dev-lock.js`).
//
// 🔴 ЧОМУ ЦЕ БРАУЗЕРНИЙ ІНСТРУМЕНТ, А НЕ ЗВИЧАЙНИЙ NODE-СКРИПТ.
// Хеш мусить порахувати РІВНО той код, який потім його перевіряє. Node-скрипт із
// власним PBKDF2 був би ДРУГОЮ копією нормалізації й параметрів — а коли дві копії
// розходяться, симптом виглядає як «код правильний, а не пускає». У цьому проєкті
// дві копії вже одного разу розійшлись (списки антиспаму). Тому інструмент піднімає
// Chromium і живим ES-імпортом бере `src/core/dev-code.js` — той самий модуль, що
// працює в застосунку. Він нічого не імпортує, тому підіймається без застосунку.
//
// ⚠️ Код НЕ друкується у вивід і нікуди не пишеться — лише його хеш.
// ⚠️ PBKDF2 навмисно повільний, тому один прогін триває ~1-2 секунди. Так і має бути.
import { chromium } from 'playwright';
import { launch, serve } from '../_lib.mjs';

const code = process.argv[2];
if (!code) {
  console.log('Використання: node tests/tools/dev-code-hash.mjs \'мій-довгий-код\'');
  console.log('Порада: 12+ символів, не словникове слово — хеш лежить у публічному bundle.js.');
  process.exit(1);
}

const { url, stop } = await serve();
const browser = await launch(chromium);
const page = await browser.newPage();
// Сторінка потрібна лише як «захищений контекст» для crypto.subtle (127.0.0.1 годиться).
await page.goto(url + '/', { waitUntil: 'domcontentloaded' });

const out = await page.evaluate(async ([base, secret]) => {
  const m = await import(base + '/src/core/dev-code.js');
  return {
    hash: await m.devCodeHash(secret),
    normalized: m.normalizeDevCode(secret),
    iterations: m.CODE_ITERATIONS,
    salt: m.CODE_SALT,
  };
}, [url, code]);

await browser.close();
await stop();

if (!out.hash) { console.log('❌ crypto.subtle недоступний — хеш не порахувати'); process.exit(1); }

console.log('\nВстав цей рядок у ALLOWED_CODE_PBKDF2 (src/core/dev-lock.js):\n');
console.log(`  '${out.hash}',`);
console.log(`\nПараметри: PBKDF2-SHA256, ${out.iterations} повторів, сіль '${out.salt}'.`);
console.log(`Довжина коду після нормалізації: ${out.normalized.length} симв.`
  + (out.normalized.length < 12 ? '  ⚠️ КОРОТКО — 12+ надійніше, хеш лежить у публічному bundle.js' : ''));
