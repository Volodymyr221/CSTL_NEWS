// launch-film/render.mjs — ЗНІМАЄ 900 КАДРІВ РОЛИКА І СКЛЕЮЄ ЇХ У ВІДЕО.
//
// 🔑 ЧОМУ ПОКАДРОВО, А НЕ ЗАПИСОМ ЕКРАНА. Запис залежить від того, чи встигла
// машина намалювати кадр вчасно: на повільній — пропуски, на швидкій — зайві.
// Тут час НЕ йде сам: рендер ставить `seek(кадр/30)`, чекає, поки браузер
// домалює, і аж тоді знімає. Машина може думати над кадром хоч секунду —
// у відео він однаково стане рівно на своє місце.
//
// Запуск:  node launch-film/render.mjs [--preview]
//          --preview: лише ключові кадри в `preview/`, без відео (швидко).

import { chromium } from 'playwright';
import { launch, serve } from '../tests/_lib.mjs';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ТУТ = dirname(fileURLToPath(import.meta.url));
const FPS = 30;
const СЕКУНД = 30;
const КАДРІВ = FPS * СЕКУНД;
const прев = process.argv.includes('--preview');

const FRAMES = join(ТУТ, 'frames');
const PREVIEW = join(ТУТ, 'preview');
const OUT = join(ТУТ, 'out');
mkdirSync(OUT, { recursive: true });

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({
  viewport: { width: 1080, height: 1920 },
  deviceScaleFactor: 1,
  serviceWorkers: 'block',
  // 🔴 Анімації браузера тут НЕ потрібні взагалі: рух малює `seek`. Якби
  // лишились — кадр ловив би ще й їх, і рух подвоївся б.
  reducedMotion: 'reduce',
});
const p = await ctx.newPage();
p.on('pageerror', e => console.log('  [помилка сторінки]', String(e).slice(0, 160)));

await p.goto(`${url}/launch-film/film.html`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => document.documentElement.dataset.ready === '1'
  && document.documentElement.dataset.markReady === '1', null, { timeout: 30000 });
// Шрифти й світлини мусять бути ГОТОВІ до першого кадру, інакше перші секунди
// поїдуть системним шрифтом або з порожнім фоном.
await p.evaluate(() => document.fonts.ready);
await p.evaluate(() => Promise.all([...document.images]
  .filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r; }))));
await p.waitForTimeout(700);

const зняти = async (t, шлях) => {
  await p.evaluate(x => window.seek(x), t);
  // Два кадри анімації — щоб браузер точно застосував нові стилі й перемалював.
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await p.screenshot({ path: шлях, type: 'png' });
};

if (прев) {
  rmSync(PREVIEW, { recursive: true, force: true });
  mkdirSync(PREVIEW, { recursive: true });
  // Ключові моменти кожної сцени — по них видно, чи зійшлася композиція,
  // не чекаючи повного рендера.
  const мітки = [0.9, 1.9, 3.4, 4.5, 5.5, 6.4, 7.3, 9.9, 11.2, 13.1, 16.0,
                 17.2, 19.1, 21.9, 22.8, 23.4, 24.9, 26.1, 27.5, 28.2, 29.2, 29.8];
  for (const t of мітки) {
    const імя = String(t.toFixed(1)).replace('.', '_');
    await зняти(t, join(PREVIEW, `t${імя}.png`));
    console.log(`  ${t.toFixed(1)}s`);
  }
  await stop(); await b.close();
  console.log(`── ключові кадри у ${PREVIEW} ──`);
  process.exit(0);
}

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

console.log(`── знімаю ${КАДРІВ} кадрів (1080×1920, ${FPS} к/с) ──`);
const старт = Date.now();
for (let f = 0; f < КАДРІВ; f++) {
  await зняти(f / FPS, join(FRAMES, String(f).padStart(5, '0') + '.png'));
  if (f % 90 === 0 && f) {
    const сек = (Date.now() - старт) / 1000;
    console.log(`  ${f}/${КАДРІВ} · ${сек.toFixed(0)}с · лишилось ~${((сек / f) * (КАДРІВ - f)).toFixed(0)}с`);
  }
}
await stop(); await b.close();
console.log(`── знято за ${((Date.now() - старт) / 1000).toFixed(0)}с ──`);

// ── Склейка ────────────────────────────────────────────────────────────────
// yuv420p і парні розміри — обовʼязкові, інакше Instagram і Telegram покажуть
// зелений кадр або відмовляться приймати файл. 1080×1920 парні, тож питання
// лише в форматі пікселя.
const відео = join(OUT, 'cstl-life-30s-без-звуку.mp4');
console.log('── склеюю відео ──');
execFileSync('ffmpeg', ['-y', '-v', 'error',
  '-framerate', String(FPS), '-i', join(FRAMES, '%05d.png'),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  '-r', String(FPS), відео], { stdio: 'inherit' });
console.log('✅', відео);
