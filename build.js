const { execSync } = require('child_process');

try {
  execSync('node scripts/check-imports.js', { stdio: 'inherit' });
} catch (e) {
  console.error('\n❌ check-imports.js знайшов проблеми. Виправ перш ніж build.\n');
  process.exit(1);
}

// 🔴 19.08 — ПУБЛІЧНА СТОРІНКА ПОЛІТИКИ. Google Play вимагає посилання на політику
// конфіденційності, яке відкривається ЗЗОВНІ застосунку, а в нас вона жила лише в
// модалці. `privacy.html` генерується з того самого `src/core/legal.js`, тож копії
// тексту не існує і розійтись нема чому.
// ⚠️ Стоїть у збірці, а не запускається руками: сторінка, яку треба не забути
// перегенерувати, рано чи пізно відстане від документа, під яким люди дали згоду.
try {
  // `--disable-warning` точковий, а не `--no-warnings`: Node попереджає, що
  // `src/core/legal.js` не має `"type": "module"` у package.json. Поставити його
  // не можна — тоді зламається сам `build.js` (він на `require`). Попередження
  // безпечне, але засмічує журнал збірки, а засмічений журнал ховає справжні.
  execSync('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/gen_privacy.mjs',
           { stdio: 'inherit' });
} catch (e) {
  console.error('\n❌ gen_privacy.mjs не зміг згенерувати privacy.html.\n');
  process.exit(1);
}

// 🔴 16.08 — `minify: true`. Стояло `false`, і `bundle.js` важив 957 КБ сирого
// тексту — з коментарями, відступами й довгими іменами. Це найважчий файл, який
// телефон качає при КОЖНОМУ деплої (`CACHE_NAME` міняється щоразу), а аудиторія
// сидить на мобільному інтернеті.
// ⚠️ `sourcemap: true` лишається: мапа дозволяє читати помилки з проду по іменах
// вихідних файлів, а браузер її НЕ качає, поки не відкрито devtools.
// 🛑 Формат `iife` і точка входу не змінені — мініфікація не міняє поведінку коду,
//    лише його запис.
require('esbuild').buildSync({
  entryPoints: ['src/app.js'],
  bundle: true,
  outfile: 'bundle.js',
  format: 'iife',
  minify: true,
  // 🔴 16.08 — `charset: 'utf8'`. За замовчуванням esbuild ескейпить кожен
  // не-ASCII символ у `\uXXXX`, тобто КОЖНА українська літера займає 6 байт
  // замість 2. А в цьому застосунку українською написаний весь інтерфейс —
  // сотні рядків підписів, тостів і пояснень. Заміряно: 655 → 545 КБ, мінус 110 КБ
  // на порожньому місці.
  // ⚠️ Безпечно тому, що сторінка і так віддається як UTF-8 (`<meta charset>` у
  //    `index.html`), а GitHub Pages ставить `charset=utf-8` у заголовку JS.
  charset: 'utf8',
  sourcemap: true,
});
