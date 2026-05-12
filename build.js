const { execSync } = require('child_process');

try {
  execSync('node scripts/check-imports.js', { stdio: 'inherit' });
} catch (e) {
  console.error('\n❌ check-imports.js знайшов проблеми. Виправ перш ніж build.\n');
  process.exit(1);
}

require('esbuild').buildSync({
  entryPoints: ['src/app.js'],
  bundle: true,
  outfile: 'bundle.js',
  format: 'iife',
  minify: false,
  sourcemap: true,
});
