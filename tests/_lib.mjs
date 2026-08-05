// tests/_lib.mjs — спільне для всіх стендів.
//
// НАВІЩО ЦЕЙ ФАЙЛ. Стенди писались у тимчасовій папці сесії і мали в собі
// жорстко прописані шляхи: корінь репозиторію `/home/user/CSTL_NEWS` і адресу
// браузера `/opt/pw-browsers/chromium-1194/...`. На іншій машині (чи навіть у
// наступній сесії, де номер збірки браузера інший) вони б просто не запустились.
// Тому все, що залежить від оточення, зібрано тут в одному місці.
//
// ⚠️ Історичний урок: у документах проєкту згадувались сторожі `kb-guard.test.js`
// і `kb-tapinput.test.js` — але їх НІКОЛИ не було в репозиторії. Вони жили в
// тимчасовій папці й зникли разом із сесією, а посилання на них лишились.
// Саме тому стенди тепер тут.

import { readFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { createServer } from 'http';
import { execFileSync } from 'child_process';

// Корінь репозиторію — на рівень вище за теку tests/. Ніяких абсолютних шляхів.
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Прочитати файл проєкту. З `rev` — версію з git (для порівняння «до/після»):
//   CSS_REV=<git-ish> node tests/toast.mjs
export function projectFile(relPath, rev = '') {
  return rev
    ? execFileSync('git', ['-C', ROOT, 'show', `${rev}:${relPath}`], { encoding: 'utf8', maxBuffer: 1 << 26 })
    : readFileSync(join(ROOT, relPath), 'utf8');
}

// ── Пошук браузера ───────────────────────────────────────────────────────────
// Порядок: змінна оточення → стандартна тека Playwright (номер збірки НЕ
// прибиваємо цвяхами, шукаємо будь-яку) → хай Playwright шукає сам.
export function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  let dirs = [];
  try { dirs = readdirSync(base); } catch { return undefined; }
  // ⚠️ Спершу відсіюємо `chromium_headless_shell-*`: він теж починається на «chromium»,
  // сортується ПІЗНІШЕ за звичайний, і саме його підхопила перша версія цієї функції —
  // а бінарник у нього називається інакше, тож запуск падав. Беремо повний браузер.
  const full = dirs.filter(d => /^chromium(-\d+)?$/.test(d)).sort().reverse();
  const shell = dirs.filter(d => d.startsWith('chromium_headless_shell')).sort().reverse();
  const candidates = [];
  for (const d of full) candidates.push(join(base, d, 'chrome-linux', 'chrome'), join(base, d, 'chrome'));
  for (const d of shell) candidates.push(join(base, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell'));
  for (const c of candidates) if (existsSync(c)) return c;
  return undefined;   // undefined → Playwright візьме свій вбудований
}

export async function launch(chromium) {
  const executablePath = chromiumPath();
  return chromium.launch(executablePath ? { executablePath } : {});
}

// ── Локальний сервер для стендів, що піднімають ЖИВИЙ застосунок ─────────────
// Раніше кожен такий стенд вимагав, щоб хтось руками запустив `python3 -m http.server`.
// Забув — і стенд падав із незрозумілою помилкою. Тепер він піднімає сервер сам.
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

export async function serve() {
  const server = createServer((req, res) => {
    const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = resolve(ROOT, rel);
    // Не віддаємо нічого поза коренем проєкту.
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    const ext = file.slice(file.lastIndexOf('.'));
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, stop: () => new Promise(r => server.close(r)) };
}

// Мережа назовні в стендах не потрібна — глушимо, щоб не чекати таймаутів.
export async function blockExternal(page) {
  await page.route('**://*.supabase.co/**', r => r.abort());
  await page.route('**://api.open-meteo.com/**', r => r.abort());
}

// ── Однаковий звіт у всіх стендах ────────────────────────────────────────────
export function reporter() {
  const res = [];
  const ok = (name, cond, info = '') => {
    res.push(!!cond);
    console.log(`${cond ? '✅' : '❌'} ${name}${info ? '  — ' + info : ''}`);
    return !!cond;
  };
  const done = () => {
    const bad = res.filter(r => !r).length;
    console.log(`\n${bad ? '❌' : '✅'} ${res.length - bad}/${res.length} перевірок пройдено`);
    process.exit(bad ? 1 : 0);
  };
  return { ok, done, res };
}

// 🆕 05.08 — СТИЛІ ЗОНИ «ГРОМАДА + ДОШКА» ОДНИМ РЯДКОМ.
//
// 🔴 Навіщо окремий хелпер, а не `projectFile('style/community.css')`.
// До 05.08 стилі Дошки жили в `community.css` (68% його селекторів), і пʼять
// стендів шукали правила Дошки саме там — за ІМЕНЕМ файлу. Щойно стилі
// винесли в `style/board.css`, усі пʼять впали, хоча жодне правило не
// змінилось: вони перевіряли не стилі, а місце їх зберігання.
//
// 🔑 Урок той самий, що з демо-фолбеком і зі сценою `board-cream`: перевірка
// має триматись за ПОВЕДІНКУ, а не за випадкову обставину. Тепер стенд питає
// «що каже CSS цієї зони», і йому байдуже, у скількох файлах воно лежить.
// Додаси третій файл зони — допишеш його сюди, і жоден стенд не зміниться.
export function zoneCss(rev = '') {
  return ['style/community.css', 'style/board.css']
    .map(f => projectFile(f, rev))
    .join('\n');
}
