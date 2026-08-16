const { execSync } = require('child_process');

try {
  execSync('node scripts/check-imports.js', { stdio: 'inherit' });
} catch (e) {
  console.error('\n❌ check-imports.js знайшов проблеми. Виправ перш ніж build.\n');
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
